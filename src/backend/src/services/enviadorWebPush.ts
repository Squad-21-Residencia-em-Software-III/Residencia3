import { generateRequestDetails } from 'web-push';
import type { ConfiguracaoWebPush } from '../config/env';
import type { PayloadPush } from '../models/notificacaoOutboxModel';
import { hostPushPermitido } from '../validators/pushSchemas';
import type { EnviadorPush } from './filaPush';
import { LIMITE_CORPO_PUSH, LIMITE_TITULO_PUSH, limitar } from './publicacaoNotificacoes';

/**
 * Envio Web Push (SCRUM-237): o `web-push` cifra o conteúdo (aes128gcm) e assina com VAPID; a requisição é
 * feita aqui, com `fetch`, para respeitar o cancelamento da fila (`sinal`, 10 s) e não seguir redirecionamento.
 * Resultados e novas tentativas ficam com a fila (filaPush.ts): aqui só se responde o status HTTP.
 */

// Igual à validade do item na fila: o serviço de push também descarta o que ficou velho demais
const TTL_SEGUNDOS = 24 * 60 * 60;
const TOPICO = /^[A-Za-z0-9_-]{1,32}$/;
const RETRY_AFTER_MAXIMO_S = 3600;
// Status que a fila trata como falha definitiva daquele aparelho, sem requisição
const STATUS_RECUSADO_LOCALMENTE = 400;

export type TransporteHttp = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Só o que o service worker (SCRUM-239) precisa. O texto aparece na tela bloqueada e pode chegar a um
 * aparelho que trocou de conta: quem publica não põe dado pessoal (publicarNotificacao), e aqui os limites
 * são aplicados de novo e qualquer outro campo (`entregues`, ids de usuário) fica de fora.
 */
export function conteudoDoPush(payload: PayloadPush): PayloadPush {
  // Só rota interna: um link externo no alerta poderia levar a uma página falsa
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') && !payload.url.startsWith('//')
    && !/[\s\\]/.test(payload.url) ? payload.url : '/';
  return {
    notificacao_id: payload.notificacao_id,
    titulo: limitar(String(payload.titulo ?? ''), LIMITE_TITULO_PUSH),
    corpo: limitar(String(payload.corpo ?? ''), LIMITE_CORPO_PUSH),
    url,
    ...(typeof payload.tag === 'string' && payload.tag ? { tag: payload.tag.slice(0, 64) } : {}),
  };
}

/** `Retry-After` em segundos ou como data HTTP; ausente ou inválido vale 0 (a fila usa a espera própria). */
export function segundosRetryAfter(valor: string | null, agora = Date.now()): number {
  if (!valor) return 0;
  const texto = valor.trim();
  const segundos = /^\d+$/.test(texto) ? Number(texto) : Math.ceil((Date.parse(texto) - agora) / 1000);
  return Number.isFinite(segundos) && segundos > 0 ? Math.min(segundos, RETRY_AFTER_MAXIMO_S) : 0;
}

export function criarEnviadorWebPush(
  config: Pick<ConfiguracaoWebPush, 'publicKey' | 'privateKey' | 'subject' | 'hostsPermitidos'>,
  transporte: TransporteHttp = fetch
): EnviadorPush {
  const vapidDetails = { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey };
  return async ({ endpoint, p256dh, auth }, payload, sinal) => {
    // Defesa em profundidade: a assinatura já foi validada ao ser criada (pushSchemas)
    if (!hostPushPermitido(endpoint, config.hostsPermitidos)) return { status: STATUS_RECUSADO_LOCALMENTE };
    const conteudo = conteudoDoPush(payload);
    let detalhes: ReturnType<typeof generateRequestDetails>;
    try {
      detalhes = generateRequestDetails({ endpoint, keys: { p256dh, auth } }, JSON.stringify(conteudo), {
        vapidDetails,
        TTL: TTL_SEGUNDOS,
        urgency: 'normal',
        contentEncoding: 'aes128gcm',
        // Mesmo tópico: o serviço de push troca o alerta ainda não entregue pelo novo, como a `tag` no aparelho
        ...(conteudo.tag && TOPICO.test(conteudo.tag) ? { topic: conteudo.tag } : {}),
      });
    } catch {
      // Chaves da assinatura que não cifram: repetir não resolve
      return { status: STATUS_RECUSADO_LOCALMENTE };
    }
    const cabecalhos: Record<string, string> = {};
    for (const [nome, valor] of Object.entries(detalhes.headers)) cabecalhos[nome] = String(valor);
    // Erro de rede ou cancelamento rejeita: a fila trata como temporário
    const resposta = await transporte(detalhes.endpoint, {
      method: 'POST',
      headers: cabecalhos,
      body: detalhes.body ? new Uint8Array(detalhes.body) : null,
      redirect: 'manual',
      signal: sinal,
    });
    // O corpo da resposta não é usado nem registrado
    await resposta.body?.cancel().catch(() => undefined);
    return { status: resposta.status, retryAfterSegundos: segundosRetryAfter(resposta.headers.get('retry-after')) };
  };
}
