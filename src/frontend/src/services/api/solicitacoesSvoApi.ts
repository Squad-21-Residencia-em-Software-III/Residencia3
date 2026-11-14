import type {
  ConfirmacaoSvo,
  ListaSolicitacoesSvo,
  SolicitacaoSvo,
  SolicitacaoSvoDetalhada,
  StatusSolicitacaoSvo,
} from '../../types/solicitacaoSvo';
import { request } from './http';

// Trava de segurança contra paginação sem fim: acima disso a listagem falha de forma explícita
const MAX_PAGINAS = 50;
const POR_PAGINA = 100;

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

  /**
   * Todas as solicitações com o status informado, percorrendo as páginas. Se passar do limite de
   * páginas, falha com erro explícito em vez de devolver uma lista incompleta sem avisar.
   */
  listarTodas: async (status: StatusSolicitacaoSvo): Promise<SolicitacaoSvo[]> => {
    const todas: SolicitacaoSvo[] = [];
    for (let pagina = 1; ; pagina++) {
      const resposta = await solicitacoesSvoApi.listar({ pagina, limite: POR_PAGINA, status });
      todas.push(...resposta.dados);
      if (pagina >= resposta.paginacao.totalPaginas) return todas;
      if (pagina >= MAX_PAGINAS) {
        throw new Error(
          `Há mais de ${MAX_PAGINAS * POR_PAGINA} solicitações SVO ${status.toLowerCase()}s; a lista foi interrompida para não ficar incompleta.`,
        );
      }
    }
  },

  /** Dados da solicitação e a ordem de coleta ativa, se houver. */
  buscarPorId: (id: number) => request<SolicitacaoSvoDetalhada>('GET', `/solicitacoes-svo/${id}`),

  /**
   * Confirma a solicitação em triagem; a API gera a ordem de coleta na mesma transação.
   * Repetir a confirmação devolve a ordem já gerada, sem duplicar.
   */
  confirmar: (id: number) => request<ConfirmacaoSvo>('PATCH', `/solicitacoes-svo/${id}/confirmar`),
};
