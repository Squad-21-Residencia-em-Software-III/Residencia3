export const TIPO_MSG_SKIP_WAITING = 'SKIP_WAITING';
export const TIPO_MSG_PUSH_FOREGROUND = 'PUSH_EM_PRIMEIRO_PLANO';
export const TIPO_MSG_NAVEGAR_NOTIFICACAO = 'NAVEGAR_NOTIFICACAO';

export const ICONE_NOTIFICACAO_PADRAO = '/assets/pwa-192x192.png';
export const BADGE_NOTIFICACAO_PADRAO = '/assets/pwa-badge-72x72.png';

const TITULO_PADRAO = 'Frota FSPH';
const CORPO_PADRAO = 'Você recebeu uma nova notificação.';
const ORIGEM_FICTICIA = 'https://frota.fsph.local';

export interface PayloadPushNormalizado {
  notificacao_id: number | string | null;
  titulo: string;
  corpo: string;
  url: string;
  tag?: string;
}

export interface MensagemPushForeground {
  tipo: typeof TIPO_MSG_PUSH_FOREGROUND;
  payload: PayloadPushNormalizado;
}

export interface MensagemNavegarNotificacao {
  tipo: typeof TIPO_MSG_NAVEGAR_NOTIFICACAO;
  url: string;
  notificacao_id: number | string | null;
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
  data: {
    notificacao_id: number | string | null;
    url: string;
  };
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

/**
 * Sanitiza a URL recebida no payload Push ou no clique da notificação:
 * aceita apenas rota interna iniciada por `/` (bloqueia domínios externos, `//`, `\`, espaços e controle).
 */
export function normalizarUrlPush(url: unknown): string {
  if (typeof url !== 'string' || url.length === 0) return '/';
  if (!url.startsWith('/') || url.startsWith('//')) return '/';
  if (/[\s\u0000-\u001f\u007f\\]/.test(url)) return '/';
  if (url.includes('//')) return '/';

  try {
    const parsed = new URL(url, ORIGEM_FICTICIA);
    if (parsed.origin !== ORIGEM_FICTICIA || !parsed.pathname.startsWith('/')) return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

/**
 * Interpreta o payload enviado pelo backend Web Push (SCRUM-237:
 * `{ notificacao_id, titulo, corpo, url, tag }`) com fallback seguro para texto simples ou JSON inválido.
 */
export function extrairPayloadPush(textoBruto: string | null | undefined): PayloadPushNormalizado {
  if (typeof textoBruto !== 'string' || textoBruto.trim().length === 0) {
    return {
      notificacao_id: null,
      titulo: TITULO_PADRAO,
      corpo: CORPO_PADRAO,
      url: '/',
    };
  }

  try {
    const dados = JSON.parse(textoBruto) as Record<string, unknown>;
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
      throw new Error('Payload não é objeto');
    }

    const idBruto = dados.notificacao_id;
    const notificacaoId =
      typeof idBruto === 'number' && Number.isFinite(idBruto)
        ? idBruto
        : typeof idBruto === 'string' && idBruto.trim().length > 0
          ? idBruto.trim()
          : null;

    const titulo =
      typeof dados.titulo === 'string' && dados.titulo.trim().length > 0
        ? dados.titulo.trim()
        : TITULO_PADRAO;

    const corpo = typeof dados.corpo === 'string' ? dados.corpo.trim() : '';
    const url = normalizarUrlPush(dados.url);
    const tag =
      typeof dados.tag === 'string' && dados.tag.trim().length > 0
        ? dados.tag.trim().slice(0, 64)
        : undefined;

    return {
      notificacao_id: notificacaoId,
      titulo,
      corpo,
      url,
      ...(tag ? { tag } : {}),
    };
  } catch {
    return {
      notificacao_id: null,
      titulo: TITULO_PADRAO,
      corpo: textoBruto.trim().slice(0, 110),
      url: '/',
    };
  }
}

function mesmaOrigem(urlCliente: string, origemAtual: string): boolean {
  try {
    return new URL(urlCliente).origin === origemAtual;
  } catch {
    return false;
  }
}

function estaEmRotaDeLogin(urlCliente: string): boolean {
  try {
    return new URL(urlCliente).pathname.startsWith('/login');
  } catch {
    return false;
  }
}

/**
 * Verifica se há uma janela da mesma origem visível, focada e fora da tela de login.
 * Nessa condição, o app exibe Toast em primeiro plano sem duplicar alerta do sistema operacional.
 */
export function clienteEmPrimeiroPlano(client: ClienteJanelaSw, origemAtual: string): boolean {
  if (!mesmaOrigem(client.url, origemAtual)) return false;
  if (estaEmRotaDeLogin(client.url)) return false;
  return client.visibilityState === 'visible' && client.focused === true;
}

export async function tratarEventoPush(
  payload: PayloadPushNormalizado,
  ambiente: AmbientePushSw,
): Promise<{ modo: 'foreground' | 'background' }> {
  const janelas = await ambiente.listarJanelas();
  const janelaFocada = janelas.find((janela) => clienteEmPrimeiroPlano(janela, ambiente.origem));

  if (janelaFocada) {
    const mensagem: MensagemPushForeground = {
      tipo: TIPO_MSG_PUSH_FOREGROUND,
      payload,
    };
    janelaFocada.postMessage(mensagem);
    return { modo: 'foreground' };
  }

  await ambiente.exibirNotificacao(payload.titulo, {
    body: payload.corpo,
    icon: ICONE_NOTIFICACAO_PADRAO,
    badge: BADGE_NOTIFICACAO_PADRAO,
    ...(payload.tag ? { tag: payload.tag } : {}),
    data: {
      notificacao_id: payload.notificacao_id,
      url: payload.url,
    },
  });

  if (ambiente.definirBadgeGenerico) {
    try {
      await ambiente.definirBadgeGenerico();
    } catch {
      // App Badging é opcional; falhas nunca bloqueiam a exibição da notificação.
    }
  }

  return { modo: 'background' };
}

export async function tratarCliqueNotificacao(
  dados: { notificacao_id?: number | string | null; url?: unknown } | null | undefined,
  ambiente: AmbienteCliqueSw,
): Promise<{ acao: 'focar_existente' | 'abrir_janela'; url: string }> {
  ambiente.fecharNotificacao();

  const url = normalizarUrlPush(dados?.url);
  const notificacaoId =
    typeof dados?.notificacao_id === 'number' || typeof dados?.notificacao_id === 'string'
      ? dados.notificacao_id
      : null;

  const janelas = await ambiente.listarJanelas();
  const mesmasOrigem = janelas.filter((janela) => mesmaOrigem(janela.url, ambiente.origem));
  const alvo =
    mesmasOrigem.find((janela) => janela.focused) ??
    mesmasOrigem.find((janela) => janela.visibilityState === 'visible') ??
    mesmasOrigem[0];

  if (alvo) {
    try {
      await alvo.focus();
    } catch {
      // Alguns navegadores podem recusar focus; ainda assim enviamos a navegação.
    }
    const mensagem: MensagemNavegarNotificacao = {
      tipo: TIPO_MSG_NAVEGAR_NOTIFICACAO,
      url,
      notificacao_id: notificacaoId,
    };
    alvo.postMessage(mensagem);
    return { acao: 'focar_existente', url };
  }

  await ambiente.abrirJanela(url);
  return { acao: 'abrir_janela', url };
}

/**
 * Atualização controlada para `registerType: 'prompt'`:
 * só executa `skipWaiting()` mediante confirmação explícita do usuário (`SKIP_WAITING`),
 * evitando reload-loop em PWAs já instalados.
 */
export function tratarMensagemSw(data: unknown, skipWaiting: () => void): boolean {
  if (data && typeof data === 'object' && (data as { type?: unknown }).type === TIPO_MSG_SKIP_WAITING) {
    skipWaiting();
    return true;
  }
  return false;
}
