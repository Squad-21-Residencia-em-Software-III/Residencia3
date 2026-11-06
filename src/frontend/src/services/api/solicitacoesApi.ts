import type {
  DisponibilidadeSolicitacao,
  NovaSolicitacaoApiInput,
  SolicitacaoViagem,
  StatusSolicitacao,
} from '../../types/solicitacao'
import { request } from './http'

interface ListaSolicitacoes {
  dados: SolicitacaoViagem[]
  paginacao: { totalPaginas: number }
}

// Limite máximo aceito pelo backend por página.
const LIMITE_POR_PAGINA = 100

const listar = async (status?: StatusSolicitacao) => {
  const solicitacoes: SolicitacaoViagem[] = []
  let pagina = 1
  let totalPaginas = 1

  do {
    const resposta = await request<ListaSolicitacoes>('GET', '/solicitacoes-viagem', {
      query: { status, pagina, limite: LIMITE_POR_PAGINA },
    })
    solicitacoes.push(...resposta.dados)
    totalPaginas = resposta.paginacao.totalPaginas
    pagina += 1
  } while (pagina <= totalPaginas)

  return solicitacoes
}

export const solicitacoesApi = {
  listar,
  listarAprovadas: () => listar('APROVADA'),
  criar: (dados: NovaSolicitacaoApiInput) =>
    request<SolicitacaoViagem>('POST', '/solicitacoes-viagem', { body: dados }),
  aprovar: (id: number) => request<SolicitacaoViagem>('PATCH', `/solicitacoes-viagem/${id}/aprovar`),
  recusar: (id: number, motivo?: string) =>
    request<SolicitacaoViagem>('PATCH', `/solicitacoes-viagem/${id}/recusar`, { body: { motivo } }),
  consultarDisponibilidade: (id: number) =>
    request<DisponibilidadeSolicitacao>('GET', `/solicitacoes-viagem/${id}/disponibilidade`),
}
