import { ApiError, request } from './http'

/**
 * Consulta pública de solicitação externa (SCRUM-250 / SCRUM-267), contrato da SCRUM-266:
 * `POST /solicitacoes-svo/externas/acompanhamento` com `{ protocolo, credencial }`.
 *
 * O que vale sempre:
 * - a credencial vai no corpo da requisição, nunca na URL;
 * - a chamada é pública (sem token, sem cookies, sem renovar sessão, sem cache);
 * - só os campos públicos conhecidos chegam à tela; qualquer campo extra da API é descartado;
 * - o backend responde 401 igual para protocolo inexistente e credencial incorreta, cruzada,
 *   expirada ou revogada: o cliente nunca tenta adivinhar o motivo.
 */

/** Os sete estados públicos definidos pelo backend (SCRUM-266). */
export const ESTADOS_PUBLICOS = [
  'RECEBIDA',
  'EM_ANALISE',
  'CONFIRMADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'NAO_ACOLHIDA',
  'CANCELADA',
] as const

export type EstadoPublico = (typeof ESTADOS_PUBLICOS)[number]

export interface ConsultaPublica {
  protocolo: string
  estado: EstadoPublico
  /** Mensagem pública escrita para o solicitante; vazia quando não há. */
  mensagemPublica: string
  atualizadoEm: string | null
  /** Até quando a consulta por esta credencial vale, quando a API informar. */
  expiraEm: string | null
}

const CAMINHO_CONSULTA = '/solicitacoes-svo/externas/acompanhamento'

const respostaInesperada = () => new ApiError('Resposta inesperada do servidor.', 502)

/** Texto obrigatório: ausente, vazio ou de outro tipo é resposta inesperada. */
function textoObrigatorio(valor: unknown): string {
  if (typeof valor !== 'string' || valor.trim() === '') throw respostaInesperada()
  return valor
}

/** Texto opcional: ausente ou nulo vira `null`; de outro tipo é resposta inesperada. */
function textoOpcional(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null
  if (typeof valor !== 'string') throw respostaInesperada()
  return valor.trim() === '' ? null : valor
}

/** Data opcional em texto: ausente ou nula vira `null`; texto que não é data válida é resposta inesperada. */
function dataOpcional(valor: unknown): string | null {
  const texto = textoOpcional(valor)
  if (texto === null) return null
  if (Number.isNaN(new Date(texto).getTime())) throw respostaInesperada()
  return texto
}

/**
 * Valida a resposta do backend (nomes em snake_case) e converte para os nomes usados na tela,
 * devolvendo só os campos públicos. Resposta fora do contrato vira erro de servidor (502).
 */
export function normalizarConsulta(dados: unknown): ConsultaPublica {
  if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) throw respostaInesperada()
  const bruto = dados as Record<string, unknown>
  const estado = ESTADOS_PUBLICOS.find((candidato) => candidato === bruto.status)
  if (!estado) throw respostaInesperada()
  return {
    protocolo: textoObrigatorio(bruto.protocolo),
    estado,
    mensagemPublica: textoOpcional(bruto.mensagem_publica) ?? '',
    atualizadoEm: dataOpcional(bruto.atualizada_em),
    expiraEm: dataOpcional(bruto.consulta_disponivel_ate),
  }
}

export const solicitacaoExternaApi = {
  consultar: async (protocolo: string, credencial: string, signal?: AbortSignal): Promise<ConsultaPublica> => {
    // Mock só em desenvolvimento e só com `VITE_SOLICITACAO_EXTERNA_MOCK=true`. A condição fica escrita aqui,
    // sem função no meio, para o build de produção descartar este trecho e não incluir o mock no pacote.
    if (import.meta.env.DEV && import.meta.env.VITE_SOLICITACAO_EXTERNA_MOCK === 'true') {
      const { consultarMock } = await import('./solicitacaoExternaMock')
      return consultarMock(protocolo, credencial, signal)
    }
    const dados = await request<unknown>('POST', CAMINHO_CONSULTA, {
      body: { protocolo, credencial },
      publico: true,
      signal,
    })
    return normalizarConsulta(dados)
  },
}
