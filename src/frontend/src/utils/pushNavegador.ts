import type { AssinaturaPush } from '../services/api/notificacoesPushApi';

const ESPERA_SERVICE_WORKER_MS = 8000;

/** No iPhone/iPad fora do aplicativo instalado, `PushManager` e `Notification` nem existem. */
export function suportaPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** `ready` nunca responde quando não há service worker (ex.: desenvolvimento), por isso o limite. */
async function registroPronto(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    timer = setTimeout(
      () => rejeitar(new Error('O aplicativo ainda está sendo preparado. Recarregue a página e tente de novo.')),
      ESPERA_SERVICE_WORKER_MS,
    );
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, limite]);
  } finally {
    clearTimeout(timer);
  }
}

export async function assinaturaDoAparelho(): Promise<PushSubscription | null> {
  if (!suportaPush()) return null;
  const registro = await navigator.serviceWorker.getRegistration();
  return (await registro?.pushManager?.getSubscription()) ?? null;
}

/** Chave VAPID pública (base64url) no formato que o navegador pede. */
export function chaveEmBytes(chave: string): Uint8Array<ArrayBuffer> {
  const base64 = chave.replace(/-/g, '+').replace(/_/g, '/');
  const texto = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(texto, (caractere) => caractere.charCodeAt(0));
}

/**
 * Sempre cria uma assinatura nova: a que já existir pode ser de outra conta usada neste aparelho
 * ou de uma chave VAPID antiga, e não deve ser transferida.
 */
export async function criarAssinatura(chavePublica: string): Promise<PushSubscription> {
  const { pushManager } = await registroPronto();
  await (await pushManager.getSubscription())?.unsubscribe();
  return pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(chavePublica) });
}

/** Encerra a assinatura no navegador. O serviço de push passa a responder 410 e o back a descarta. */
export async function encerrarAssinaturaDoAparelho(): Promise<void> {
  await (await assinaturaDoAparelho())?.unsubscribe();
}

export function dadosDaAssinatura(assinatura: PushSubscription): AssinaturaPush {
  const { endpoint, keys } = assinatura.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error('O navegador não concluiu a ativação dos alertas. Tente de novo.');
  }
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}
