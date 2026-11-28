# VisualizadorRotaMapa (SCRUM-292)

Componente puro, reutilizável e acessível de visualização de rotas planejadas e histórico geográfico GPS da frota FSPH, construído sobre `MapaBase` (`SCRUM-276`) e integrado às paletas de daltonismo (`SCRUM-307`).

## Arquivos Principais

- `src/frontend/src/types/mapa.ts` — contratos públicos de planejamento e histórico (`PontoRotaMapa`, `RotaPlanejadaMapa`, `CheckpointGpsMapa`, `TrechoHistoricoMapa`, `LacunaGpsMapa`, `HistoricoGeograficoMapa`, `OdometroRotaMapa`).
- `src/frontend/src/utils/geometriaRota.ts` — utilitários puros (`decodificarPolyline5`, `calcularLimitesCoordenadas`, `gerarCirculoGeoJson`, `criarFeatureCollectionLinhas`, `formatarDistanciaKm`, `calcularDistanciaOdometroKm`, `formatarHorarioCheckpoint`).
- `src/frontend/src/components/mapas/MapaBaseCanvas.tsx` — suporte retrocompatível a `limitesControlados` (`fitBounds` com `prefers-reduced-motion`) e `ResizeObserver` (`mapa.resize()`).
- `src/frontend/src/components/mapas/CamadasRotaMapa.tsx` — camadas MapLibre carregadas via `React.lazy` (preservando o code-splitting da `SCRUM-276`).
- `src/frontend/src/components/mapas/VisualizadorRotaMapa.tsx` — componente principal acessível e responsivo.

---

## Contrato de Props (`VisualizadorRotaMapa`)

| Prop | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `pontos` | `PontoRotaMapa[]` | *(obrigatório)* | Origem, paradas numeradas (`1..N`), destino e retorno opcional. |
| `rotaPlanejada` | `RotaPlanejadaMapa \| null` | `null` | `geometria` (`polyline5`), `distanciaMetros`, `metodo` (`OSRM`, `HAVERSINE_APROXIMADO`, `INDISPONIVEL`) já salvos. |
| `historico` | `HistoricoGeograficoMapa \| null` | `null` | Camadas opcionais de histórico pós-viagem (`checkpoints`, `trechos` observados/estimados e `lacunas`). |
| `odometro` | `OdometroRotaMapa \| null` | `null` | `kmInicial` e `kmFinal` exibidos como comparativo estritamente informativo (sem alerta por divergência). |
| `exibicaoMapa` | `'aberto' \| 'expansivel'` | `'aberto'` | Controla se o mapa abre de imediato ou recolhido sob botão `"Ver mapa da rota"`. |
| `alturaMapa` | `string` | `'290px'` | Altura do contêiner cartográfico. |

---

## Convenção Visual, Acessibilidade e Garantias

- **Zero chamadas OSRM ou GPS internas:** o componente nunca dispara `fetch`, `mapasApi.calcularRota` nem `navigator.geolocation`. Rotas salvas e históricos renderizam integralmente a partir das props.
- **Identidade visual FSPH (`FSPH_PIN.png`):** todos os pontos do roteiro (origem, paradas numeradas `1..N`, destino/retorno e ponto único) usam o pin oficial `/assets/FSPH_PIN.png` (`anchor="bottom"`) com badge discreto. Checkpoints GPS usam marcadores circulares menores para não se confundirem com os pontos planejados.
- **Separação inequívoca entre camadas (padrão de traço + cor + legenda):**
  - **Rota planejada (OSRM):** linha sólida com halo branco.
  - **Ligação aproximada (sem `polyline5`):** linha tracejada (`[4, 3]`) + `Alert` informativo.
  - **Trecho observado (GPS real):** linha sólida distinta com halo branco.
  - **Trecho estimado:** linha pontilhada (`[1, 2.5]`).
  - **Lacunas (interrupção de sinal GPS):** **nunca** são ligadas no mapa como percurso confirmado; o traçado interrompe naturalmente e a perda de sinal é comunicada em `Alert` (`tone="warning"`) acima do mapa + item dedicado na linha do tempo dos checkpoints.
  - **Círculo de incerteza:** desenhado automaticamente ao redor de qualquer checkpoint com `precisaoMetros > 150`.
- **Casos de borda:** `0 pontos` oculta o mapa preservando a lista textual; `1 ponto` centraliza no pin único sem `fitBounds`; geometria `polyline5` inválida é descartada sem quebrar; sem WebGL, toda a informação permanece acessível no resumo textual abaixo.

---

## Matriz Oficial de Exibição por Tela

| Tela / Fluxo | Tarefa | `exibicaoMapa` | Camadas |
| :--- | :---: | :---: | :--- |
| Solicitações ADM (`ModalNovaSolicitacao`) | `SCRUM-282` | `expansivel` | Planejado |
| Análise / Agendamento / Reprogramação ADM | `SCRUM-282` | `expansivel` | Planejado |
| Triagem e Agendamento SVO | `SCRUM-284` | `expansivel` | Planejado |
| Detalhes da Viagem / Coleta (agendada ou em curso) | `SCRUM-282`/`284` | `aberto` | Planejado salvo |
| Detalhes da Viagem / Coleta Concluída (histórico) | `SCRUM-294` | `aberto` | Planejado + Histórico + Odômetro |
| Área do Motorista (`CartaoViagem`) e `MinhasColetasSvoPage` | `SCRUM-284`/`294` | `expansivel` | Planejado / Histórico próprio |
