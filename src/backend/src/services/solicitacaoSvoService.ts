import { db } from '../config/database';
import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import { solicitacaoSvoModel, type SolicitacaoSvo, type OrdemSvo } from '../models/solicitacaoSvoModel';
import type { ListarSolicitacoesSvoInput } from '../validators/solicitacaoSvoSchemas';
import type { ListaPaginada } from './usuarioService';

type Autor = { id: number; perfil: Perfil };

interface DetalheSolicitacaoSvo {
  solicitacao: SolicitacaoSvo;
  ordem: OrdemSvo | null;
}

interface ConfirmacaoSvo {
  solicitacao: SolicitacaoSvo;
  ordem: OrdemSvo;
  criada: boolean;
}

function garantirAcesso(autor: Autor): void {
  if (autor.perfil !== PERFIS.GESTOR_SVO && autor.perfil !== PERFIS.ADMINISTRADOR) {
    throw new AppError('Você não tem permissão para analisar solicitações SVO', 403);
  }
}

export const solicitacaoSvoService = {
  async listar(filtros: ListarSolicitacoesSvoInput, autor: Autor): Promise<ListaPaginada<SolicitacaoSvo>> {
    garantirAcesso(autor);
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

  async detalhar(id: number, autor: Autor): Promise<DetalheSolicitacaoSvo> {
    garantirAcesso(autor);
    const solicitacao = await solicitacaoSvoModel.buscarPorId(id);
    if (!solicitacao) {
      throw new AppError('Solicitação SVO não encontrada', 404);
    }
    const ordem = await solicitacaoSvoModel.buscarOrdemAtiva(id);
    return { solicitacao, ordem: ordem ?? null };
  },

  async confirmar(id: number, autor: Autor): Promise<ConfirmacaoSvo> {
    garantirAcesso(autor);
    return db.transaction(async (trx) => {
      // Serializa confirmações da mesma solicitação, inclusive entre processos.
      const solicitacao = await solicitacaoSvoModel.buscarParaAtualizar(id, trx);
      if (!solicitacao) {
        throw new AppError('Solicitação SVO não encontrada', 404);
      }
      if (!['EM_TRIAGEM', 'CONFIRMADA', 'EM_ANDAMENTO'].includes(solicitacao.status)) {
        throw new AppError('Somente solicitações em triagem podem ser confirmadas', 409);
      }
      const existente = await solicitacaoSvoModel.buscarOrdemAtiva(id, trx);
      if (solicitacao.status !== 'EM_TRIAGEM') {
        const estadosPermitidos = solicitacao.status === 'CONFIRMADA'
          ? ['AGUARDANDO_ALOCACAO']
          : ['ALOCADA', 'EM_DESLOCAMENTO'];
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
          modulo: MODULOS_AUDITORIA.SVO,
        },
        trx
      );
      return { solicitacao: confirmada, ordem, criada: true };
    });
  },
};
