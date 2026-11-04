import type { Knex } from 'knex';
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
  type StatusSolicitacaoViagem,
} from '../models/solicitacaoViagemModel';
import { unidadeModel } from '../models/unidadeModel';
import type { Usuario } from '../models/usuarioModel';
import type {
  CriarSolicitacaoViagemInput,
} from '../validators/solicitacaoViagemSchemas';

type Analista = Pick<Usuario, 'id' | 'perfil'>;

export const solicitacaoViagemService = {
  // Encaminhamento: cada analista vê apenas as solicitações das unidades que gere
  async listar(
    analista: Analista,
    status?: StatusSolicitacaoViagem
  ): Promise<SolicitacaoViagemDetalhada[]> {
    if (PERFIS_ANALISAM_TODAS.includes(analista.perfil)) {
      return solicitacaoViagemModel.listar({ status });
    }

    const unidadeIds = await unidadeModel.idsDasUnidadesDoGestor(analista.id);
    if (unidadeIds.length === 0) {
      return [];
    }

    return solicitacaoViagemModel.listar({ status, unidadeIds });
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
    motivo?: string
  ): Promise<SolicitacaoViagem> {
    return analisar(id, 'RECUSADA', autor, motivo);
  },
};

// Administrador e Gestor de Frota analisam tudo, inclusive solicitações de unidade sem gestor;
// os demais gestores, apenas as solicitações das unidades a que estão associados
async function garantirCompetencia(
  autor: Analista,
  unidadeId: number | null,
  trx: Knex.Transaction
): Promise<void> {
  if (PERFIS_ANALISAM_TODAS.includes(autor.perfil)) {
    return;
  }

  if (unidadeId !== null && (await unidadeModel.estaAssociado(unidadeId, autor.id, trx))) {
    return;
  }

  throw new AppError(
    'Você não é gestor da unidade desta solicitação',
    403
  );
}

// Aprova ou recusa uma solicitação pendente
async function analisar(
  id: number,
  novoStatus: 'APROVADA' | 'RECUSADA',
  autor: Analista,
  motivo?: string
): Promise<SolicitacaoViagem> {
  const autorId = autor.id;

  return db.transaction(async (trx) => {
    const solicitacao =
      await solicitacaoViagemModel.buscarParaAtualizar(id, trx);

    if (!solicitacao) {
      throw new AppError(
        'Solicitação de viagem não encontrada',
        404
      );
    }

    await garantirCompetencia(autor, solicitacao.unidade_id, trx);

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

    const motivoRecusa = novoStatus === 'RECUSADA' ? (motivo ?? null) : null;

    const atualizada =
      await solicitacaoViagemModel.atualizarStatus(id, novoStatus, trx, motivoRecusa);

    // O motivo da recusa fica registrado na coluna motivo_recusa e na auditoria
    const acao = novoStatus === 'APROVADA'
      ? `APROVOU_SOLICITACAO_VIAGEM id=${id}`
      : `RECUSOU_SOLICITACAO_VIAGEM id=${id}${motivo ? ` motivo="${motivo}"` : ''}`;

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