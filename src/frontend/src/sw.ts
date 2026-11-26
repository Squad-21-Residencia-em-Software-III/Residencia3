/// <reference lib="webworker" />
/// <reference types="vite/client" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import {
  extrairPayloadPush,
  lerReferenciaPush,
  tratarCliqueNotificacao,
  tratarEventoPush,
  tratarMensagemSw,
} from './sw/logicaPushSw';
import { comTravaDeApresentacao, lerEstadoPush, registrarRecebimento, resetarBadgePush } from './sw/estadoPush';
import { limparAppBadge } from './utils/appBadging';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

// Limpa caches legados da fase generateSW sem quebrar PWAs já instalados.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// App Shell SPA para navegação, excluindo explicitamente qualquer rota `/api/*`.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  }),
);

// Segurança / LGPD: nunca armazenar respostas autenticadas da API em cache.
registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly());

// Fontes Google (mesma política de cache da Fase 1).
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-stylesheets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);


// O cliente Workbox só pede esta transição após confirmação explícita.
self.addEventListener('message', (event) => {
  const cliente = event.source;
  if (!cliente || !('url' in cliente) || new URL(cliente.url).origin !== self.location.origin) return;
  tratarMensagemSw(event.data, () => event.waitUntil(self.skipWaiting()));
});

const PUSH_NO_BUILD = import.meta.env.VITE_WEB_PUSH_ATIVO === 'true' &&
  import.meta.env.VITE_NOTIFICACOES_IN_APP_ATIVAS === 'true';

async function limparApresentacao() {
  await limparAppBadge();
  (await self.registration.getNotifications()).forEach((aviso) => aviso.close());
  await resetarBadgePush();
}

self.addEventListener('activate', (event) => {
  if (!PUSH_NO_BUILD) event.waitUntil(comTravaDeApresentacao(limparApresentacao));
});

async function pushDisponivel() {
  if (!PUSH_NO_BUILD) return false;
  try {
    const api = import.meta.env.VITE_API_URL ?? '/api';
    const resposta = await fetch(new URL(api + '/notificacoes/push-disponivel', self.location.origin), {
      cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(5000),
    });
    return resposta.ok && (await resposta.json())?.ativo === true;
  } catch {
    return false;
  }
}

self.addEventListener('push', (event) => {
  const payload = extrairPayloadPush(event.data?.text());
  event.waitUntil((async () => {
    if (!payload.vinculo) return;
    const disponivel = await pushDisponivel();
    await comTravaDeApresentacao(async () => {
      const atual = await lerEstadoPush();
      if (!atual || atual.encerramento || atual.vinculo !== payload.vinculo) return;
      if (!disponivel) {
        await limparApresentacao();
        return;
      }
      const id = payload.notificacao_id;
      if (id !== null && atual.recentes.includes(id)) return;
      const nav = self.navigator as WorkerNavigator & { setAppBadge?: () => Promise<void> };
      await tratarEventoPush(payload, {
        origem: self.location.origin,
        listarJanelas: () => self.clients.matchAll({ type: 'window', includeUncontrolled: true }),
        exibirNotificacao: (titulo, opcoes) => self.registration.showNotification(titulo, opcoes),
        definirBadgeGenerico: typeof nav.setAppBadge === 'function'
          ? () => nav.setAppBadge!()
          : undefined,
      });
      if (id !== null) await registrarRecebimento(atual.geracao, id);
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.waitUntil((async () => {
    const referencia = lerReferenciaPush(event.notification.data);
    const atual = await lerEstadoPush();
    if (referencia && (!atual || atual.encerramento || atual.vinculo !== referencia.vinculo)) {
      event.notification.close();
      return;
    }
    await tratarCliqueNotificacao(referencia, {
      origem: self.location.origin,
      fecharNotificacao: () => event.notification.close(),
      listarJanelas: () => self.clients.matchAll({ type: 'window', includeUncontrolled: true }),
      abrirJanela: (url) => self.clients.openWindow(url),
    });
  })());
});
