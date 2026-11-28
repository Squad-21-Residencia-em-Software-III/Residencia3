# SeletorLocalMapa e Cliente `mapasApi`

Componente reutilizável de seleção de endereço/coordenadas e cliente REST de mapas do frontend FSPH, construídos sobre o proxy `/api/mapas/*` (`SCRUM-275`) e a fundação `MapaBase` (`SCRUM-276`).

## Arquivos Principais

- `src/frontend/src/types/mapa.ts` — tipos compartilhados (`OperacaoMapa`, `UnidadeInstitucional`, `EnderecoMapa`, `RespostaBuscaMapa`, `RespostaRotaMapa`, `LocalSelecionado`).
- `src/frontend/src/utils/localizacaoMapa.ts` — detecção/formatação de CEP, proteção contra termos sensíveis na busca textual, cerca aproximada `LIMITES_SERGIPE` e formatação legível de `EnderecoMapa`.
- `src/frontend/src/services/api/mapasApi.ts` — cliente único para `/api/mapas/buscar`, `/api/mapas/reverso`, `/api/mapas/rota` e rotas públicas `/api/portal-svo/mapas/buscar` e `/reverso`.
- `src/frontend/src/components/mapas/SeletorLocalMapa.tsx` — componente controlado, acessível e responsivo.
- `src/frontend/src/components/mapas/MapaBaseCanvas.tsx` — suporte retrocompatível a `centroControlado`, `onClickMapa`, `marcadorArrastavel` e `onDragEndMarcador`.

---

## Contrato de Props (`SeletorLocalMapa`)

| Prop | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `valor` | `string` | *(obrigatório)* | Texto controlado do endereço. |
| `coordenadas` | `CoordenadaMapa \| null` | `null` | Coordenadas selecionadas (limpas automaticamente se o usuário editar o texto manualmente). |
| `onChange` | `(valor, coordenadas) => void` | *(obrigatório)* | Disparado em qualquer alteração do texto ou das coordenadas. |
| `onSelecaoConfirmada` | `(local: LocalSelecionado) => void` | `undefined` | Disparado apenas em seleções confirmadas (sugestão, CEP, atalho, clique/`dragend` no mapa ou GPS). |
| `operacao` | `'ADM' \| 'SVO'` | `'ADM'` | Escopo operacional enviado ao backend (`/api/mapas/*`). |
| `modoPublico` | `boolean` | `false` | Usa `/api/portal-svo/mapas/*` sem cookies/Bearer (`credentials: 'omit'`, `cache: 'no-store'`), aceitando CEP e reverso, com degradação silenciosa quando desativado. |
| `exibicaoMapa` | `'expansivel' \| 'aberto'` | `'expansivel'` | Define se o mapa abre imediatamente ou sob demanda pelo botão `"Abrir mapa"`. |
| `exibirAtalhosUnidades` | `boolean` | `true` (interno) / `false` (público) | Exibe chips rápidos `HEMOSE`, `SVO` e `LACEN`. |
| `exibirBotaoGps` | `boolean` | `true` | Exibe o botão `"Usar minha localização"`. |
| `alturaMapa` | `string` | `'260px'` | Altura do contêiner do mapa. |

---

## Matriz Oficial de Exibição por Tela

| Tela / Fluxo | `exibicaoMapa` | `modoPublico` | `exibirAtalhosUnidades` | Motivo |
| :--- | :---: | :---: | :---: | :--- |
| **Portal Público SVO** (`/solicitar-svo`) | `aberto` | `true` | `false` | Formulário dedicado de 1 único endereço com necessidade de precisão do pin pelo cidadão. |
| **Correção de Local no Portal** (`/acompanhar`) | `aberto` | `true` | `false` | Ação focada especificamente em corrigir o ponto/endereço já informado. |
| **Gestão de Unidades** (`/equipe?aba=usuarios`) | `aberto` | `false` | `false` | Cadastro/edição de sede ou unidade institucional, onde a coordenada oficial precisa ser conferida visualmente. |
| **Triagem SVO** (`DrawerTriagemSvo`) | `expansivel` | `false` | `true` | Drawer lateral com vários campos; abre o mapa sob demanda para validar/corrigir ponto. |
| **Nova Solicitação SVO interna** | `expansivel` | `false` | `true` | Modal com múltiplos campos; evita desperdício de WebGL quando o endereço já é conhecido. |
| **Agendamento de Coleta SVO** | `expansivel` | `false` | `true` | Fluxo operacional rápido; mapa sob demanda. |
| **Solicitação / Viagem Administrativa** | `expansivel` | `false` | `true` | Pode ter origem, destino e paradas no mesmo modal; evita múltiplos contextos WebGL abertos simultaneamente. |

---

## Garantias de Segurança, Resiliência e Acessibilidade

- **Zero chamadas diretas do navegador a ViaCEP/Photon/OSRM:** todas as consultas passam pelo proxy `/api/mapas/*` ou `/api/portal-svo/mapas/*`.
- **Proteção contra vazamento e race conditions:** `consultaTextoValidaParaBusca` bloqueia termos sensíveis (CPF, telefone, paciente, etc.) antes do envio; `AbortController` + contador de sequência descartam respostas obsoletas fora de ordem.
- **Reverso controlado:** a geocodificação reversa dispara somente no clique ou no `dragend` do marcador (nunca durante o arraste contínuo).
- **Fallback completo:** `404 RECURSO_DESATIVADO`, `429`, `503`, timeout, WebGL indisponível ou `degradado: true` (ViaCEP sem coordenadas) nunca bloqueiam o preenchimento manual do formulário.
- **Fora de Sergipe:** exibe aviso `role="alert"` com confirmação consciente via checkbox, sem impedir o envio.
- **Acessibilidade:** `role="combobox"` / `listbox` / `option` navegável por teclado (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`), alternativa sem arraste (clique no mapa + limpar coordenadas mantendo texto) e suporte a `prefers-reduced-motion`.
