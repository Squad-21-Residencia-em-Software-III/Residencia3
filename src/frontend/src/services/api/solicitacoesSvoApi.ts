import type {
  ConfirmacaoSvo,
  ListaSolicitacoesSvo,
  SolicitacaoSvoDetalhada,
  StatusSolicitacaoSvo,
} from '../../types/solicitacaoSvo';
import { request } from './http';

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

  /** Dados da solicitação e a ordem de coleta ativa, se houver. */
  buscarPorId: (id: number) => request<SolicitacaoSvoDetalhada>('GET', `/solicitacoes-svo/${id}`),

  /**
   * Confirma a solicitação em triagem; a API gera a ordem de coleta na mesma transação.
   * Repetir a confirmação devolve a ordem já gerada, sem duplicar.
   */
  confirmar: (id: number) => request<ConfirmacaoSvo>('PATCH', `/solicitacoes-svo/${id}/confirmar`),
};
