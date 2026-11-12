import { db } from '../config/database';
import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  solicitacaoSvoModel,
  type OrdemSvo,
  type SolicitacaoSvo,
} from '../models/solicitacaoSvoModel';
import type { CriarSolicitacaoSvoInput, ListarSolicitacoesSvoInput } from '../validators/solicitacaoSvoSchemas';
import type { ListaPaginada } from './usuarioService';

type Autor = { id: number; perfil: Perfil };

// Solicitação com a ordem de coleta ativa, quando houver (BL27)
export type SolicitacaoSvoDetalhada = SolicitacaoSvo & { ordem: OrdemSvo | null };

interface ConfirmacaoSvo {
  solicitacao: SolicitacaoSvo;
  ordem: OrdemSvo;
  criada: boolean;
}

function garantirAcessoTriagem(autor: Autor): void {
  if (autor.perfil !== PERFIS.GESTOR_SVO && autor.perfil !== PERFIS.ADMINISTRADOR) {
    throw new AppError('Você não tem permissão para analisar solicitações SVO', 403);
  }
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
          solicitacao.status === 'CONFIRMADA' ? ['AGUARDANDO_ALOCACAO'] : ['ALOCADA', 'EM_DESLOCAMENTO'];
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
};
