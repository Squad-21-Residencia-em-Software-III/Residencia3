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
- **Reverso controlado:** a geocodificação reversa dispara no clique, no `dragend` do marcador, quando o GPS entrega um ponto ou ao confirmar as coordenadas digitadas.
- **Fallback completo:** `404 RECURSO_DESATIVADO`, `429`, `503`, timeout, WebGL indisponível ou `degradado: true` (ViaCEP sem coordenadas) nunca bloqueiam o preenchimento manual do formulário.
- **Fora de Sergipe:** exibe aviso `role="alert"` com confirmação consciente via checkbox, sem impedir o envio.
- **Acessibilidade:** `role="combobox"` / `listbox` / `option` navegável por teclado (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`), ajuste de coordenadas por teclado e suporte a `prefers-reduced-motion`.

## Ajuste de coordenadas por teclado

Com a cartografia ativa, o seletor oferece campos opcionais para latitude e longitude mesmo com o mapa recolhido ou sem WebGL. Aceita ponto ou vírgula decimal, exige o par e valida latitude de −90 a 90 e longitude de −180 a 180. A confirmação inicia o mesmo fluxo de geocodificação reversa usado pelo mapa e pelo GPS. O ajuste prevalece sobre consultas antigas. A primeira edição da latitude ou da longitude invalida consultas anteriores e preserva o rascunho até a próxima confirmação. A edição do endereço e a limpeza também cancelam o reverso pendente. Se o provedor não encontrar um endereço, o ponto recebe um rótulo de coordenadas, preservando a possibilidade de informar o endereço textualmente. Se o único rótulo for de coordenadas, limpar o ponto limpa também esse rótulo.


## Referências cartográficas das unidades

| Unidade | Endereço confirmado pela liderança | Latitude | Longitude | Fonte e confiança |
| --- | --- | ---: | ---: | --- |
| HEMOSE | Rua Quinze, 127, Capucho | -10.9137051 | -37.0916354 | Média para a unidade e baixa para o portão. [Mapa da unidade](https://www.benditoguia.com.br/empresa/hemose-hematology-center-of-sergipe-jabotiana-aracaju-se) · [Portal de Serviços de Sergipe](https://www.se.gov.br/servicos/302). |
| LACEN | Rua Campo do Brito, 551, São José | -10.9257059 | -37.0495937 | Média para a unidade e baixa para o portão. [Mapa da unidade](https://www.benditoguia.com.br/empresa/instituto-parreiras-horta-lacen-salgado-filho-aracaju-se) · [Contrato da SES](https://saude.se.gov.br/wp-content/uploads/2025/03/CTR-101.2024.pdf). |
| SVO | Rua Campo do Brito, 551, São José | -10.9255029 | -37.0493169 | Média para a unidade e baixa para o portão. [Mapa da unidade](https://www.benditoguia.com.br/empresa/svo-servico-de-verificacao-obito-sergipe-salgado-filho-aracaju-se). |

Os pontos são candidatos de mapa para as três unidades em Aracaju/SE. A liderança confirmou que LACEN e SVO usam entradas distintas no complexo e que o SVO continua na Rua Campo do Brito. Os pontos precisam de confirmação institucional antes de serem usados para navegação até o acesso veicular. O seletor continua a consultar somente a configuração institucional no proxy.

## Regressão do seletor na revisão final

A lista abre somente com foco no campo de busca. Tab fecha a lista, as setas permitem reabri-la e Escape fecha as sugestões mantendo o foco no campo. A limpeza do ponto devolve o foco ao botão de confirmar coordenadas. Uma região de status anuncia o resultado, inclusive quando o endereço vem sem coordenadas.

- **Vitest** — 40 testes do seletor e do cliente de mapas. Inclui resposta que chega após cancelamento por edição das coordenadas, rascunho preservado, foco da lista, GPS indisponível/timeout e fallback. A suíte completa do frontend passou em 767 testes, com typecheck e build PWA.
- **Integração PostgreSQL local** — 37 migrations e zero pendentes na composição de `develop` com #239 e #238. A suíte HTTP do #239 passou em 11 testes com role restrita, incluindo 429, Retry-After, timeout, recuperação e distinção das rotas internas. A composição passou em 2.310 testes gerais do backend, com 78 cenários condicionais ignorados nessa rodada.
- **Homologação pendente** — confirmação de cada portão e GPS físico. A adoção nos formulários de produção pertence às respectivas tarefas consumidoras. Os testes do seletor verificam o contrato com valor existente, coordenadas ausentes e controle pelo formulário.
