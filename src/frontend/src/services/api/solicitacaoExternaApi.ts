import { ApiError, request } from './http'

/**
 * Consulta pública de solicitação externa (SCRUM-250 / SCRUM-267).
 *
 * CONTRATO PROVISÓRIO: o definitivo vem do SCRUM-266 (credencial) e do SCRUM-264 (endpoint
 * público), ainda não implementados. Quando fecharem, ajuste só este arquivo (caminho, nomes dos
 * campos e lista de estados).
 *
 * O que NÃO muda com o contrato:
 * - o segredo vai no corpo da requisição, nunca na URL;
 * - a chamada é pública (sem token, sem cookies, sem renovar sessão, sem cache);
 * - só os campos públicos conhecidos chegam à tela; qualquer campo extra da API é descartado.
 */

/** PROVISÓRIO: estados simplificados mostrados ao público (o card pede sete, definidos no SCRUM-266). */
export const ESTADOS_PUBLICOS = [
  'RECEBIDA',
  'EM_ANALISE',
  'ACEITA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'RECUSADA',
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

/** PROVISÓRIO: caminho do endpoint público de consulta. */
const CAMINHO_CONSULTA = '/solicitacoes-svo/externas/consulta'

/** Mock só em desenvolvimento e só com `VITE_SOLICITACAO_EXTERNA_MOCK=true` (nunca vai para produção). */
const usarMock = (): boolean => import.meta.env.DEV && import.meta.env.VITE_SOLICITACAO_EXTERNA_MOCK === 'true'

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

/** Valida a resposta e devolve só os campos públicos. Resposta fora do contrato vira erro de servidor. */
export function normalizarConsulta(dados: unknown): ConsultaPublica {
  const bruto = (dados ?? {}) as Record<string, unknown>
  const protocolo = texto(bruto.protocolo)
  const estado = ESTADOS_PUBLICOS.find((candidato) => candidato === bruto.estado)
  if (!protocolo || !estado) throw new ApiError('Resposta inesperada do servidor.', 502)
  return {
    protocolo,
    estado,
    mensagemPublica: texto(bruto.mensagemPublica) ?? '',
    atualizadoEm: texto(bruto.atualizadoEm),
    expiraEm: texto(bruto.expiraEm),
  }
}

export const solicitacaoExternaApi = {
  consultar: async (protocolo: string, segredo: string, signal?: AbortSignal): Promise<ConsultaPublica> => {
    if (usarMock()) {
      const { consultarMock } = await import('./solicitacaoExternaMock')
      return consultarMock(protocolo, segredo, signal)
    }
    const dados = await request<unknown>('POST', CAMINHO_CONSULTA, {
      body: { protocolo, segredo },
      publico: true,
      signal,
    })
    return normalizarConsulta(dados)
  },
}
