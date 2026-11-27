import { ApiError, CODIGO_CANCELADO } from './http'
import { ESTADOS_PUBLICOS } from './solicitacaoExternaApi'
import type { ConsultaPublica } from './solicitacaoExternaApi'

/**
 * Mock de DESENVOLVIMENTO da consulta pública (dados 100% fictícios). Só é carregado com
 * `VITE_SOLICITACAO_EXTERNA_MOCK=true` em modo dev.
 *
 * Como testar na tela (segredo `segredo-demo`):
 *   DEMO-0001 a DEMO-0007 mostram cada um dos sete estados.
 * Credenciais de simulação, com qualquer protocolo: `limite` (429, 5 s) e `indisponivel` (503).
 * Qualquer outra combinação responde como o backend real: 401 uniforme, sem dizer o motivo.
 */

const SEGREDO_DEMO = 'segredo-demo'
const ATRASO_MS = 400

const MENSAGENS: Record<(typeof ESTADOS_PUBLICOS)[number], string> = {
  RECEBIDA: 'Recebemos o seu chamado (dado fictício).',
  EM_ANALISE: 'Estamos analisando as informações enviadas (dado fictício).',
  CONFIRMADA: 'Chamado confirmado e encaminhado (dado fictício).',
  EM_ANDAMENTO: 'Atendimento em andamento (dado fictício).',
  CONCLUIDA: 'Atendimento concluído (dado fictício).',
  NAO_ACOLHIDA: 'Não foi possível acolher este chamado (dado fictício).',
  CANCELADA: 'Chamado cancelado (dado fictício).',
}

function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancelar = () => reject(new ApiError('A consulta foi cancelada.', 0, [], CODIGO_CANCELADO))
    if (signal?.aborted) return cancelar()
    const temporizador = setTimeout(() => {
      signal?.removeEventListener('abort', cancelar)
      resolve()
    }, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(temporizador)
        cancelar()
      },
      { once: true },
    )
  })
}

export async function consultarMock(
  protocolo: string,
  segredo: string,
  signal?: AbortSignal,
): Promise<ConsultaPublica> {
  await esperar(ATRASO_MS, signal)

  if (segredo === 'limite') throw new ApiError('Muitas tentativas.', 429, [], undefined, undefined, 5)
  if (segredo === 'indisponivel') throw new ApiError('Servidor indisponível.', 503)

  const normalizado = protocolo.trim().toUpperCase()
  const indice = ESTADOS_PUBLICOS.findIndex((_, i) => normalizado === `DEMO-000${i + 1}`)
  if (indice < 0 || segredo !== SEGREDO_DEMO) throw new ApiError('Protocolo ou credencial inválidos.', 401)

  const estado = ESTADOS_PUBLICOS[indice]
  return {
    protocolo: normalizado,
    estado,
    mensagemPublica: MENSAGENS[estado],
    atualizadoEm: new Date().toISOString(),
    expiraEm: null,
  }
}
