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

/** Percorre todas as páginas de uma listagem de solicitações. */
const listarTodasAsPaginas = async (caminho: string, status?: StatusSolicitacao) => {
  const solicitacoes: SolicitacaoViagem[] = []
  let pagina = 1
  let totalPaginas = 1

  do {
    const resposta = await request<ListaSolicitacoes>('GET', caminho, {
      query: { status, pagina, limite: LIMITE_POR_PAGINA },
    })
    solicitacoes.push(...resposta.dados)
    totalPaginas = resposta.paginacao.totalPaginas
    pagina += 1
  } while (pagina <= totalPaginas)

  return solicitacoes
}

/** Solicitações encaminhadas ao usuário (gestores). */
const listar = (status?: StatusSolicitacao) => listarTodasAsPaginas('/solicitacoes-viagem', status)

export const solicitacoesApi = {
  listar,
  /** Só as solicitações do próprio usuário (qualquer perfil). */
  listarMinhas: (status?: StatusSolicitacao) =>
    listarTodasAsPaginas('/solicitacoes-viagem/minhas', status),
  listarAprovadas: () => listar('APROVADA'),
  criar: (dados: NovaSolicitacaoApiInput) =>
    request<SolicitacaoViagem>('POST', '/solicitacoes-viagem', { body: dados }),
  aprovar: (id: number) => request<SolicitacaoViagem>('PATCH', `/solicitacoes-viagem/${id}/aprovar`),
  recusar: (id: number, motivo?: string) =>
    request<SolicitacaoViagem>('PATCH', `/solicitacoes-viagem/${id}/recusar`, { body: { motivo } }),
  consultarDisponibilidade: (id: number) =>
    request<DisponibilidadeSolicitacao>('GET', `/solicitacoes-viagem/${id}/disponibilidade`),
}
