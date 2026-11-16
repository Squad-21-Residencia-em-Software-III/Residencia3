import { db } from '../config/database';
import { PERFIS_ANALISAM_TODAS } from '../constants/unidades';
import { AppError } from '../errors/AppError';
import {
  auditoriaModel,
  MODULOS_AUDITORIA,
} from '../models/auditoriaModel';
import {
  solicitacaoViagemModel,
  type SolicitacaoViagem,
  type SolicitacaoViagemDetalhada,
  type SolicitacaoViagemDoSolicitante,
} from '../models/solicitacaoViagemModel';
import { unidadeModel } from '../models/unidadeModel';
import type { Usuario } from '../models/usuarioModel';
import type {
  CriarSolicitacaoViagemInput,
  ListarSolicitacoesViagemInput,
} from '../validators/solicitacaoViagemSchemas';
import type { ListaPaginada } from './usuarioService';

type Analista = Pick<Usuario, 'id' | 'perfil'>;

const TAMANHO_MAXIMO_MOTIVO = 200;

function paginar<T>(
  resultado: { dados: T[]; total: number },
  filtros: Pick<ListarSolicitacoesViagemInput, 'pagina' | 'limite'>
): ListaPaginada<T> {
  return {
    dados: resultado.dados,
    paginacao: {
      pagina: filtros.pagina,
      limite: filtros.limite,
      total: resultado.total,
      totalPaginas: Math.ceil(resultado.total / filtros.limite),
    },
  };
}

function normalizarMotivoRecusa(motivo: string): string {
  if (typeof motivo !== 'string') {
    throw new AppError('Informe o motivo da recusa', 400);
  }

  const motivoLimpo = motivo.trim();

  if (motivoLimpo.length === 0) {
    throw new AppError('Informe o motivo da recusa', 400);
  }

  if (motivoLimpo.length > TAMANHO_MAXIMO_MOTIVO) {
    throw new AppError(
      `O motivo deve ter no máximo ${TAMANHO_MAXIMO_MOTIVO} caracteres`,
      400
    );
  }

  return motivoLimpo;
}

export const solicitacaoViagemService = {
  // Encaminhamento administrativo: apenas Administrador e Gestor de Frota listam solicitações para análise
  async listar(
    analista: Analista,
    filtros: ListarSolicitacoesViagemInput
  ): Promise<ListaPaginada<SolicitacaoViagemDetalhada>> {
    if (!PERFIS_ANALISAM_TODAS.includes(analista.perfil)) {
      throw new AppError(
        'Você não tem permissão para analisar solicitações de viagem administrativas',
        403
      );
    }

    const resultado = await solicitacaoViagemModel.listar(filtros);
    return paginar(resultado, filtros);
  },

  // O solicitante acompanha a aprovação, motivo de recusa e agendamento das próprias solicitações
  async listarMinhas(
    solicitanteId: number,
    filtros: ListarSolicitacoesViagemInput
  ): Promise<ListaPaginada<SolicitacaoViagemDoSolicitante>> {
    return paginar(
      await solicitacaoViagemModel.listarDoSolicitante(solicitanteId, filtros),
      filtros
    );
  },

  async criar(
    dados: CriarSolicitacaoViagemInput,
    solicitanteId: number
  ): Promise<SolicitacaoViagem> {
    const dataSaida = new Date(dados.data_saida_desejada);

    if (dataSaida.getTime() <= Date.now()) {
      throw new AppError(
        'A data de saída deve ser futura',
        400
      );
    }

    if (dados.data_chegada_desejada) {
      const dataChegada = new Date(
        dados.data_chegada_desejada
      );

      if (dataChegada.getTime() <= dataSaida.getTime()) {
        throw new AppError(
          'A data de chegada deve ser posterior à saída',
          400
        );
      }
    }

    return db.transaction(async (trx) => {
      if (!(await unidadeModel.buscarPorId(dados.unidade_id, trx))) {
        throw new AppError(
          'Unidade inválida. Escolha SVO, HEMOSE ou LACEN',
          400
        );
      }

      const solicitacao =
        await solicitacaoViagemModel.cadastrar(
          {
            ...dados,
            solicitante_id: solicitanteId,
          },
          trx
        );

      await auditoriaModel.registrar(
        {
          usuario_id: solicitanteId,
          acao: `CRIOU_SOLICITACAO_VIAGEM id=${solicitacao.id}`,
          modulo: MODULOS_AUDITORIA.SOLICITACOES_VIAGEM,
        },
        trx
      );

      return solicitacao;
    });
  },

  async aprovar(
    id: number,
    autor: Analista
  ): Promise<SolicitacaoViagem> {
    return analisar(id, 'APROVADA', autor);
  },

  async recusar(
    id: number,
    autor: Analista,
    motivo: string
  ): Promise<SolicitacaoViagem> {
    const motivoValidado = normalizarMotivoRecusa(motivo);
    return analisar(id, 'RECUSADA', autor, motivoValidado);
  },
};

// Apenas Administrador e Gestor de Frota têm competência para aprovar ou recusar viagens administrativas
function garantirCompetenciaAdministrativa(autor: Analista): void {
  if (PERFIS_ANALISAM_TODAS.includes(autor.perfil)) {
    return;
  }

  throw new AppError(
    'Você não tem permissão para analisar solicitações de viagem administrativas',
    403
  );
}

// Aprova ou recusa uma solicitação pendente com bloqueio transacional para evitar concorrência inconsistente
async function analisar(
  id: number,
  novoStatus: 'APROVADA' | 'RECUSADA',
  autor: Analista,
  motivo?: string
): Promise<SolicitacaoViagem> {
  const autorId = autor.id;
  garantirCompetenciaAdministrativa(autor);

  const motivoRecusa =
    novoStatus === 'RECUSADA' ? normalizarMotivoRecusa(motivo ?? '') : null;

  return db.transaction(async (trx) => {
    const solicitacao =
      await solicitacaoViagemModel.buscarParaAtualizar(id, trx);

    if (!solicitacao) {
      throw new AppError(
        'Solicitação de viagem não encontrada',
        404
      );
    }

    if (solicitacao.status !== 'PENDENTE_APROVACAO') {
      throw new AppError(
        'Apenas solicitações pendentes podem ser aprovadas ou recusadas',
        400
      );
    }

    const saidaJaPassou =
      new Date(solicitacao.data_saida_desejada).getTime() <= Date.now();

    if (novoStatus === 'APROVADA' && saidaJaPassou) {
      throw new AppError(
        'Não é possível aprovar: a data de saída já passou',
        400
      );
    }

    const atualizada =
      await solicitacaoViagemModel.atualizarStatus(id, novoStatus, trx, motivoRecusa);

    // O motivo da recusa fica registrado na coluna motivo_recusa e na auditoria com autor e data
    const acao = novoStatus === 'APROVADA'
      ? `APROVOU_SOLICITACAO_VIAGEM id=${id}`
      : `RECUSOU_SOLICITACAO_VIAGEM id=${id} motivo="${motivoRecusa}"`;

    await auditoriaModel.registrar(
      {
        usuario_id: autorId,
        acao,
        modulo: MODULOS_AUDITORIA.SOLICITACOES_VIAGEM,
      },
      trx
    );

    return atualizada;
  });
}