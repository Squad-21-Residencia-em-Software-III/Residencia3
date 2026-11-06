import type { SolicitacaoViagem } from '../../types/solicitacao'
import { request } from './http'

interface ListaSolicitacoes {
  dados: SolicitacaoViagem[]
}

export const solicitacoesApi = {
  // A rota é paginada; 100 é o limite máximo aceito pelo backend.
  listarAprovadas: async () => {
    const { dados } = await request<ListaSolicitacoes>('GET', '/solicitacoes-viagem', {
      query: { status: 'APROVADA', limite: 100 },
    })
    return dados
  },
}
