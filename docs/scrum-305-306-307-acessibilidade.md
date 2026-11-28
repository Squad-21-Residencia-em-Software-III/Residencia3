# SCRUM-305, 306 e 307: acessibilidade

Três entregas do front, no mesmo PR porque dividem a mesma base:

| Tarefa | O que entrega |
|---|---|
| **SCRUM-305** | Preferências de tamanho do texto, contraste e animações, com restauração, nas áreas interna, do motorista e pública |
| **SCRUM-306** | Teclado, leitores de tela e ampliação nos componentes base (diálogos, formulários, alertas, tabelas) e nos layouts |
| **SCRUM-307** | Paletas para protanopia, deuteranopia e tritanopia, e status que não dependem só da cor |

Sem back e sem migration. Nenhuma flag: as preferências são opcionais e, no padrão, a tela fica igual.

## SCRUM-305: preferências

- **Onde:** seção "Acessibilidade" nas preferências internas e do motorista, botão na entrada e o mesmo botão no layout público em composição com o #236. O layout público também recebe o salto para o conteúdo.
- **Opções:** texto em 87,5%, 100%, 112,5%, 125% ou 150%; contraste padrão ou alto; animações seguindo o aparelho ou reduzidas; cores para daltonismo (SCRUM-307). "Restaurar padrões" volta tudo e anuncia a restauração ao leitor de tela.
- **Guardadas no aparelho** (`localStorage`), sem servidor:
  - `fsph.acessibilidade.visitante`: quem não entrou;
  - `fsph.acessibilidade.conta.<id>`: cada conta. A conta que ainda não escolheu parte das do visitante. Trocar de conta não leva as preferências da anterior.
  - Mudança em outra aba da mesma conta é acompanhada. Armazenamento bloqueado: vale até recarregar.
- **Aplicação** (`utils/preferenciasAcessibilidade.ts`): só atributos no `<html>` (`data-contraste`, `data-movimento`, `data-paleta`) e a variável `--escala-texto`. Aplicadas antes do primeiro desenho (`main.tsx`), para a tela não piscar.
- **Escala de texto:** o `font-size` do `<html>` acompanha a escala, e o `rem` inteiro junto. O zoom do navegador continua funcionando por cima. Por isso os 172 tamanhos de fonte em `px` das telas passaram a `rem`, com o mesmo valor no padrão (ex.: `text-[11px]` → `text-[0.6875rem]`).
- **Alto contraste** (`styles/acessibilidade.css`): textos secundários com a cor do texto principal, bordas e divisórias derivadas dela e foco de 3 px. Derivado dos tokens do tema, não de cores fixas.
- **Animações:** reduzidas pela escolha ou pelo `prefers-reduced-motion` do aparelho. As transições continuam acontecendo, instantâneas.
- **Cores forçadas do sistema** (Alto Contraste do Windows): foco com contorno próprio e borda transparente nos selos, que passa a aparecer.

### Precedência com o tema (SCRUM-303)

De baixo para cima: **tema claro/escuro → paleta de cores → alto contraste**. O alto contraste usa `--color-text` e `--color-surface` do tema, então deve funcionar sobre o escuro também. **Não testado com o tema escuro**, que ainda não está na develop (veja "Para alinhar").

## SCRUM-306: teclado, leitores de tela e ampliação

| Onde | O que mudou |
|---|---|
| `hooks/useDialogoAcessivel.ts` (novo) | Foco entra no diálogo (no `data-foco-inicial` ou no primeiro controle que não seja o de fechar), Tab e Shift+Tab presos, **Escape fecha só o diálogo de cima** (antes, com dois abertos, fechava os dois), foco volta para quem abriu e, se ele sumiu, vai para o conteúdo principal |
| `Modal` | Usa o hook, com o foco gerenciado agora por padrão. Título ligado por `aria-labelledby`. Novos `papel` (`alertdialog`) e `descricaoId` |
| `Drawer` | Usa o hook. Título e subtítulo ligados ao painel. Era `<aside role="dialog">`, papel inválido para `aside` (achado do axe): agora é `div` |
| `ConfirmDialog` | Em ação perigosa, é `alertdialog`, lê a descrição junto e começa em "Cancelar". Deixou de desligar o foco gerenciado |
| `Field`, `Input`, `Select`, `Textarea` | Novos `descricao` e `erro`, ligados por `aria-describedby`; com erro, `aria-invalid`. Preservam `aria-describedby` e `aria-invalid` de quem já usa. Foco com anel, não só cor de borda |
| `Alert` | Erro com `role="alert"` (interrompe); aviso, informação e sucesso com `role="status"` (espera). Ícones escondidos do leitor |
| `TableFilterCollapse` | Recolhido, os filtros ficam `inert` (antes, invisíveis mas alcançáveis pelo Tab) |
| `AppLayout`, `MotoristaLayout` | "Pular para o conteúdo" como primeiro Tab; `main` focável. No celular, menu fechado fora do Tab; aberto, com foco dentro, resto da página `inert`, Escape fecha e o foco volta ao botão. Recolhido, cada item mantém nome e contador para o leitor |
| Tela de entrada | Região principal e botão de senha com alvo de 32 px (era menor que os 24 px da WCAG 2.5.8) |
| Agenda | Barras da semana com o status no nome acessível e na dica, que também aparece com o foco do teclado |

### Para quem constrói telas novas (portal, mapas, CNH, multas)

- `<SaltoConteudo />` e `id={ID_CONTEUDO} tabIndex={-1}` no conteúdo principal de um layout novo (ex.: portal público da SCRUM-265).
- `<BotaoAcessibilidade />` em telas sem login.
- `Modal`, `Drawer` e `ConfirmDialog` já cuidam do foco: não criar diálogo próprio.
- Campo com erro: `<Input label="…" erro={mensagem} />`, sem montar `aria-*` à mão.
- Mapa (SCRUM-277 e 292): oferecer endereço digitado e lista de paradas como alternativa ao arraste e ao mapa.

## SCRUM-307: daltonismo

- **Paletas** (`styles/paletas.css`, gerado por `scripts/gerar-paletas.mjs`): redefinem as variáveis de cor de status, as do Tailwind (`emerald`, `green`, `teal`, `red`, `rose`, `amber`, `yellow`, `orange`, `blue`, `sky`, `violet`, `purple`) e os tokens do projeto (`success`, `danger`, `warning`, `info`, `purple`). Nada de filtro na página: fotos do odômetro, documentos e mapas-base ficam com as cores reais.
- **Como os tons foram escolhidos:** busca pelo maior afastamento entre as cinco categorias de status, vistas com a deficiência (simulação de Machado et al., 2009), com contraste mínimo de 4,6:1 e cada categoria numa faixa de matiz coerente. Protanopia e deuteranopia dividem a mesma paleta.

| Paleta | Par mais próximo (OKLab) | No padrão, mesma deficiência |
|---|---|---|
| Protanopia / deuteranopia | ≥ 0,085 | 0,027 / 0,003 |
| Tritanopia | ≥ 0,131 | 0,049 |

- **Sem depender da cor**, em qualquer paleta:
  - **Selos:** cada tom tem um ícone próprio: ✓ sucesso, ✕ erro, triângulo aviso, "i" informação, losango roxo, ponto neutro.
  - **Agenda:** cada status tem um padrão próprio, repetido na legenda, que agora mostra os cinco. Sólido em andamento, listrado no local, tracejado agendada, cinza concluída, cruzado cancelada.
- **Telas que usavam hexadecimal fixo** (agenda e o anel dos selos) passaram para cores do Tailwind e tokens, para as paletas as alcançarem.

## Verificação

### Automática

| Teste | O que cobre |
|---|---|
| `utils/preferenciasAcessibilidade.test.ts` | Padrão, valores inválidos, conta e visitante, versão, armazenamento bloqueado, aplicação no `<html>` sem filtro |
| `components/acessibilidade/SecaoAcessibilidade.test.tsx` | Grupos e nomes acessíveis, aplicação e gravação por conta, uso só por teclado, restauração anunciada, troca de conta, outra aba |
| `components/ui/Dialogos.test.tsx` | Foco inicial, Tab preso nos dois sentidos, Escape, dois diálogos empilhados, fechamento bloqueado, foco de volta e quem abriu removido, `alertdialog`, Drawer |
| `components/ui/PrimitivosAcessiveis.test.tsx` | Erro e descrição ligados, preservação de `aria-*`, papéis do `Alert`, forma própria por tom do `Badge`, filtro recolhido `inert` |
| `components/layout/LayoutAcessivel.test.tsx` | Salto ao conteúdo nos dois layouts, menu do celular, itens recolhidos |
| `pages/agenda/statusAgenda.test.tsx` | Status no nome das barras e legenda com o mesmo padrão |
| `styles/paletas.test.ts` | Contraste ≥ 4,5:1 dos textos de status em todas as paletas e separação das categorias com a deficiência simulada |
| `test/axe.test.tsx` | axe-core (WCAG 2.0, 2.1, 2.2 A/AA e boas práticas) sem violações em: seção, modal com formulário, confirmação, painel, os dois layouts, tela de entrada e agenda. Sem a regra de contraste, que o jsdom não calcula |

Mutações conferidas (cada uma derruba ao menos um teste): Escape sem pilha, foco perdido quando quem abriu some, todo alerta interrompendo, filtro recolhido no Tab, status fora do nome da barra, menu fechado no Tab do celular, erro sem `aria-invalid`, erro com a mesma forma do sucesso.

### Navegador real

Edge headless (Chromium), página de entrada e janela de Acessibilidade, com o axe-core **incluindo contraste**:

| Cenário | Rolagem horizontal | Foco no diálogo | Violações |
|---|---|---|---|
| Padrão, 1280 px | Não | Sim | 0 |
| Padrão, 320 px | Não | Sim | 0 |
| Texto 150%, 320 px | Não | Sim | 0 |
| Texto 150% + alto contraste + animação reduzida, 1280 px | Não | Sim | 0 |
| Protanopia, 390 px | Não | Sim | 0 |
| Deuteranopia, 390 px | Não | Sim | 0 |
| Tritanopia, 390 px | Não | Sim | 0 |
| Tritanopia + alto contraste + texto 125%, 1280 px | Não | Sim | 0 |

A primeira rodada achou contraste insuficiente nos textos de apoio da seção (2,63:1) e o botão de senha pequeno; os dois foram corrigidos antes desta tabela.


### Composição local com #236, #245, #246 e #239

Chrome 158 com PostgreSQL descartável e API real. A composição passou pelo build e 872 testes de frontend. A base do navegador foi o portal com cadastro, acompanhamento, proteção e proxy cartográfico em execução. A página de teste do seletor monta o componente real com o mesmo layout público, enquanto a SCRUM-265 permanece responsável pelo formulário de produção.

| Critério | Resultado de navegador |
| --- | --- |
| Portal e mapa a 320 CSS px | Salto focou o conteúdo. Enter abriu as preferências, Escape devolveu foco. Alto contraste, tritanopia e texto a 150% coexistiram sem rolagem horizontal. Depois de recarregar, o modo anônimo preservou as escolhas. |
| Teclado na cartografia | CEP, seleção no listbox, ajuste manual, reverso real via proxy, limpeza e endereço textual passaram com WebGL indisponível. |
| Reflow interno | Início, solicitações ADM/SVO, agenda, viagens, veículos, infrações, motoristas e abastecimento abriram a 320 CSS px e a 200% de zoom nativo, sem overflow horizontal no documento. A medição da página cobre a estrutura geral. |
| Formulários internos | Agendamento a partir de Solicitações, cadastro de veículo e registro de multa passaram com Enter, Tab, Shift+Tab e Escape a 320 CSS px e a 200%. O agendamento fecha com foco no conteúdo da nova rota. Nos outros dois diálogos, o foco volta ao acionador. |
| Indicadores ADM | Aprovação e recusa identificadas pelo rótulo no padrão e em protanopia, deuteranopia, tritanopia e escala de cinza emulados no Chrome. O axe no navegador não apontou falha de contraste nessa amostra. |
| Indicadores complementares | Os testes automatizados cobrem ícones de status, legenda e padrões da agenda, barra de ocupação, rótulos da meta de consumo e filtro do cartão com Tab e Enter. |
| Zoom nativo | Consulta pública real com ampliação de 200% confirmada nas configurações do Chrome. |
| Narrador do Windows | A recapitulação da fala confirmou o salto ao conteúdo, o botão de acessibilidade, o combobox cartográfico e, no formulário de acompanhamento, o campo Protocolo como necessário e inválido com a mensagem associada. |

### Evidência pendente

- **NVDA, VoiceOver, TalkBack e aparelhos Android/iOS**: sem execução registrada. A amostra do Narrador do Windows cobre somente os anúncios acima.
- **Alto Contraste do Windows** (cores forçadas): só o CSS, sem verificação manual.
- **Tema escuro**: a SCRUM-303 ainda não está na develop.
- **Fluxos internos completos**: ainda faltam evidências de condução, upload/captura, recuperação de falha e reabertura do PWA. A matriz acima cobre o reflow geral e as interações explicitadas.
- **Rotas e GPS em campo**: visualização de rotas e GPS físico dependem das entregas correspondentes e dos aparelhos de teste.

## Para alinhar

1. **Texto secundário**: a correção anterior escureceu `--color-text-muted` no padrão. Os cartões de métrica usam esse token e ajustam a quebra dos rótulos. A SCRUM-303 deve preservar o contraste nas duas bases do tema.
2. **Tema escuro (SCRUM-303)**: conferir a combinação com alto contraste e paletas quando entrar. Se o tema redefinir `--color-text-muted` e afins, o alto contraste precisa vir depois na cascata (ele está em `styles/acessibilidade.css`, importado depois do `global.css`).
3. **Conflitos esperados**: a troca de `px` por `rem` toca 42 telas. Quem tiver branch aberta nelas resolve trocando só o tamanho da fonte.
