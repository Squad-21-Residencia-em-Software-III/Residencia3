# Infraestrutura Cartográfica Gratuita, PWA e CSP (Frontend)

Referência: **SCRUM-276** · Baseline `develop`: `361ed10`.

## 1. Stack e Origens Autorizadas (100% Gratuita)

- **Biblioteca de mapa:** `maplibre-gl` + `react-map-gl/maplibre`, carregada sob demanda via `React.lazy` em `src/frontend/src/components/mapas/MapaBase.tsx`.
- **Provedor de tiles e estilo:** [OpenFreeMap](https://openfreemap.org/) estilo **Liberty** (`https://tiles.openfreemap.org/styles/liberty`), sem chave de API, sem cartão de crédito e sem cobrança.
- **Origens verificadas no estilo Liberty:** todos os recursos retornados pelo JSON oficial (`/styles/liberty`, `/backup_planet`, `/sprites/*`, `/fonts/*`, `/natural_earth/*`) pertencem exclusivamente à origem `https://tiles.openfreemap.org`.
- **Pin institucional:** `/assets/FSPH_PIN.png` (já presente no precache do PWA via `vite.config.ts`).
- **Atribuição obrigatória:** exibida de forma acessível em `MapaBaseCanvas.tsx` com links para OpenFreeMap, OpenMapTiles, OpenStreetMap, correção no mapa (`openstreetmap.org/fixthemap`) e FOSSGIS/OSRM (`routing.openstreetmap.de/about.html`).
- **Geografia:** o centro inicial usa a referência aproximada de Aracaju (-10.9472, -37.0731). A posição oficial de unidades depende da SCRUM-274. A homologação usa o pin institucional sobre essa referência aproximada como dado de teste.
- **Carregamento e fallback:** o Vite publica o worker com URL versionada na mesma origem. O callback comunica `webgl` uma vez quando WebGL 2 está indisponível. Falhas de inicialização usam `erro`. O mapa aguarda até 12 segundos pelo evento de carregamento e por tiles de uma fonte cartográfica. Um erro isolado de tile permite que os demais tiles sejam carregados.

## 2. Variável de Ambiente Não-Secreta e Proxy

- `VITE_MAPA_ESTILO_URL` *(opcional, em `src/frontend/.env.example`)*: permite selecionar outro estilo sob `https://tiles.openfreemap.org/styles/*`. Qualquer valor vazio ou fora dessa allowlist retorna automaticamente ao estilo Liberty (`validarUrlEstiloMapa` em `src/frontend/src/config/mapas.ts`).
- As flags de ativação da Fase 3 (`VITE_FASE3_MAPAS_INTERNOS`, `VITE_FASE3_MAPAS_SVO`, etc.) permanecem centralizadas no contrato da `SCRUM-296` (`recursosBackend.ts`).
- **Proxy `/api` (Vercel → Render):** mantido inalterado em `src/frontend/vercel.json`, encaminhando `/api/*` para `https://fsph-api.onrender.com` com o cabeçalho `x-proxy-secret` injetado via variável de ambiente `PROXY_SECRET` no Vercel.
- O preview da branch usa `VITE_API_URL=/api`. O CSP permite a API de mesma origem. Um ambiente autorizado que use URL absoluta exigirá a origem exata em `connect-src` e a configuração correspondente de CORS no backend.


## 3. Política de Cache PWA (`src/frontend/src/sw.ts`)

| Recurso | Origem / Padrão | Estratégia Workbox | Limite | Validade | Quota |
| --- | --- | --- | --- | --- | --- |
| API interna e pública | `/api/*` | `NetworkOnly` | — | — | Nunca entra no `CacheStorage` |
| Estilos e TileJSON | `https://tiles.openfreemap.org` (`/styles/*`, `/planet`, `/backup_planet`) | `StaleWhileRevalidate` (`openfreemap-styles`) | 10 entradas | 7 dias | `purgeOnQuotaError: true` |
| Tiles, sprites e glyphs | `https://tiles.openfreemap.org` (assets de `/sprites/` e `/fonts/`, tiles de `/planet/`, `/backup_planet/` e `/natural_earth/`, com extensões permitidas) | `CacheFirst` (`openfreemap-assets`) | 240 entradas | 7 dias | `purgeOnQuotaError: true` |

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

## 5. Homologação e evidências

Execução em 27/11/2026. Harness local temporário, build Vite em modo de produção e CSP de `vercel.json` aplicada por cabeçalho HTTP. O aplicativo de teste usou dados sintéticos. [Resultados estruturados](evidencias/scrum-276/browser-evidence.json).

| Cobertura | Resultado |
| --- | --- |
| Renderização real em Chrome 158 no Windows | Liberty e TileJSON responderam 200. O mapa renderizou seis tiles vetoriais com WebGL 2 via SwiftShader. Worker da mesma origem, fontes, pin e cinco atribuições visíveis. Zero violações CSP observadas no mapa. [Captura desktop](evidencias/scrum-276/chrome-desktop.png) |
| Emulação mobile | Pixel 7 (412 × 839) e iPhone 13 (390 × 664) no Chrome. Quatro tiles vetoriais por perfil, workers ativos e atribuições dentro do viewport. |
| Falhas | Chrome com WebGL 2 desabilitado exibiu fallback acessível e motivo `webgl`. Bloqueio do Liberty exibiu fallback com motivo `erro`. Falha isolada de tile com restante do mapa funcional coberta em Vitest com mock. [Captura do fallback](evidencias/scrum-276/chrome-fallback.png) |
| CSP e proxy no preview | O cliente autenticado na Vercel recebeu 200 e a CSP global. O proxy entregou 200 com cabeçalho de origem Render para `/api/status`. Login e contador de notificações com Bearer foram exercitados em Chrome no ambiente sintético local. |
| CacheStorage real | O Service Worker gravou dois metadados de mapa e dez recursos incluindo tiles, sprites e glyphs. Com fixtures no worker, estilo e TileJSON devolveram cache antes de atualizar em segundo plano. Tile repetido usou CacheFirst. Resposta de oito dias foi recusada. A capacidade estabilizou em 10 + 240 e a quota simulada removeu ambos os caches. A API autenticada e caminhos não cartográficos ficaram fora do CacheStorage. |
| Ciclo do PWA e notificações | Manifesto standalone, atualização aguardando e ativada após `SKIP_WAITING`. Um evento Push sintético pelo protocolo do Chrome exibiu a notificação e chamou `setAppBadge` uma vez, com instrumentação local. |
| Recuperação depois da renderização | Vitest simula perda e restauração de WebGL, falha total posterior de tiles e troca de estilo em uma instância já ativa. A recuperação dentro do prazo mantém o mapa montado. A indisponibilidade persistente informa o consumidor e oferece entrada manual. |
| WebGL em Chrome desktop após renderização | Em Chrome 158.0.8127.88 no Windows, a página isolada carregou tiles reais do Liberty sob a CSP do projeto. A extensão WebGL de teste simulou perda e restauração mantendo o mapa montado. Perda persistente acionou o fallback com motivo `erro`. Zero violações CSP observadas. |
| Aparelhos físicos, PWA instalado e recebimento Push externo | **Não executado.** Requer ambiente de homologação e dispositivos físicos. |

Em homologação, abrir a aplicação com conta de teste, instalar o PWA no Android e no iOS, conferir o mapa e as atribuições, autorizar notificações, enviar um evento sintético pelo backend autorizado com o aparelho em segundo plano e conferir chegada, badge e navegação ao tocar no aviso. Validar novamente depois de aceitar uma atualização do Service Worker.
