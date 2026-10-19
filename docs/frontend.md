# Documentação do Front-end

Documento único do front-end. Atualize-o a cada nova tela ou mudança de padrão.

## 1. Stack
- React 19 + TypeScript (modo estrito) + Vite
- CSS puro com variáveis (sem Tailwind)
- `react-router-dom` para as rotas
- `lucide-react` para ícones vetoriais padronizados (sem emojis)

## 2. Como rodar
```bash
cd src/frontend
npm install
npm run dev      # http://localhost:5173/
npm run build    # confere tipos e gera o build
```

> [!IMPORTANT]
> **Atenção aos desenvolvedores**: Foi adicionada a dependência `lucide-react`. Ao atualizar ou clonar a branch, é obrigatório rodar `npm install` dentro de `src/frontend` antes de iniciar o servidor ou rodar o build.

O front **ainda não está conectado ao back-end**. Todos os dados são fictícios (ver seção 6).

## 3. Estrutura de pastas
```
src/frontend/
├─ public/assets/        logos e ícone
└─ src/
   ├─ styles/            tokens.css (cores, fontes, raios...) e global.css
   ├─ components/
   │  ├─ ui/             Button, Card, Badge, Avatar, Input, Select, Modal, Table, ícones
   │  └─ layout/         AppLayout (barra lateral e topo)
   ├─ pages/             uma página por rota (ex.: VeiculosPage.tsx)
   ├─ routes/            definição das rotas e do menu
   ├─ services/mocks/    dados fictícios
   └─ types/             tipos TypeScript espelhando as tabelas do banco
```

## 4. Padrões
- **Estilo**: usar as variáveis de `styles/tokens.css`. Não escrever cores fixas nos componentes.
- **Componentes**: reutilizar os de `components/ui`. Importar por `components/ui`.
- **Tipos**: cada tipo em `types/` espelha uma tabela do banco (ver `docs/dicionario-de-dados.md`). Não adicionar campos que não existam na tabela.
- **Dados**: a tela consome uma lista de `services/`. Quando houver API, troca-se só essa origem.

## 5. Rotas
| Rota | Página | Situação |
|---|---|---|
| `/` | redireciona para `/dashboard` | pronta |
| `/dashboard` | `DashboardPage` | implementada (mock) |
| `/agenda` | `AgendaPage` | provisória |
| `/veiculos` | `VeiculosPage` | implementada (mock) |
| `/motoristas` | `MotoristasPage` | implementada (mock) |
| `/viagens` | `ViagensPage` | implementada (mock) |
| `/usuarios` | `UsuariosPage` | implementada (mock) |
| qualquer outra | `NotFoundPage` | pronta |

Ainda não há tela de login nem proteção de rotas.

## 6. Origem dos dados
> [!WARNING]
> Os dados exibidos são **fictícios (mock)**. Não vêm do banco nem da API. Itens cadastrados pela tela existem só na memória do navegador e somem ao recarregar.

| Tela | Origem | Observação |
|---|---|---|
| Veículos | `services/mocks/veiculosMock.ts` | dados baseados nos 5 veículos do seed (`src/backend/database/seeds/01_dados_iniciais.js`) |
| Motoristas | `services/mocks/motoristasMock.ts` | lista de motoristas simulados (respeitando o schema de `motoristas` e perfis de `usuarios`) |
| Usuários | `services/mocks/usuariosMock.ts` | dados baseados nos 7 usuários do seed (`src/backend/database/seeds/01_dados_iniciais.js`) e regras dos 6 perfis oficiais |
| Dashboard / Solicitações | `services/mocks/solicitacoesMock.ts` | resumo de solicitações de viagens e viagens ativas consolidando dados com veículos e motoristas |
| Viagens | `services/mocks/viagensMock.ts` | dados estruturados conforme as tabelas `viagens_frota` e `ordens_svo` do banco de dados |

## 7. Tela de Veículos
Tabela `veiculos`, conforme `docs/dicionario-de-dados.md` e as migrations.

| Coluna no banco | Regra | Campo no front |
|---|---|---|
| `id` | serial, PK | `id` (gerado localmente no mock) |
| `placa` | varchar(10), único | `placa` |
| `modelo` | varchar(100) | `modelo` |
| `tipo_frota` | `ADMINISTRATIVA` ou `SVO` | `tipo_frota` |
| `capacidade_maxima` | inteiro, >= 0 | `capacidade_maxima` |
| `status` | padrão `DISPONIVEL` | `status` |

Status usados: `DISPONIVEL`, `EM_USO`, `MANUTENCAO`.

**Removido do protótipo do Figma**, por não existir no banco: ano, quilometragem, motorista responsável, tipo de veículo (Caminhão, Van) e os status `Inativo` e `Em Viagem`. Se o Squad quiser algum deles, é preciso uma migration antes.

## 8. Tela de Motoristas
Tabela `motoristas`, conforme as migrations e o seed.

| Coluna no banco | Regra | Campo no front (`types/motorista.ts`) | Onde aparece |
|---|---|---|---|
| `id` | serial, PK | `id` | gerado localmente nos mocks |
| `usuario_id` | FK para `usuarios.id` | `usuario_id` | vínculo relacional com usuário |
| `numero_cnh` | varchar(20), único | `numero_cnh` | tabela, badge e modal |
| `categoria_cnh` | varchar(5) | `categoria_cnh` | tabela e modal |
| `validade_cnh` | date | `validade_cnh` | tabela e modal |
| `tipo_motorista` | varchar(20); valores: `FROTA` ou `SVO` | `tipo_motorista` | tabela, filtro e modal |
| `status` | padrão `DISPONIVEL` | `status` | tabela |
| (não é coluna) | vem de `usuarios.nome` via `usuario_id` | `nome` | tabela, avatar e modal |

- **CNH vencida**: o selo "Vencida" e o card "CNH Vencida" são calculados no front comparando `validade_cnh` com a data de hoje. Não existe coluna para isso no banco.
- **Cadastro**: no mock, o nome é digitado e o `usuario_id` é gerado localmente. No sistema real integrado, o motorista será vinculado a um operador já existente na tabela `usuarios`.
- **Removido do protótipo do Figma**: telefone, quantidade de viagens acumuladas, veículo fixo vinculado e status `Ativo`, `Em Viagem` e `Licença` (não existem na modelagem do banco).

### Como testar a Tela de Motoristas:
1. Abra `http://localhost:5173/motoristas`.
2. Verifique os 4 cards de métricas no topo (`Total de Motoristas`, `Frota`, `SVO` e `CNH Vencida`).
3. Confira a badge vermelha de **Vencida** ao lado das datas expiradas (ex: 2024).
4. Alterne os filtros rápidos: **Todos**, **Motoristas Frota** e **Motoristas SVO**.
5. Clique em **Novo Motorista**, preencha os dados e confirme o cadastro para ver a nova linha ser inserida instantaneamente no topo da tabela.

## 9. Tela de Usuários
Tabela `usuarios`, conforme as migrations (`20261014000001_create_initial_schema.js`, `20261014200000_regras_usuarios.js` e `20261015000000_integridade_usuarios.js`), o seed e a API backend.

| Coluna no banco | Regra | Campo no front (`types/usuario.ts`) | Onde aparece |
|---|---|---|---|
| `id` | serial, PK | `id` | gerado localmente nos mocks / PK relacional |
| `nome` | varchar(255), mín. 3 caracteres | `nome` | tabela, avatar e modais |
| `email` | varchar(255), formato de e-mail, único (lower) | `email` | tabela, busca e modais |
| `senha` | varchar(255), hash bcrypt | `senha` | apenas nos modais de cadastro e redefinição; **nunca exposto em listagens** |
| `tipo_usuario` | varchar(50), constraint `chk_usuarios_tipo_usuario` | `tipo_usuario` | tabela (badge secundária de categoria) e métricas |
| `perfil` | varchar(50), constraint `chk_usuarios_perfil` | `perfil` | tabela, badges coloridas, abas de filtro e modais |
| `ativo` | boolean, NOT NULL, default `true` | `ativo` | tabela (badge Ativo/Inativo), cards e alternador de status |

- **Perfis válidos**: restrito aos 6 perfis oficiais da FSPH (`ADMINISTRADOR`, `SOLICITANTE`, `GESTOR_FROTA`, `GESTOR_SVO`, `MOTORISTA_FROTA`, `MOTORISTA_SVO`).
- **`tipo_usuario` derivado**: usuários com perfil `MOTORISTA_FROTA` ou `MOTORISTA_SVO` recebem `tipo_usuario = 'MOTORISTA'`. Para os demais perfis, o valor é idêntico ao próprio perfil.
- **Proteção do Administrador**: o backend impede que um administrador desative sua própria conta (`ativo: false`) ou retire seu próprio perfil de administrador. A tela possui travas visuais para o usuário logado (Carlos Silva - ID #1).
- **Removido do protótipo do Figma**:
  - Coluna "Último Acesso" (`ultimo`): não existe na tabela `usuarios`.
  - Status "Licença": no banco o status de conta é puramente booleano (`ativo: true/false`).
  - Perfis genéricos ("Administrador", "Gestor", "Operacional", "Motorista"): substituídos pelos 6 perfis oficiais da FSPH.
  - Toggle "É motorista?" e criação de CNH/Veículo no modal de usuário: `motoristas` é tabela e tela separada (`/motoristas`); veículos são alocados por viagem/ordem de serviço, não no cadastro do usuário.
- **Faltava no protótipo do Figma e foi incorporado**:
  - Modal administrativo para Redefinir Senha (`PATCH /api/usuarios/:id/senha`) com regras de senha forte.
  - Ação rápida para Ativar / Inativar usuário (`PATCH /api/usuarios/:id`).
  - Filtros rápidos por categoria e busca por nome ou e-mail.

### Como testar a Tela de Usuários:
1. Abra `http://localhost:5173/usuarios`.
2. Verifique os 4 cards de métricas no topo (`Total de Usuários`, `Ativos`, `Inativos` e `Motoristas Operacionais`).
3. Digite no campo de busca para filtrar por nome ou e-mail em tempo real.
4. Alterne entre as abas rápidas (`Todos`, `Administradores`, `Gestores`, `Solicitantes`, `Motoristas`, `Inativos`).
5. Clique em **Novo Usuário**, preencha os campos obrigatórios com perfil e senha forte (mínimo 8 dígitos com maiúscula, minúscula, número e símbolo) e salve para conferir o usuário inserido na lista.
6. Clique no botão **Senha** de qualquer usuário para abrir o modal de redefinição de senha.
7. Clique no botão **Desativar / Ativar** para alternar o status do usuário (note que o usuário administrador com tag "Você" tem o botão desativado por proteção de segurança).

## 10. Tela de Dashboard
Painel central consolidado que agrega indicadores operacionais das tabelas `solicitacoes_viagem`, `viagens_frota`, `veiculos`, `motoristas` e `usuarios`.

| Métrica / Elemento | Origem no Banco | Regra de Cálculo no Front | Onde aparece |
|---|---|---|---|
| `Solicitações Pendentes` | `solicitacoes_viagem.status` | Contagem com status `PENDENTE_APROVACAO` | Card 1 de resumo |
| `Viagens em Andamento` | `viagens_frota.status` | Contagem com status `EM_ANDAMENTO` | Card 2 de resumo |
| `Veículos Disponíveis` | `veiculos.status` | Contagem com status `DISPONIVEL` | Card 3 de resumo |
| `Frota Administrativa / SVO` | `veiculos.tipo_frota` | Subdivisão de veículos disponíveis (`ADMINISTRATIVA` vs `SVO`) | Card 3 (badges de rodapé) |
| `Alertas da Operação` | `veiculos.status` e `motoristas.validade_cnh` | Veículos em `MANUTENCAO` + motoristas com CNH vencida | Card 4 de resumo |
| `Tabela de Solicitações Recentes` | `solicitacoes_viagem` (join `usuarios`) | Lista das últimas solicitações com solicitante, trajeto e status | Tabela principal |

- **Cards de Sumário**:
  1. *Solicitações Pendentes*: exibe pedidos que exigem despacho do gestor, com botão de navegação direta para `/viagens`.
  2. *Viagens em Andamento*: resumo das viagens em curso no dia, discriminando horário, rota e veículo.
  3. *Veículos no Pátio*: quantitativo de veículos prontos para operação, segregados pela regra de negócio do banco (`ADMINISTRATIVA` e `SVO`).
  4. *Alertas da Operação*: monitoramento proativo de veículos em manutenção e motoristas com habilitação vencida.
- **Tabela de Solicitações**:
  - Exibe o **Solicitante** (`usuarios.nome`), trajeto (`origem → destino`), data desejada, finalidade e status real do banco (`PENDENTE_APROVACAO`, `APROVADA`, `REJEITADA`).
- **Removido do protótipo do Figma**:
  - Sub-rótulos "Passeio" e "Amb.": substituídos pelas categorias reais da modelagem do banco (`ADMINISTRATIVA` e `SVO`).
  - Status "Manutenção" em solicitações: no banco, manutenção é exclusiva de `veiculos` e `manutencoes`.
  - Motorista em solicitações pendentes: no modelo relacional, a solicitação pertence a `solicitante_id`. O motorista só é alocado na viagem após a aprovação do gestor.
  - IDs alfanuméricos fictícios (`SOL-1042`): no banco os IDs são inteiros (`#1042`).

### Como testar a Tela de Dashboard:
1. Abra `http://localhost:5173/dashboard` (ou a raiz `http://localhost:5173/`).
2. Confira os 4 cards de sumário no topo e a consistência dos números com os dados cadastrados em Veículos e Motoristas.
3. Teste os botões de navegação dos cards (ex: "Ver frota →" e "Ver motoristas →") para confirmar o direcionamento às respectivas telas.
4. Confira a tabela de solicitações recentes com solicitante, trajeto formatado e badges de status.

## 11. Tela de Viagens
Tabelas `viagens_frota`, `solicitacoes_viagem` e `ordens_svo`, conforme as migrations e as regras de negócio do Squad 21 (RN01–RN05, RN07, RN21 e RF11–RF15).

| Coluna no banco | Regra / Tipo | Campo no front (`types/viagem.ts`) | Onde aparece |
|---|---|---|---|
| `id` | serial, PK | `id` | gerado localmente nos mocks / PK relacional |
| `solicitacao_id` | FK `solicitacoes_viagem.id` | `solicitacao_id` | vínculo relacional com o pedido institucional |
| `tipo_operacao` | regra do banco (tabela) | `tipo_operacao` (`ADMINISTRATIVA` ou `SVO`) | tabela (badge), filtros e modais |
| `veiculo_id` | FK `veiculos.id` | `veiculo_id`, `veiculo_modelo`, `veiculo_placa` | tabela, badge de placa e modais |
| `motorista_id` | FK `motoristas.id` | `motorista_id`, `motorista_nome` | tabela, avatar e modais |
| `km_inicial` | integer, odômetro de saída | `km_inicial` | tabela e modais de agendamento/retorno |
| `km_final` | integer, odômetro de retorno | `km_final` | tabela e modal de finalização |
| `data_hora_efetiva_saida` | timestamp | `data_hora_efetiva_saida` | tabela e modal de detalhes |
| `data_hora_efetiva_chegada` | timestamp | `data_hora_efetiva_chegada` | tabela e modal de detalhes |
| `status` | varchar(30), default `AGENDADA` | `status` (`AGENDADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`) | tabela (badges) e abas de filtro |

### Rastreabilidade: Figma vs. Banco de Dados / Produto Real (Viagens)
| Critério | No Protótipo do Figma | No Banco / Back-end Real | Decisão de Projeto & Motivo |
|---|---|---|---|
| **Vínculo da Viagem** | Viagem criada de forma solta/avulsa | Toda viagem nasce de uma solicitação aprovada (`solicitacoes_viagem.id`) | **Adequado ao Banco**: cumpre o fluxo de governança RN01–RN03 (Solicitação → Análise do Gestor → Agendamento). |
| **Quilometragem / Distância** | Distância estática em texto ("99 km") | Odômetro de saída (`km_inicial`) e retorno (`km_final`) | **Adequado ao Banco**: a distância percorrida é apurada por `km_final - km_inicial`. |
| **Identificadores (IDs)** | Strings fictícias (`VIA-0881`) | Identificadores inteiros seriais (`id: integer`) | **Adequado ao Banco**: IDs formatados visualmente como `#881`, mantendo a integridade com o banco. |
| **Separação de Frotas** | Itinerários misturados sem divisão de operação | Separação explícita entre Frota Administrativa (`viagens_frota`) e SVO (`ordens_svo`) | **O Banco tem a mais**: implementadas abas e identificadores de operação para cumprir a **RN21**. |
| **Passageiros / Carga** | Lista de passageiros avulsos no modal | O pedido institucional registra solicitante e finalidade | **Removido do Figma**: não existe tabela de passageiros individuais no banco de dados. |
| **Status da Viagem** | "Em Andamento", "Agendada", "Concluída" | `AGENDADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA` | **Alinhado ao Banco**: suporte aos 4 estados operacionais previstos na modelagem. |

### Composição e Otimização da Tabela & Ticket de Viagem Inline:
- **Linha Clicável com Ticket de Viagem Expansível**: Toda a linha da tabela é interativa (`cursor: pointer` com hover suave e destaque ativo `is-expanded`). Ao clicar em qualquer viagem, ela expande inline um **Ticket de Viagem / Manifesto de Bordo** corporativo e limpo.
- **Cabeçalho Corporativo e Limpo**: Fundo neutro suave (`var(--color-surface-alt)`), identificador em destaque `Viagem #ID`, tipo de frota institucional (`Frota Administrativa` ou `SVO`) e referência da `Solicitação #ID`, com botão discreto de fechar e sem bordas ou gradientes artificiais.
- **Percurso Cronológico e Rótulos Claros**:
  - Origem e Destino com rótulos diretos ("Origem" e "Destino"), trazendo o horário de saída (`Saída: HH:mm`) logo abaixo da origem e a previsão/retorno (`Chegada: HH:mm`) abaixo do destino.
  - Ponto central da rota com indicador de distância consolidada (`35 km`), sem duplicar a duração no centro do trajeto.
- **Auditoria de Odômetro e Tempo (Canhoto Lateral)**:
  - Controle estrito de `Km Inicial` e `Km Final`, calculando a `Distância percorrida` apurada.
  - Métrica técnica de `Duração do Percurso` calculada dinamicamente entre as datas efetivas de saída e chegada (`data_hora_efetiva_chegada - data_hora_efetiva_saida`), sem requerer colunas extras no banco.
  - Botão **Imprimir Manifesto** preservado esteticamente como esboço de interface no canhoto.
- **Blocos Contextuais de Agentes**:
  - **Condutor Responsável**: Nome do motorista e categoria da CNH (dados reais da tabela `motoristas`).
  - **Veículo Alocado**: Modelo e placa do veículo (dados reais da tabela `veiculos`).
  - **Solicitante Institucional**: Nome do solicitante e cargo/vínculo, eliminando redundâncias visuais de repetição do ID da solicitação.
  - **Finalidade / Justificativa**: Exibe o motivo oficial registrado na solicitação de viagem.
- **Remoção do Botão de Detalhes**: Com a abertura direta do Ticket pelo clique na linha, o botão "Detalhes" foi removido da última coluna, liberando espaço horizontal sem poluição visual.
- **Unificação de Horários na Tabela**: Em vez de ocupar duas colunas inteiras isoladas para `Partida` e `Chegada`, os horários foram unificados em uma única coluna hierárquica **Horários**, exibindo Saída, Chegada / Em trânsito / Aguardando saída com micro-indicadores de status.
- **Hierarquia do Trajeto**: A coluna **Origem / Destino** utiliza indicador visual com ícone de pin na origem e conector `↳` no destino, permitindo que trajetos longos respirem com limite de quebra em 2 linhas sem espremer o restante da tabela.
- **Contenção e Espaçamentos do Card**: Ajustado o padding horizontal padrão de células da tabela para 14px (com 20px nas extremidades alinhados à barra de ferramentas) e aplicada contenção `min-width: 0; max-width: 100%` no container `.card`, evitando estouros horizontais quando a sidebar estiver aberta em desktops e laptops.
- **Ações Otimizadas**: A última coluna agora acomoda apenas a ação operacional ativa (`Finalizar`, restrita a viagens em andamento) com botão contextual e o ícone rotativo de expansão do ticket.

### Como testar a Tela de Viagens:
1. Abra `http://localhost:5173/viagens`.
2. Confira os 4 cards de métricas no topo (`Total de Viagens`, `Em Andamento`, `Agendadas` e `Concluídas`).
3. Alterne as abas de filtro: `Todas`, `Em Andamento`, `Agendadas`, `Concluídas`, `Frota` e `SVO`.
4. Digite no campo de busca para filtrar por trajeto, condutor ou placa em tempo real.
5. Clique em qualquer linha da tabela para expandir o **Ticket de Viagem** inline, com detalhes completos do manifesto, odômetro e rota. Clique novamente ou no botão 'X' para recolher.
6. Clique em **Nova Viagem** para vincular uma solicitação aprovada a um veículo e motorista disponíveis com registro de odômetro inicial.
7. Em uma viagem com status `Em Andamento`, clique em **Finalizar** (na tabela ou dentro do próprio ticket) para preencher o odômetro final (`km_final`) e registrar a conclusão da viagem.

## 12. Matriz de Rastreabilidade Geral (Figma vs. Banco de Dados / Produto Real)

Visão geral consolidada de todas as adequações realizadas entre o protótipo visual (Figma) e o sistema real (Banco e Back-end):

| Módulo / Tela | O que o Figma tinha a mais (Removido do produto real) | O que o Banco / Produto Real tem a mais (Não existia no Figma) |
|---|---|---|
| **Veículos (`/veiculos`)** | - Ano de fabricação e Km atual no cadastro estático<br>- Motorista fixo vinculado ao veículo<br>- Categorias "Caminhão" e "Van"<br>- Status "Inativo" e "Em Viagem" | - `tipo_frota`: `ADMINISTRATIVA` e `SVO` obrigatórios<br>- `capacidade_maxima` de lotação obrigatória<br>- Status oficiais: `DISPONIVEL`, `EM_USO`, `MANUTENCAO` |
| **Motoristas (`/motoristas`)** | - Telefone e contador de viagens acumuladas<br>- Veículo fixo vinculado<br>- Status "Ativo", "Em Viagem" e "Licença" | - `numero_cnh`, `categoria_cnh` (A–E) e `validade_cnh`<br>- Alerta proativo de CNH vencida calculado no front<br>- `tipo_motorista`: `FROTA` e `SVO`<br>- Vínculo relacional `usuario_id` com a tabela `usuarios` |
| **Usuários (`/usuarios`)** | - Coluna "Último Acesso" (`ultimo`)<br>- Status "Licença"<br>- Perfis fictícios ("Gestor", "Operacional")<br>- Toggle "É motorista?" criando CNH e alocando veículo no modal | - 6 perfis oficiais FSPH (`ADMINISTRADOR`, `SOLICITANTE`, `GESTOR_FROTA`, `GESTOR_SVO`, `MOTORISTA_FROTA`, `MOTORISTA_SVO`)<br>- `tipo_usuario` derivado por constraint<br>- Rota de Redefinir Senha (`PATCH /api/usuarios/:id/senha`) com regras de senha forte<br>- Ação de Ativar/Desativar conta com autoproteção do admin logado |
| **Dashboard (`/dashboard`)** | - Sub-rótulos "Passeio" e "Amb."<br>- Status "Manutenção" em solicitações de viagem<br>- IDs com string (`SOL-1042`)<br>- Motorista fixado antes da aprovação da solicitação | - Segregação real da frota (`ADMINISTRATIVA` vs `SVO`)<br>- Alertas unificados de manutenção de veículos e CNH vencida<br>- Vínculos relacionais com solicitantes institucionais (`solicitacoes_viagem`) |
| **Viagens (`/viagens`)** | - Viagem avulsa sem solicitação institucional vinculada<br>- Distância fixa como texto arbitrário ("99 km")<br>- Lista fictícia de passageiros avulsos<br>- IDs com string (`VIA-0881`) | - Vínculo relacional obrigatório com `solicitacao_id` aprovada (RN01–RN03)<br>- Controle estrito por odômetro (`km_inicial`, `km_final`, distância apurada)<br>- Segregação de frotas (Frota Adm vs SVO) conforme RN21<br>- Ação de despacho e registro de retorno pelo motorista/gestor |
| **Identidade / Ícones** | - Emojis textuais e SVGs soltos | - Biblioteca profissional padronizada `lucide-react` em todas as telas |

## 13. Pontos em aberto com o back-end
- O banco **não tem CHECK na coluna `status`** de `veiculos` nem de `motoristas`. Os valores válidos estão só no dicionário de dados.
- O dicionário cita `EM_USO` para veículos, mas nenhum código do back-end usa esse valor ainda.
- **O dicionário de dados está desatualizado para `motoristas`**: ele lista `cnh` e `validade_cnh`, mas o banco tem `numero_cnh`, `categoria_cnh`, `validade_cnh`, `tipo_motorista` e `status`. O front segue o banco.
- Para `motoristas.status`, só se conhece `DISPONIVEL` (padrão). Falta definir os demais valores (ex.: em viagem, afastado).
- Os endpoints de `usuarios` estão totalmente prontos e documentados no backend (`GET /api/usuarios`, `POST /api/usuarios`, `PATCH /api/usuarios/:id`, `PATCH /api/usuarios/:id/senha`).
- **Ainda não há endpoints para Viagens no back-end**: a tela de viagens consome os dados mockados em `services/mocks/viagensMock.ts`. Quando os endpoints forem desenvolvidos pela equipe de back-end, basta conectar a camada de serviços sem alterar a interface.

## 14. Próximas telas
Agenda e Login, nessa ordem. Cada uma ganha uma subseção neste documento ao ser implementada.
