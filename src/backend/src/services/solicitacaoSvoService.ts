import { db } from '../config/database';
import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { acompanhamentoExternoSvoModel } from '../models/acompanhamentoExternoSvoModel';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  solicitacaoSvoModel,
  type OrdemSvo,
  type SolicitacaoSvo,
} from '../models/solicitacaoSvoModel';
import {
  TAMANHO_MAXIMO_MOTIVO_RECUSA_SVO,
  type CriarSolicitacaoSvoInput,
  type ListarSolicitacoesSvoInput,
} from '../validators/solicitacaoSvoSchemas';
import { JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_MS } from './acompanhamentoExternoSvoService';
import { notificacaoSvoService } from './notificacaoSvoService';
import type { ListaPaginada } from './usuarioService';

type Autor = { id: number; perfil: Perfil };

// Solicitação com a ordem de coleta ativa, quando houver (BL27)
export type SolicitacaoSvoDetalhada = SolicitacaoSvo & { ordem: OrdemSvo | null };

interface ConfirmacaoSvo {
  solicitacao: SolicitacaoSvo;
  ordem: OrdemSvo;
  criada: boolean;
}

interface RecusaSvo {
  solicitacao: SolicitacaoSvo;
}

function garantirAcessoTriagem(autor: Autor): void {
  if (autor.perfil !== PERFIS.GESTOR_SVO && autor.perfil !== PERFIS.ADMINISTRADOR) {
    throw new AppError('Você não tem permissão para analisar solicitações SVO', 403);
  }
}

function normalizarMotivoRecusa(motivo: string): string {
  if (typeof motivo !== 'string') {
    throw new AppError('O motivo da recusa é obrigatório', 400);
  }
  const limpo = motivo.trim();
  if (limpo.length === 0) {
    throw new AppError('O motivo da recusa é obrigatório', 400);
  }
  if (limpo.length > TAMANHO_MAXIMO_MOTIVO_RECUSA_SVO) {
    throw new AppError(
      `O motivo da recusa deve ter no máximo ${TAMANHO_MAXIMO_MOTIVO_RECUSA_SVO} caracteres`,
      400,
    );
  }
  return limpo;
}

export const solicitacaoSvoService = {
  // Toda solicitação nasce em triagem, registrada pelo usuário autenticado
  async registrar(dados: CriarSolicitacaoSvoInput, registranteId: number): Promise<SolicitacaoSvo> {
    return db.transaction(async (trx) => {
      const solicitacao = await solicitacaoSvoModel.cadastrar(
        {
          registrante_id: registranteId,
          dados_solicitante: dados.dados_solicitante,
          local_ocorrencia: dados.local_ocorrencia,
          material_sensivel: dados.material_sensivel,
          status: 'EM_TRIAGEM',
        },
        trx,
      );

      await auditoriaModel.registrar(
        {
          usuario_id: registranteId,
          acao: `CRIOU_SOLICITACAO_SVO id=${solicitacao.id}`,
          modulo: MODULOS_AUDITORIA.SOLICITACOES_SVO,
        },
        trx,
      );

      await notificacaoSvoService.publicarAlertasRegistroSolicitacao(solicitacao, registranteId, trx);

      return solicitacao;
    });
  },

  async listar(filtros: ListarSolicitacoesSvoInput): Promise<ListaPaginada<SolicitacaoSvo>> {
    const { dados, total } = await solicitacaoSvoModel.listar(filtros);

    return {
      dados,
      paginacao: {
        pagina: filtros.pagina,
        limite: filtros.limite,
        total,
        totalPaginas: Math.ceil(total / filtros.limite),
      },
    };
  },

  async buscarPorId(id: number): Promise<SolicitacaoSvoDetalhada> {
    const solicitacao = await solicitacaoSvoModel.buscarPorId(id);
    if (!solicitacao) {
      throw new AppError('Solicitação SVO não encontrada', 404);
    }
    const ordem = await solicitacaoSvoModel.buscarOrdemAtiva(id);
    return { ...solicitacao, ordem: ordem ?? null };
  },

  // Confirma a solicitação em triagem e gera a ordem de coleta na mesma transação (RF20/RF21/RN09).
  // Repetir a confirmação devolve a ordem já existente, sem duplicar.
  async confirmar(id: number, autor: Autor): Promise<ConfirmacaoSvo> {
    garantirAcessoTriagem(autor);
    return db.transaction(async (trx) => {
      // Serializa confirmações da mesma solicitação, inclusive entre processos
      const solicitacao = await solicitacaoSvoModel.buscarParaAtualizar(id, trx);
      if (!solicitacao) {
        throw new AppError('Solicitação SVO não encontrada', 404);
      }
      if (!['EM_TRIAGEM', 'CONFIRMADA', 'EM_ANDAMENTO'].includes(solicitacao.status)) {
        throw new AppError('Somente solicitações em triagem podem ser confirmadas', 409);
      }
      const existente = await solicitacaoSvoModel.buscarOrdemAtiva(id, trx);
      if (solicitacao.status !== 'EM_TRIAGEM') {
        const estadosPermitidos =
          solicitacao.status === 'CONFIRMADA' ? ['AGUARDANDO_ALOCACAO'] : ['ALOCADA', 'EM_DESLOCAMENTO', 'NO_LOCAL'];
        if (!existente || !estadosPermitidos.includes(existente.status)) {
          throw new AppError('O estado da ordem não corresponde ao da solicitação SVO', 409);
        }
        return { solicitacao, ordem: existente, criada: false };
      }
      if (existente) {
        throw new AppError('A solicitação em triagem já possui uma ordem ativa', 409);
      }

      const confirmada = await solicitacaoSvoModel.confirmar(id, autor.id, trx);
      const ordem = await solicitacaoSvoModel.gerarOrdem(id, trx);
      await auditoriaModel.registrar(
        {
          usuario_id: autor.id,
          acao: `CONFIRMOU_SOLICITACAO_SVO id=${id} GEROU_ORDEM_COLETA id=${ordem.id}`,
          modulo: MODULOS_AUDITORIA.SOLICITACOES_SVO,
        },
        trx,
      );
      return { solicitacao: confirmada, ordem, criada: true };
    });
  },

  // Recusa a solicitação em triagem exigindo justificativa, sem gerar nem cancelar ordens
  async recusar(id: number, motivoRecusa: string, autor: Autor): Promise<RecusaSvo> {
    garantirAcessoTriagem(autor);
    const motivoSanitizado = normalizarMotivoRecusa(motivoRecusa);

    return db.transaction(async (trx) => {
      const solicitacao = await solicitacaoSvoModel.buscarParaAtualizar(id, trx);
      if (!solicitacao) {
        throw new AppError('Solicitação SVO não encontrada', 404);
      }
      if (solicitacao.status === 'RECUSADA') {
        throw new AppError('Solicitação SVO já foi recusada', 409);
      }
      if (solicitacao.status !== 'EM_TRIAGEM') {
        throw new AppError('Somente solicitações em triagem podem ser recusadas', 409);
      }

      const ordemExistente = await solicitacaoSvoModel.buscarOrdemAtiva(id, trx);
      if (ordemExistente) {
        throw new AppError('A solicitação em triagem já possui uma ordem ativa', 409);
      }

      const recusada = await solicitacaoSvoModel.recusar(id, motivoSanitizado, trx);
      if (recusada.canal_origem === 'EXTERNA') {
        const agora = new Date();
        const expiraConsultaEm = new Date(
          agora.getTime() + JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_MS
        );
        const retencaoAte = new Date(agora);
        retencaoAte.setUTCMonth(retencaoAte.getUTCMonth() + 12);
        await acompanhamentoExternoSvoModel.registrarEncerramentoOperacional(
          id,
          agora,
          expiraConsultaEm,
          retencaoAte,
          trx
        );
      }
      const resumoMotivo =
        motivoSanitizado.length > 180 ? `${motivoSanitizado.slice(0, 177)}...` : motivoSanitizado;

      await auditoriaModel.registrar(
        {
          usuario_id: autor.id,
          acao: `RECUSOU_SOLICITACAO_SVO id=${id} motivo="${resumoMotivo}"`,
          modulo: MODULOS_AUDITORIA.SOLICITACOES_SVO,
        },
        trx,
      );

      return { solicitacao: recusada };
    });
  },
};