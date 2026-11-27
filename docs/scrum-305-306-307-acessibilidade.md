# SCRUM-305, 306 e 307: acessibilidade

Três entregas do front, no mesmo PR porque dividem a mesma base:

| Tarefa | O que entrega |
|---|---|
| **SCRUM-305** | Preferências de tamanho do texto, contraste e animações, com restauração, nas áreas interna, do motorista e pública |
| **SCRUM-306** | Teclado, leitores de tela e ampliação nos componentes base (diálogos, formulários, alertas, tabelas) e nos layouts |
| **SCRUM-307** | Paletas para protanopia, deuteranopia e tritanopia, e status que não dependem só da cor |

Sem back e sem migration. Nenhuma flag: as preferências são opcionais e, no padrão, a tela fica igual.

## SCRUM-305: preferências

- **Onde:** seção "Acessibilidade" nas preferências do aplicativo (engrenagem da área interna e "Minha conta" do motorista) e botão "Acessibilidade" na tela de entrada, antes do login.
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

### Não executado

- **Leitores de tela reais** (NVDA, VoiceOver, TalkBack) e **aparelhos Android e iOS**: sem dispositivo nesta entrega. Os nomes, papéis e estados foram conferidos pelos testes e pelo axe.
- **Alto Contraste do Windows** (cores forçadas): só o CSS, sem verificação manual.
- **Tema escuro**: a SCRUM-303 ainda não está na develop.
- **Telas internas no navegador real** (solicitações, triagem, viagens, multas): precisam de login e dados. Cobertas pelos componentes base, pelos testes e pelo axe no jsdom, mas o markup próprio de cada página não foi auditado tela a tela.
- **Mapas e GPS**: os componentes das SCRUM-277 e 292 ainda não existem.

## Para alinhar

1. **Token `--color-text-muted` (`#8da2b5`)**: tem 2,63:1 sobre branco, abaixo dos 4,5:1 da WCAG, e é usado no sistema inteiro. Este PR não muda o token (é decisão de design e área da SCRUM-303): usa `text-neutral` na seção nova, e o alto contraste já corrige. Sugestão para a 303: escurecer para algo como `#5b6b7d` (5,46:1).
2. **Tema escuro (SCRUM-303)**: conferir a combinação com alto contraste e paletas quando entrar. Se o tema redefinir `--color-text-muted` e afins, o alto contraste precisa vir depois na cascata (ele está em `styles/acessibilidade.css`, importado depois do `global.css`).
3. **Conflitos esperados**: a troca de `px` por `rem` toca 42 telas. Quem tiver branch aberta nelas resolve trocando só o tamanho da fonte.
