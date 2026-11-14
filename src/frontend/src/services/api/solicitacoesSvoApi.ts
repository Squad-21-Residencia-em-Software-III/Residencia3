import type {
  ConfirmacaoSvo,
  ListaSolicitacoesSvo,
  SolicitacaoSvo,
  SolicitacaoSvoDetalhada,
  StatusSolicitacaoSvo,
} from '../../types/solicitacaoSvo';
import { request } from './http';

// Trava de segurança contra paginação sem fim (5.000 solicitações por status)
const MAX_PAGINAS = 50;

interface FiltrosSolicitacoesSvo {
  pagina?: number;
  limite?: number;
  status?: StatusSolicitacaoSvo;
}

/** Solicitações SVO. Somente Administrador e Gestor SVO (o backend responde 403 aos demais). */
export const solicitacoesSvoApi = {
  /** Uma página das solicitações, da mais recente para a mais antiga. */
  listar: ({ pagina = 1, limite = 20, status }: FiltrosSolicitacoesSvo = {}) =>
    request<ListaSolicitacoesSvo>('GET', '/solicitacoes-svo', {
      query: { pagina, limite, status },
    }),

  /** Todas as solicitações com o status informado, percorrendo as páginas (até 100 por página). */
  listarTodas: async (status: StatusSolicitacaoSvo): Promise<SolicitacaoSvo[]> => {
    const todas: SolicitacaoSvo[] = [];
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const resposta = await solicitacoesSvoApi.listar({ pagina, limite: 100, status });
      todas.push(...resposta.dados);
      if (pagina >= resposta.paginacao.totalPaginas) break;
    }
    return todas;
  },

  /** Dados da solicitação e a ordem de coleta ativa, se houver. */
  buscarPorId: (id: number) => request<SolicitacaoSvoDetalhada>('GET', `/solicitacoes-svo/${id}`),

  /**
   * Confirma a solicitação em triagem; a API gera a ordem de coleta na mesma transação.
   * Repetir a confirmação devolve a ordem já gerada, sem duplicar.
   */
  confirmar: (id: number) => request<ConfirmacaoSvo>('PATCH', `/solicitacoes-svo/${id}/confirmar`),
};
