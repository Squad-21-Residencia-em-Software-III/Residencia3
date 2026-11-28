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

## Regressão de foco, preferências e indicadores

| Critério | Evidência automatizada |
| --- | --- |
| Odômetro | O acionador da câmera mantém o foco durante a validação, bloqueia acionamento repetido e volta a aceitar entrada após a validação. Remover foto move o foco para o seletor da galeria, anuncia a remoção e preserva o valor do odômetro. |
| Preferências | Limpar o armazenamento em outra aba restaura o padrão na aba aberta. A suíte da seção valida troca de conta e restauração. A suíte de sessão e push cobre os efeitos de trocar de contexto. |
| Consumo e ocupação SVO | Consumo mostra a relação com a meta e distingue veículos sem placa disponível pelo identificador. A ocupação anuncia vagas ocupadas no total. As duas barras usam as cores de sistema para manter trilho e preenchimento sob cores forçadas, com os rótulos visíveis. |
| Agenda, CNH, multas e demais estados | Rótulos e padrões da agenda, ícones e rótulos dos selos, e métricas por teclado têm cobertura automatizada. A matriz de navegador anterior cobre os estados de aprovação e recusa em padrão, três deficiências simuladas e escala de cinza. A inspeção assistiva completa ainda está pendente. |

A SCRUM-303 está em andamento no Jira e nenhuma implementação foi localizada na `develop` ou nas branches remotas consultadas. A homologação da combinação com tema escuro depende dessa entrega.

### Preferências em Chrome desktop

Em perfil temporário de Chrome, alto contraste, tritanopia e escala 150% sincronizaram com outra aba, sobreviveram ao fechamento da aba e reapareceram após reiniciar o navegador. Com o service worker ativo, as três preferências continuaram disponíveis em navegação offline. A verificação também confirmou que abrir e alterar preferências preserva o e-mail digitado no formulário de login e que a emulação de movimento reduzido do sistema é reconhecida. A tentativa de instalação pelo menu do Chrome foi interrompida pelo controle de interface do Windows. A reabertura como aplicativo instalado continua pendente.

### Matriz de indicadores e odômetro na composição final

Chrome 158 com `develop`, #239, #246 e PostgreSQL local descartável. Foram avaliados dashboard, veículos, CNH, multas, legenda da agenda, consumo/meta, painel de ocupação com fixture local e alerta de coleta atrasada com resposta sintética. Os casos cobrem sete combinações em 320 CSS px: padrão, protanopia, deuteranopia, tritanopia, escala de cinza, alto contraste mais ampliação de texto e cores forçadas emuladas. As 56 combinações mantiveram os rótulos visíveis e sem rolagem horizontal. O axe apontou contraste de 4,39:1 no subtítulo do dashboard. A troca para o token semântico de texto secundário eliminou a ocorrência na repetição do axe em padrão e alto contraste.

No fluxo do motorista, o Chrome emulou largura de 320 CSS px e cores forçadas. O seletor de arquivo emulou a entrada de câmera. Foram verificados o alerta para arquivo inválido, a prévia, a ampliação, a remoção com foco na galeria e a substituição. A saída e a chegada com imagem JPEG sintética passaram pela API real e gravaram a transição e a quilometragem no PostgreSQL. O roteiro de reflow e diálogos internos também passou no zoom nativo de 200%. No fluxo do motorista a 200% de zoom nativo, os diálogos de início e finalização mantiveram o reflow. Após uma resposta 503 sintética no upload, o botão manteve o foco e Enter repetiu o envio pela API real com sucesso. A captura por câmera física continua pendente.

### Atualização com a develop e roteiro das pendências

A atualização incorpora o seletor do PR #246 já mesclado na develop em `2982815`. A composição anterior no Chrome verificou CEP, opções por teclado, ajuste manual, busca reversa pelo proxy e endereço textual com WebGL indisponível. A suíte da composição atual passou em **879 testes de frontend** (85 arquivos), incluindo o seletor, o cliente cartográfico e a separação de sessão nas rotas públicas. O typecheck e o build com service worker passaram em uma cópia descartável fora do OneDrive. A auditoria passou no limiar da CI, com quatro ocorrências moderadas e nenhuma alta ou crítica. A relação com a meta de consumo, a ocupação por vagas e o status das barras da agenda já têm representação textual, com cobertura na matriz existente.

A SCRUM-303 segue em andamento. A develop integrada e a busca por branches com a chave da tarefa ainda não apresentaram uma implementação para homologar em conjunto.

| Cenário pendente | Procedimento mínimo em ambiente de teste |
| --- | --- |
| Leitor de tela real | No Windows, abra a aplicação local com fixtures e ative o Narrador com Win+Ctrl+Enter ou use o NVDA com o Visualizador de fala. Navegue por teclado desde o login até preferências e notificações. Em uma viagem sintética, dispare validação, seleção válida e inválida de JPEG, remoção e substituição de foto, início, finalização, erro 503 no upload de teste e tentativa seguinte. Confira em cada ação o anúncio oportuno de carregamento, erro ou sucesso, sem duplicidade. Em cada diálogo, confira o título, o foco inicial e seu retorno ao acionador ao fechar. Registre a recapitulação da fala ou uma gravação com dados sintéticos. Nesta rodada, o Narrador abriu, mas o controle de interface do Windows informou que a janela tinha nível de integridade superior ao da automação. A evidência assistiva anterior permanece limitada aos cenários descritos acima. |
| PWA instalada | Use um perfil de teste do Chrome ou Edge e abra a origem local do build. Instale pelo ícone da barra de endereço ou pela opção de instalar o site como aplicativo. Abra pelo atalho do aplicativo e salve alto contraste, texto 150%, tritanopia e animações reduzidas. Feche a janela do app e encerre todos os processos do navegador desse perfil. Reabra pelo atalho, registre a primeira pintura e confirme o modo standalone com `matchMedia('(display-mode: standalone)').matches`. Repita com o servidor local inacessível depois que o service worker controlar a página. Confira a abertura do shell e as preferências disponíveis offline. Em seguida reconecte, entre na conta sintética A, reabra o aplicativo e verifique a sessão. Saia, entre na conta B e confirme o isolamento das preferências, depois retorne à conta A para conferir a recuperação. A instalação pela interface foi interrompida na rodada anterior. Nesta rodada, o Chrome do perfil descartável retornou comando indisponível para `PWA.install` no DevTools Protocol. |
| Cores forçadas do Windows | Em Configurações → Acessibilidade → Temas de contraste, aplique um tema, abra a aplicação de teste e confirme `matchMedia('(forced-colors: active)').matches`. Percorra com Tab os focos de preferências, diálogo de viagem, controles de foto e seletor de endereço. Confira o contorno de foco, selos, a barra de consumo e a ocupação. Registre uma captura e restaure o tema do sistema. O controle do Windows não apresentou uma janela de Configurações para interagir nesta sessão. A matriz existente cobre cores forçadas emuladas. |
| Dispositivos físicos | Use um aparelho de teste para fotografar um odômetro sintético e um dispositivo com GPS para os fluxos disponíveis. Registre modelo, SO, navegador e estado de permissão. A matriz existente usou arquivos sintéticos e geolocalização emulada. |
