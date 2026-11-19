import { recursoAtivo } from '../../config/recursosBackend'
import type { ListaSolicitacoesSvo, SolicitacaoSvoDetalhada } from '../../types/solicitacaoSvo'
import type {
  AgendamentoColetaSvoInput,
  NovaViagemInput,
  OrdemPendenteSvo,
  Viagem,
} from '../../types/viagem'
import { ApiError, CODIGO_CANCELADO, request } from './http'

// Viagens administrativas e ordens SVO têm ids independentes: o tipo indica a tabela no backend
type ReferenciaViagem = Pick<Viagem, 'id' | 'tipo_operacao'>

interface Paginada<T> {
  dados: T[]
  paginacao: { pagina: number; totalPaginas: number }
}

const comEvidencia = (evidenciaId?: string) =>
  recursoAtivo('fotosOdometro') && evidenciaId ? { evidencia_id: evidenciaId } : {}

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
  throw new Error('Há registros demais para listar de uma vez. Contate o suporte.')
}

export const viagensApi = {
  listar: () => request<Viagem[]>('GET', '/viagens'),

  /**
   * Viagens administrativas das solicitações do próprio usuário (SCRUM-179). Usado pelo Gestor
   * SVO, que acompanha só o que pediu; só é chamado com `minhasViagensAdministrativas` ligado.
   */
  listarMinhasAdministrativas: async (): Promise<Viagem[]> => {
    type ViagemPropria = Pick<Viagem, 'id' | 'solicitacao_id' | 'tipo_operacao' | 'origem' |
      'destino' | 'finalidade' | 'inicio_previsto' | 'fim_previsto' | 'status' |
      'data_hora_efetiva_saida' | 'data_hora_efetiva_chegada'>;
    const viagens = await todasAsPaginas((pagina) =>
      request<Paginada<ViagemPropria>>('GET', '/viagens/minhas', {
        query: { pagina, limite: LIMITE_PAGINA },
      }),
    );
    return viagens.map((v) => ({
      ...v, solicitante_nome: null, veiculo_id: 0, veiculo_modelo: '',
      veiculo_placa: '', motorista_id: 0, motorista_nome: '', km_inicial: null,
    }));
  },

  /**
   * Ordens de coleta aguardando alocação. Com a consulta do backend (SCRUM-182) vem de
   * `GET /viagens/ordens-svo/pendentes`; antes dela, confirma o estado real em cada detalhe.
   */
  listarOrdensPendentesSvo: async (): Promise<OrdemPendenteSvo[]> => {
    if (recursoAtivo('ordensPendentesSvo')) {
      return todasAsPaginas((pagina) =>
        request<Paginada<OrdemPendenteSvo>>('GET', '/viagens/ordens-svo/pendentes', {
          query: { pagina, limite: LIMITE_PAGINA },
        }),
      )
    }
    // Limite operacional: a API atual exige uma consulta de detalhe por solicitação.
    const primeira = await request<ListaSolicitacoesSvo>('GET', '/solicitacoes-svo', {
      query: { pagina: 1, limite: LIMITE_PAGINA, status: 'CONFIRMADA' },
    })
    if (primeira.paginacao.total > LIMITE_PAGINA || primeira.paginacao.totalPaginas > 1) {
      throw new Error('Há solicitações demais para verificar as ordens com segurança. A listagem depende da SCRUM-182.')
    }
    const detalhes: SolicitacaoSvoDetalhada[] = []
    for (let i = 0; i < primeira.dados.length; i += 4) {
      const lote = primeira.dados.slice(i, i + 4)
      detalhes.push(...await Promise.all(lote.map((s) =>
        request<SolicitacaoSvoDetalhada>('GET', `/solicitacoes-svo/${s.id}`),
      )))
    }
    return detalhes.filter((s) => s.status === 'CONFIRMADA' && s.ordem?.status === 'AGUARDANDO_ALOCACAO' && s.ordem.solicitacao_id === s.id)
      .map((s) => ({ ordem_id: s.ordem!.id, solicitacao_id: s.id,
        local_ocorrencia: s.local_ocorrencia, material_sensivel: s.material_sensivel,
        confirmado_em: s.confirmado_em ?? null }))
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
    token_confirmacao,
    ...recursos
  }: AgendamentoColetaSvoInput) =>
    request<Viagem>('POST', '/viagens', {
      body: {
        tipo_operacao: 'SVO',
        ...recursos,
        ...(recursoAtivo('agendamentoTemporalSvo')
          ? { inicio_previsto, fim_previsto, confirmar_intervalo_reduzido, token_confirmacao }
          : {}),
      },
    }),

  reprogramarColetaSvo: (id: number, dados: AgendamentoColetaSvoInput) =>
    request<Viagem>('POST', `/viagens/ordens-svo/${id}/reprogramar`, {
      body: { tipo_operacao: 'SVO', ...dados },
    }),

  listarAlertasSvo: () => todasAsPaginas((pagina) =>
    request<Paginada<{ id: number; ordem_em_atraso_id: number; ordem_afetada_id: number;
      inicio_previsto_afetada: string }>>('GET', '/viagens/ordens-svo/alertas', {
      query: { pagina, limite: LIMITE_PAGINA },
    })),

  /** `evidenciaId`: foto da saída já enviada (SCRUM-203); só segue com `fotosOdometro` ligado. */
  iniciar: ({ id, tipo_operacao }: ReferenciaViagem, km_inicial: number, evidenciaId?: string) =>
    request<Viagem>('PATCH', `/viagens/${id}/iniciar`, {
      body: { tipo_operacao, km_inicial, ...comEvidencia(evidenciaId) },
    }),

  registrarChegadaLocalSvo: async (ordemId: number) => {
    try {
      return await request<Viagem>('PATCH', `/viagens/ordens-svo/${ordemId}/chegar-local`, {
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      if (error instanceof ApiError && error.codigo === CODIGO_CANCELADO) {
        throw new ApiError('O servidor demorou a responder. Tente novamente.', 0)
      }
      throw error
    }
  },

  /** `evidenciaId`: foto da chegada já enviada (SCRUM-203); só segue com `fotosOdometro` ligado. */
  finalizar: ({ id, tipo_operacao }: ReferenciaViagem, km_final: number, evidenciaId?: string) =>
    request<Viagem>('PATCH', `/viagens/${id}/finalizar`, {
      body: { tipo_operacao, km_final, ...comEvidencia(evidenciaId) },
    }),

  cancelar: ({ id, tipo_operacao }: ReferenciaViagem) =>
    request<Viagem>('PATCH', `/viagens/${id}/cancelar`, { body: { tipo_operacao } }),
}
