/// <reference lib="webworker" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import {
  extrairPayloadPush,
  tratarCliqueNotificacao,
  tratarEventoPush,
  tratarMensagemSw,
} from './sw/logicaPushSw';

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

// Atualização controlada (registerType: 'prompt'): evita skipWaiting automático e reload-loop.
self.addEventListener('message', (event) => {
  tratarMensagemSw(event.data, () => {
    void self.skipWaiting();
  });
});

// Recebimento de Web Push (contrato SCRUM-237).
self.addEventListener('push', (event) => {
  const textoBruto = event.data ? event.data.text() : null;
  const payload = extrairPayloadPush(textoBruto);

  const navComBadge = self.navigator as WorkerNavigator & {
    setAppBadge?: (count?: number) => Promise<void>;
  };

  event.waitUntil(
    tratarEventoPush(payload, {
      origem: self.location.origin,
      listarJanelas: () => self.clients.matchAll({ type: 'window', includeUncontrolled: true }),
      exibirNotificacao: (titulo, opcoes) => self.registration.showNotification(titulo, opcoes),
      definirBadgeGenerico:
        typeof navComBadge.setAppBadge === 'function'
          ? () => navComBadge.setAppBadge!()
          : undefined,
    }),
  );
});

// Clique na notificação do sistema operacional: foco em aba existente ou abertura segura.
self.addEventListener('notificationclick', (event) => {
  const dados = event.notification.data as
    | { notificacao_id?: number | string | null; url?: unknown }
    | undefined;

  event.waitUntil(
    tratarCliqueNotificacao(dados, {
      origem: self.location.origin,
      fecharNotificacao: () => event.notification.close(),
      listarJanelas: () => self.clients.matchAll({ type: 'window', includeUncontrolled: true }),
      abrirJanela: (url) => self.clients.openWindow(url),
    }),
  );
});
