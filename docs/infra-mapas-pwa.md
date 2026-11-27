# Infraestrutura Cartográfica Gratuita, PWA e CSP (Frontend)

Referência: **SCRUM-276** · Baseline `develop`: `361ed10`.

## 1. Stack e Origens Autorizadas (100% Gratuita)

- **Biblioteca de mapa:** `maplibre-gl` + `react-map-gl/maplibre`, carregada sob demanda via `React.lazy` em `src/frontend/src/components/mapas/MapaBase.tsx`.
- **Provedor de tiles e estilo:** [OpenFreeMap](https://openfreemap.org/) estilo **Liberty** (`https://tiles.openfreemap.org/styles/liberty`), sem chave de API, sem cartão de crédito e sem cobrança.
- **Origens verificadas no estilo Liberty:** todos os recursos retornados pelo JSON oficial (`/styles/liberty`, `/backup_planet`, `/sprites/*`, `/fonts/*`, `/natural_earth/*`) pertencem exclusivamente à origem `https://tiles.openfreemap.org`.
- **Pin institucional:** `/assets/FSPH_PIN.png` (já presente no precache do PWA via `vite.config.ts`).
- **Atribuição obrigatória:** exibida de forma acessível em `MapaBaseCanvas.tsx` com links para OpenFreeMap, OpenStreetMap, correção no mapa (`openstreetmap.org/fixthemap`) e FOSSGIS/OSRM (`routing.openstreetmap.de/about.html`).
- **Fallback WebGL / erro:** `verificarSuporteWebgl()` + `LimiteErroMapa` garantem degradação limpa para entrada manual de endereço caso WebGL não seja suportado ou o estilo falhe.

## 2. Variável de Ambiente Não-Secreta e Proxy

- `VITE_MAPA_ESTILO_URL` *(opcional, em `src/frontend/.env.example`)*: permite selecionar outro estilo sob `https://tiles.openfreemap.org/styles/*`. Qualquer valor vazio ou fora dessa allowlist retorna automaticamente ao estilo Liberty (`validarUrlEstiloMapa` em `src/frontend/src/config/mapas.ts`).
- As flags de ativação da Fase 3 (`VITE_FASE3_MAPAS_INTERNOS`, `VITE_FASE3_MAPAS_SVO`, etc.) permanecem centralizadas no contrato da `SCRUM-296` (`recursosBackend.ts`).
- **Proxy `/api` (Vercel → Render):** mantido inalterado em `src/frontend/vercel.json`, encaminhando `/api/*` para `https://fsph-api.onrender.com` com o cabeçalho `x-proxy-secret` injetado via variável de ambiente `PROXY_SECRET` no Vercel.

## 3. Política de Cache PWA (`src/frontend/src/sw.ts`)

| Recurso | Origem / Padrão | Estratégia Workbox | Limite | Validade | Quota |
| --- | --- | --- | --- | --- | --- |
| API interna e pública | `/api/*` | `NetworkOnly` | — | — | Nunca entra no `CacheStorage` |
| Estilos e TileJSON | `https://tiles.openfreemap.org` (`/styles/*`, `/planet`, `/backup_planet`) | `StaleWhileRevalidate` (`openfreemap-styles`) | 10 entradas | 7 dias | `purgeOnQuotaError: true` |
| Tiles, sprites e glyphs | `https://tiles.openfreemap.org` (`/sprites/*`, `/fonts/*`, `/natural_earth/*`, `*.pbf`, `*.mvt`, `*.png`, `*.webp`) | `CacheFirst` (`openfreemap-assets`) | 240 entradas | 7 dias | `purgeOnQuotaError: true` |

- **Orçamento conjunto garantido:** `10 + 240 = 250 entradas` e expiração de `7 dias` (`604.800 s`), sem prefetch massivo e preservando integralmente o ciclo de vida do Service Worker, Web Push e App Badging.

## 4. Content-Security-Policy (`src/frontend/vercel.json`)

Aplicada no cabeçalho global de todas as rotas do frontend com princípio de privilégio mínimo:

- `default-src 'self'`
- `script-src 'self'`
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
- `font-src 'self' https://fonts.gstatic.com https://tiles.openfreemap.org`
- `img-src 'self' data: blob: https://tiles.openfreemap.org`
- `connect-src 'self' https://tiles.openfreemap.org`
- `worker-src 'self' blob:` e `child-src 'self' blob:` *(Web Workers do MapLibre + Service Worker do PWA, sem permissões globais)*
- `manifest-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`

## 5. Homologação e Escopo das Evidências

- **Automatizado (Vitest / jsdom + Build + Audit):**
  - Renderização de `MapaBase` com estilo Liberty, atribuições obrigatórias, pin `FSPH_PIN.png`, rejeição de origens inválidas e fallback WebGL (`MapaBase.test.tsx`).
  - Regras de cache SW, orçamento conjunto ≤ 250 entradas / 7 dias, `purgeOnQuotaError: true`, bloqueio de `/api/*` e de origens de terceiros (`cacheMapasSw.test.ts`), mais regressão completa de Push (`barreiraPush`, `estadoPush`, `logicaPushSw`).
  - Build de produção (`tsc -b && vite build` incluindo compilação do `sw.ts`) e auditoria de segurança (`scripts/audit-ci.cjs`).
- **Homologação em aparelho físico / navegador mobile real:** **Não executado nesta entrega automatizada** — validar em staging/preview do Vercel a inspeção visual do Liberty, o `CacheStorage` real no DevTools e o recebimento de Push após atualização do SW.
