export const CHAVE_CLIQUE_PUSH = 'fsph.push.aviso';
export const TIPO_MSG_SKIP_WAITING = 'SKIP_WAITING';
export const TIPO_MSG_PUSH_FOREGROUND = 'PUSH_EM_PRIMEIRO_PLANO';
export const TIPO_MSG_NAVEGAR_NOTIFICACAO = 'NAVEGAR_NOTIFICACAO';

export const ICONE_NOTIFICACAO_PADRAO = '/assets/pwa-192x192.png';
export const BADGE_NOTIFICACAO_PADRAO = '/assets/pwa-badge-72x72.png';

const TITULO_PADRAO = 'Frota FSPH';
const CORPO_PADRAO = 'Você recebeu uma nova notificação.';

export function idNotificacao(val: unknown): val is number {
  return typeof val === 'number' && Number.isSafeInteger(val) && val > 0 && val <= 2147483647;
}

export function vinculoValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[A-Za-z0-9_-]{43}$/.test(valor);
}

export interface ReferenciaPush {
  notificacao_id: number;
  vinculo: string;
}

export interface PayloadPushNormalizado {
  notificacao_id: number | null;
  vinculo: string | null;
  titulo: string;
  corpo: string;
  tag?: string;
}

export interface ClienteJanelaSw {
  url: string;
  focused?: boolean;
  visibilityState?: string;
  focus: () => Promise<unknown>;
  postMessage: (mensagem: unknown) => void;
}

export interface OpcoesNotificacaoSw {
  body: string;
  icon: string;
  badge: string;
  tag?: string;
  data: ReferenciaPush | null;
}

export interface AmbientePushSw {
  origem: string;
  listarJanelas: () => Promise<readonly ClienteJanelaSw[]>;
  exibirNotificacao: (titulo: string, opcoes: OpcoesNotificacaoSw) => Promise<void>;
  definirBadgeGenerico?: () => Promise<void>;
}

export interface AmbienteCliqueSw {
  origem: string;
  fecharNotificacao: () => void;
  listarJanelas: () => Promise<readonly ClienteJanelaSw[]>;
  abrirJanela: (url: string) => Promise<unknown>;
}

const CAMPOS_PUSH = new Set(['notificacao_id', 'vinculo', 'titulo', 'corpo', 'url', 'tag']);
const TAG_PUSH = /^[A-Za-z0-9_-]{1,64}$/;
const ORIGEM_FICTICIA = 'https://frota.fsph.local';

function urlInterna(url: unknown): boolean {
  if (typeof url !== 'string' || url.length > 256 || !url.startsWith('/') ||
    url.includes('//') || /[\s\\\u0000-\u001f\u007f]|%(?:00|0a|0d|2f|5c)/i.test(url)) return false;
  return new URL(url, ORIGEM_FICTICIA).origin === ORIGEM_FICTICIA;
}

function textoValido(valor: unknown, limite: number): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0 &&
    [...valor].length <= limite && !/[\u0000-\u001f\u007f]/.test(valor);
}

/** Conteúdo inválido recebe o mesmo texto genérico. URLs do Push jamais são usadas para navegar. */
export function extrairPayloadPush(textoBruto: string | null | undefined): PayloadPushNormalizado {
  const fallback = { notificacao_id: null, vinculo: null, titulo: TITULO_PADRAO, corpo: CORPO_PADRAO };
  if (!textoBruto || textoBruto.length > 2048) return fallback;
  try {
    const dados = JSON.parse(textoBruto) as Record<string, unknown>;
    if (!dados || typeof dados !== 'object' || Array.isArray(dados) || !vinculoValido(dados.vinculo)) return fallback;
    const { notificacao_id, vinculo, titulo, corpo, tag } = dados;
    if (!Object.keys(dados).every((campo) => CAMPOS_PUSH.has(campo)) ||
        !idNotificacao(notificacao_id) || !textoValido(titulo, 45) || !textoValido(corpo, 110) ||
        !urlInterna(dados.url) || (tag !== undefined && (typeof tag !== 'string' || !TAG_PUSH.test(tag)))) {
      return { ...fallback, vinculo };
    }
    return { notificacao_id, vinculo, titulo, corpo, ...(tag ? { tag } : {}) };
  } catch {
    return fallback;
  }
}

export function lerReferenciaPush(dados: unknown): ReferenciaPush | null {
  if (!dados || typeof dados !== 'object') return null;
  const { notificacao_id, vinculo } = dados as Partial<ReferenciaPush>;
  return idNotificacao(notificacao_id) && vinculoValido(vinculo) ? { notificacao_id, vinculo } : null;
}

function mesmaOrigem(url: string, origem: string): boolean {
  try {
    return new URL(url).origin === origem;
  } catch {
    return false;
  }
}

export function clienteEmPrimeiroPlano(client: ClienteJanelaSw, origem: string): boolean {
  return mesmaOrigem(client.url, origem) && !new URL(client.url).pathname.startsWith('/login') &&
    client.visibilityState === 'visible' && client.focused === true;
}

export async function tratarEventoPush(payload: PayloadPushNormalizado, ambiente: AmbientePushSw): Promise<void> {
  const referencia = lerReferenciaPush(payload);
  const janelas = referencia ? await ambiente.listarJanelas() : [];
  const janelaFocada = janelas.find((janela) => clienteEmPrimeiroPlano(janela, ambiente.origem));
  if (janelaFocada && referencia) {
    janelaFocada.postMessage({ tipo: TIPO_MSG_PUSH_FOREGROUND, ...referencia });
    return;
  }

  await ambiente.exibirNotificacao(payload.titulo, {
    body: payload.corpo,
    icon: ICONE_NOTIFICACAO_PADRAO,
    badge: BADGE_NOTIFICACAO_PADRAO,
    ...(payload.tag ? { tag: payload.tag } : {}),
    data: referencia,
  });
  if (referencia) await ambiente.definirBadgeGenerico?.().catch(() => undefined);
}

export async function tratarCliqueNotificacao(
  referencia: ReferenciaPush | null, ambiente: AmbienteCliqueSw,
): Promise<void> {
  ambiente.fecharNotificacao();
  const janelas = (await ambiente.listarJanelas()).filter((janela) => mesmaOrigem(janela.url, ambiente.origem));
  const alvo = janelas.find((janela) => janela.focused) ??
    janelas.find((janela) => janela.visibilityState === 'visible') ?? janelas[0];
  if (alvo) {
    await alvo.focus().catch(() => undefined);
    if (referencia) alvo.postMessage({ tipo: TIPO_MSG_NAVEGAR_NOTIFICACAO, ...referencia });
    return;
  }
  await ambiente.abrirJanela(referencia ? '/?aviso=' + referencia.notificacao_id : '/');
}

export function tratarMensagemSw(data: unknown, skipWaiting: () => void): boolean {
  if (!data || typeof data !== 'object' || Object.keys(data).length !== 1 ||
    !('type' in data) || data.type !== TIPO_MSG_SKIP_WAITING) return false;
  skipWaiting();
  return true;
}
