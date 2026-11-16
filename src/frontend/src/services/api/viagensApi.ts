import { recursoAtivo } from '../../config/recursosBackend'
import type { ListaSolicitacoesSvo } from '../../types/solicitacaoSvo'
import type {
  AgendamentoColetaSvoInput,
  NovaViagemInput,
  OrdemPendenteSvo,
  Viagem,
} from '../../types/viagem'
import { request } from './http'

// Viagens administrativas e ordens SVO têm ids independentes: o tipo indica a tabela no backend
type ReferenciaViagem = Pick<Viagem, 'id' | 'tipo_operacao'>

interface Paginada<T> {
  dados: T[]
  paginacao: { pagina: number; totalPaginas: number }
}

const LIMITE_PAGINA = 100
const MAXIMO_PAGINAS = 50

/** Percorre todas as páginas; falha de forma explícita em vez de truncar a lista em silêncio. */
async function todasAsPaginas<T>(buscar: (pagina: number) => Promise<Paginada<T>>): Promise<T[]> {
  const itens: T[] = []
  for (let pagina = 1; pagina <= MAXIMO_PAGINAS; pagina++) {
    const resposta = await buscar(pagina)
    itens.push(...resposta.dados)
    if (pagina >= resposta.paginacao.totalPaginas) return itens
  }
  throw new Error('Há ordens demais para listar de uma vez. Contate o suporte.')
}

export const viagensApi = {
  listar: () => request<Viagem[]>('GET', '/viagens'),

  /**
   * Viagens administrativas das solicitações do próprio usuário (SCRUM-179). Usado pelo Gestor
   * SVO, que acompanha só o que pediu; só é chamado com `minhasViagensAdministrativas` ligado.
   */
  listarMinhasAdministrativas: () => request<Viagem[]>('GET', '/viagens/minhas'),

  /**
   * Ordens de coleta aguardando alocação. Com a consulta do backend (SCRUM-182) vem de
   * `GET /viagens/ordens-svo/pendentes`; antes dela, das solicitações SVO confirmadas, que têm
   * exatamente uma ordem AGUARDANDO_ALOCACAO cada.
   */
  listarOrdensPendentesSvo: async (): Promise<OrdemPendenteSvo[]> => {
    if (recursoAtivo('ordensPendentesSvo')) {
      return todasAsPaginas((pagina) =>
        request<Paginada<OrdemPendenteSvo>>('GET', '/viagens/ordens-svo/pendentes', {
          query: { pagina, limite: LIMITE_PAGINA },
        }),
      )
    }
    const confirmadas = await todasAsPaginas((pagina) =>
      request<ListaSolicitacoesSvo>('GET', '/solicitacoes-svo', {
        query: { pagina, limite: LIMITE_PAGINA, status: 'CONFIRMADA' },
      }),
    )
    return confirmadas.map((s) => ({
      ordem_id: null,
      solicitacao_id: s.id,
      local_ocorrencia: s.local_ocorrencia,
      material_sensivel: s.material_sensivel,
      confirmado_em: s.confirmado_em ?? null,
    }))
  },

  criar: (dados: NovaViagemInput) => request<Viagem>('POST', '/viagens', { body: dados }),

  /**
   * Agenda a coleta de uma ordem SVO. Período e confirmação de intervalo curto só seguem com o
   * agendamento temporal (SCRUM-182). Nesse modo, quando a folga para outra reserva do mesmo
   * recurso fica entre 0 e 20 min, o servidor responde com `codigo` igual a
   * `CONFIRMACAO_INTERVALO_REDUZIDO` e `contexto.conflitos`; o pedido é refeito com
   * `confirmar_intervalo_reduzido: true` só depois da ciência do gestor. Sobreposição real volta
   * 409 com outro código e não tem como forçar.
   */
  agendarColetaSvo: ({
    inicio_previsto,
    fim_previsto,
    confirmar_intervalo_reduzido,
    ...recursos
  }: AgendamentoColetaSvoInput) =>
    request<Viagem>('POST', '/viagens', {
      body: {
        tipo_operacao: 'SVO',
        ...recursos,
        ...(recursoAtivo('agendamentoTemporalSvo')
          ? { inicio_previsto, fim_previsto, confirmar_intervalo_reduzido }
          : {}),
      },
    }),

  iniciar: ({ id, tipo_operacao }: ReferenciaViagem, km_inicial: number) =>
    request<Viagem>('PATCH', `/viagens/${id}/iniciar`, { body: { tipo_operacao, km_inicial } }),

  finalizar: ({ id, tipo_operacao }: ReferenciaViagem, km_final: number) =>
    request<Viagem>('PATCH', `/viagens/${id}/finalizar`, { body: { tipo_operacao, km_final } }),

  cancelar: ({ id, tipo_operacao }: ReferenciaViagem) =>
    request<Viagem>('PATCH', `/viagens/${id}/cancelar`, { body: { tipo_operacao } }),
}
