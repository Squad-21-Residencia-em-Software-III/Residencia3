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
> **Atenção aos desenvolvedores**:
> 1. Foi adicionada a dependência `lucide-react`. Ao atualizar ou clonar a branch, é obrigatório rodar `npm install` dentro de `src/frontend`.
> 2. Crie o arquivo `src/frontend/.env` com `VITE_API_URL=http://localhost:3000/api` para comunicação correta com o back-end em desenvolvimento.

O front-end **está oficialmente conectado ao back-end para Autenticação e Sessão** (`POST /api/auth/login`, `GET /api/auth/me`). Os módulos operacionais (Veículos, Motoristas, Viagens, Abastecimento, Multas) utilizam persistência no navegador via `storageService` enquanto aguardam a conexão de seus endpoints REST definitivos.

## 3. Estrutura de pastas
```
src/frontend/
├─ public/assets/        logos e ícone
└─ src/
   ├─ contexts/          AuthContext (estado global da sessão e usuário logado)
   ├─ styles/            tokens.css (cores, fontes, raios...) e global.css
   ├─ components/
   │  ├─ ui/             Button, Card, Badge, Avatar, Input, Select, Modal, Table, ícones
   │  └─ layout/         AppLayout (barra lateral dinâmica por perfil e topo)
   ├─ pages/             uma página por rota (ex.: LoginPage.tsx, VeiculosPage.tsx)
   ├─ routes/            index.tsx (roteamento) e guards.tsx (proteção de rotas e RBAC)
   ├─ services/
   │  ├─ api/            http.ts (cliente HTTP com interceptors) e authApi.ts (endpoints de auth)
   │  ├─ mocks/          dados fictícios iniciais
   │  └─ storageService.ts persistência local no localStorage para os módulos operacionais
   └─ types/             tipos TypeScript espelhando as entidades do banco e domínio
```

## 4. Padrões
- **Estilo**: usar as variáveis de `styles/tokens.css`. Não escrever cores fixas nos componentes.
- **Componentes**: reutilizar os de `components/ui`. Importar por `components/ui`.
- **Tipos**: cada tipo em `types/` espelha uma tabela do banco (ver `docs/dicionario-de-dados.md`). Não adicionar campos que não existam na tabela.
- **Dados**: a tela consome uma lista de `services/`. Quando houver API, troca-se só essa origem.

## 5. Rotas e Permissões

| Rota | Página | Tipo de Acesso | Permissões |
|---|---|---|---|
| `/login` | `LoginPage` | Pública (`RotaPublica`) | Qualquer visitante (usuário logado é redirecionado para `/dashboard`) |
| `/` | Redirecionamento | Protegida | Redireciona para `/dashboard` |
| `/dashboard` | `DashboardPage` | Protegida (`RotaProtegida`) | Qualquer usuário autenticado |
| `/agenda` | `AgendaPage` | Protegida (`RotaProtegida`) | Qualquer usuário autenticado |
| `/veiculos` | `VeiculosPage` | Protegida (`RotaProtegida`) | Qualquer usuário autenticado |
| `/abastecimento` | `AbastecimentoPage` | Protegida (`RotaProtegida`) | Qualquer usuário autenticado |
| `/motoristas` | `MotoristasPage` | Protegida (`RotaProtegida`) | Qualquer usuário autenticado |
| `/viagens` | `ViagensPage` | Protegida (`RotaProtegida`) | Qualquer usuário autenticado |
| `/multas` | `MultasPage` | Protegida (`RotaProtegida`) | Qualquer usuário autenticado |
| `/usuarios` | `UsuariosPage` | Restrita por Perfil (`RotaPorPerfil`) | Exclusivo para perfil `ADMINISTRADOR` |
| qualquer outra | `NotFoundPage` | Protegida | Exibida dentro do layout para rotas não mapeadas |

---

## 6. Arquitetura de Autenticação e Sessão

A autenticação é baseada em tokens **JWT (JSON Web Tokens)** e conecta o front-end diretamente à API do back-end (`http://localhost:3000/api`).

### 6.1 Fluxo Arquitetural

```text
[ Tela de Login (LoginPage) ]
              ↓
[ AuthContext (useAuth Hook) ]
              ↓
[ authApi.ts (Contrato de Endpoints) ]
              ↓
[ http.ts (Cliente HTTP com Interceptors & LocalStorage) ]
              ↓
[ API REST Express (JWT + PostgreSQL) ]
```

### 6.2 Componente Raiz (`App.tsx`)
O arquivo `src/frontend/src/App.tsx` é o componente raiz da aplicação. O provedor `<AuthProvider>` **obrigatoriamente** envolve o `<AppRoutes />` para fornecer o contexto de autenticação global para todos os componentes e guardas de rota:

```tsx
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AppRoutes } from './routes'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
```

### 6.3 Cliente HTTP e Gestão de Tokens (`services/api/http.ts`)
Construído como um wrapper limpo e tipado sobre a Fetch API nativa do navegador:
- **Armazenamento de Token**: O token é persistido no `localStorage` sob a chave `'fsph.token'` pelo utilitário `tokenStorage`.
- **Injeção de Cabeçalho**: Em toda requisição autenticada, adiciona automaticamente `Authorization: Bearer <token>`.
- **Tratamento de Sessão Expirada (401)**: Se a API responder `401 Unauthorized` (ex.: após 8h de expiração do JWT), o token é limpo e um evento global `auth:expirada` é disparado, deslogando o usuário sem acoplamento direto com o React.
- **Tratamento de Erros (`ApiError`)**: Converte respostas de erro da API no formato padronizado `{ erro, detalhes }`, permitindo feedback amigável na interface.

### 6.4 Serviço de Autenticação (`services/api/authApi.ts`)
Encapsula os endpoints de autenticação do back-end:
- `login(email, senha)`: Dispara `POST /api/auth/login`. Recebe `{ token, tipo, expiraEm, usuario }`.
- `me()`: Dispara `GET /api/auth/me`. Restaura a sessão do usuário logado através do token salvo.
- `alterarSenha(senhaAtual, novaSenha)`: Dispara `PATCH /api/auth/senha`.

### 6.5 Estado Global e Hook `useAuth` (`contexts/AuthContext.tsx`)
Gerencia o ciclo de vida do usuário:
- **Auto-login ao iniciar (F5)**: Ao carregar a página, se houver token salvo, chama `authApi.me()` em segundo plano com indicador `carregando = true`.
- **Funções e Dados Expostos**:
  - `usuario`: Objeto com `id`, `nome`, `email`, `perfil`, `tipo_usuario`, `ativo`.
  - `carregando`: `true` enquanto verifica o token inicial.
  - `login(email, senha)`: Realiza a autenticação e armazena o token.
  - `logout()`: Limpa o token e encerra a sessão.
  - `temPerfil(...perfis)`: Helper booleano para validar se o usuário atual possui um determinado perfil (ex.: `temPerfil('ADMINISTRADOR')`).

### 6.6 Guardas de Rota e RBAC (`routes/guards.tsx` e `routes/index.tsx`)
- **`RotaPublica`**: Impede que usuários já autenticados acessem a tela de login (redireciona para `/dashboard`).
- **`RotaProtegida`**: Bloqueia acessos anônimos às telas do sistema. Grava em `location.state.de` a página que o usuário tentou acessar para redirecioná-lo automaticamente após o login.
- **`RotaPorPerfil`**: Implementa o controle de acesso baseado em papéis (RBAC). Bloqueia acesso a rotas não permitidas para o perfil do usuário logado.
- **Menu Lateral Dinâmico**: A barra lateral (`AppLayout`) filtra os itens navegáveis (`navItems`), exibindo apenas as abas compatíveis com o perfil do usuário logado.

### 6.7 Credenciais Padrão de Teste (Ambiente de Desenvolvimento)
Todos os usuários de teste usam a senha padrão: **`Senha@123`**

| Perfil | E-mail de Teste | Acesso no Front-end |
|---|---|---|
| Administrador | `admin@exemplo.com` | Acesso completo, incluindo gestão de Usuários (`/usuarios`) |
| Gestor de Frota | `gestor.frota@exemplo.com` | Dashboard, Agenda, Veículos, Motoristas, Viagens |
| Gestor SVO | `gestor.svo@exemplo.com` | Dashboard, Agenda, Veículos, Motoristas, Viagens do SVO |
| Solicitante | `solicitante@exemplo.com` | Dashboard, Agenda, Solicitações de Viagens |
| Motorista Frota | `motorista.frota@exemplo.com` | Dashboard, Agenda, Viagens |
| Motorista SVO | `motorista.svo@exemplo.com` | Dashboard, Agenda, Viagens |

---

## 7. Origem dos dados
> [!WARNING]
> Os dados exibidos são **fictícios (mock)**. Não vêm do banco nem da API. Itens cadastrados pela tela existem só na memória do navegador e somem ao recarregar.

| Tela | Origem | Observação |
|---|---|---|
| Veículos | `services/mocks/veiculosMock.ts` | dados baseados nos 5 veículos do seed (`src/backend/database/seeds/01_dados_iniciais.js`) |
| Motoristas | `services/mocks/motoristasMock.ts` | lista de motoristas simulados (respeitando o schema de `motoristas` e perfis de `usuarios`) |
| Usuários | `services/mocks/usuariosMock.ts` | dados baseados nos 7 usuários do seed (`src/backend/database/seeds/01_dados_iniciais.js`) e regras dos 6 perfis oficiais |
| Dashboard / Solicitações | `services/mocks/solicitacoesMock.ts` | resumo de solicitações de viagens e viagens ativas consolidando dados com veículos e motoristas |
| Viagens | `services/mocks/viagensMock.ts` | dados estruturados conforme as tabelas `viagens_frota` e `ordens_svo` do banco de dados |
| Agenda | `services/mocks/agendaMock.ts` | rotas padronizadas nos 5 veículos oficiais do seed e sincronizadas com as viagens |

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

## 12. Tela de Agenda (`/agenda`)
Painel de alocação temporal e monitoramento da frota, alimentado pelas tabelas `viagens_frota`, `solicitacoes_viagem`, `veiculos` e `motoristas`.

A tela organiza visualmente o uso dos recursos (veículos e motoristas) ao longo do tempo, permitindo ao gestor identificar janelas livres, planejar despachos futuros e prevenir conflitos operacionais.

### Mapeamento dos Dados:
| Coluna no banco / Tabela | Tipo | Campo no front (`types/agenda.ts`) | Onde aparece na Agenda |
|---|---|---|---|
| `viagens_frota.id` | serial, PK | `id` | Identificador visual `#ID` no modal e blocos |
| `veiculos.id` / `placa` / `modelo` | relacional | `veiculo_id`, `veiculo_placa`, `veiculo_modelo` | Eixo Y de recursos em Hoje e Semana |
| `motoristas.id` / `usuarios.nome` | relacional | `motorista_id`, `motorista_nome` | Sub-rótulo de recurso e modal de detalhes |
| `solicitacoes_viagem.origem` | varchar(255) | `origem` | Bloco da rota e título do modal |
| `solicitacoes_viagem.destino` | varchar(255) | `destino` | Bloco da rota e título do modal |
| `solicitacoes_viagem.finalidade` | text | `finalidade` | Modal de detalhes da viagem |
| `usuarios.nome` (solicitante) | varchar(150) | `solicitante_nome` | Modal de detalhes (substitui passageiros fictícios) |
| `veiculos.capacidade_maxima` | integer | `capacidade_maxima` | Lotação máxima oficial do veículo alocado |
| `data_hora_efetiva_saida` ou prevista | timestamp | `data_hora_saida` | Posição inicial do bloco (`left`) |
| `data_hora_efetiva_chegada` ou prevista | timestamp | `data_hora_chegada` | Posição final e largura do bloco (`width`) |
| `viagens_frota.status` | enum/varchar | `status` (`AGENDADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`) | Cores dos blocos e badges |

### Rastreabilidade: Figma vs. Banco de Dados / Produto Real (Agenda)
| Critério | No Protótipo do Figma | No Banco / Back-end Real | Decisão de Projeto & Motivo |
|---|---|---|---|
| **Passageiros / Carga** | Lista de passageiros avulsos e lotação ("3/5 vagas") no modal | Não existe tabela de passageiros avulsos no PostgreSQL. O vínculo é institucional (`solicitante_id` e `finalidade`). | **Removido do Figma**: Substituído pelo solicitante institucional (`usuarios.nome`), finalidade oficial do serviço e capacidade máxima cadastrada do veículo (`veiculos.capacidade_maxima`). |
| **Identificadores das Viagens** | Strings arbitrárias (`VIA-0881`, `W01`) | Identificadores seriais inteiros (`id: integer`) | **Adequado ao Banco**: Formatados no padrão visual institucional `#881`. |
| **Status da Viagem** | Textos livres com acento ("Concluída", "Em Andamento", "Agendada") | Enums padronizados em caixa alta (`AGENDADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`) | **Alinhado ao Banco**: Utiliza a mesma chave de status e estilo unificado de badges de `/viagens`. |
| **Ícones e Alertas de Exceção** | Emojis textuais (`🔴`, `⚠️`, `🟢`) na visão Mês | Proibido pelo design system do projeto | **Removido do Figma**: Substituído por ícones vetoriais padronizados `lucide-react` (`AlertCircle`, `AlertTriangle`, `CheckCircle2`, `Clock`). |
| **Quilometragem / Distância** | Texto estático solto ("99 km") | Cálculo a partir do odômetro (`km_final - km_inicial`) ou estimativa de trajeto | **Adequado ao Banco**: Exibição da distância apurada ou planejada em conformidade com o odômetro. |
| **Estilos & Layout** | Tailwind CSS e cores inline soltas | Vanilla CSS com variáveis de `tokens.css` | **Adequado ao Padrão**: Uso rigoroso de variáveis do tema (`var(--color-primary)`, etc.). |

### Composição das 3 Visualizações da Agenda:
1. **Modo "Hoje" (Gantt Horário Interativo)**:
   - Grade temporal contínua das **05:00 às 20:00** (80px por hora).
   - Marcador vertical dinâmico do **"Agora"** (linha azul destacada com relógio em tempo real).
   - Eixo Y com veículos (modelo e placa) e condutores responsáveis.
   - Posicionamento matemático proporcional dos blocos (`left` e `width` calculados por minutos a partir das 05h).
   - Scroll horizontal sincronizado entre o cabeçalho de horários e a grade de recursos.
2. **Modo "Semana" (Mini-Timeline de 7 Dias)**:
   - Colunas de Segunda a Domingo com destaque circular no dia atual.
   - Eixo Y com veículos da frota.
   - Barras compactas proporcionais ao percurso com **tooltip flutuante no hover** exibindo horários e rota.
   - Clique em qualquer barra abre o modal de detalhes da viagem.
3. **Modo "Mês" (Calendário de Gestão por Exceção)**:
   - Calendário mensal 7x5 focado em **Gestão por Exceção**: dias sem ocorrências mantêm visual neutro e limpo.
   - Dias passados exibem apenas o consolidado discreto de viagens realizadas.
   - Dias futuros com alertas exibem chips informativos:
     - `Gargalo`: escassez de veículos/motoristas.
     - `Pico`: horários de alta demanda com poucos veículos livres.
     - `Normal`: capacidade equilibrada.
   - Clique em um dia com exceção transiciona automaticamente para a visão detalhada do dia.

### Como testar a Tela de Agenda:
1. Acesse `http://localhost:5173/agenda`.
2. Alterne entre as 3 abas de visualização: **Hoje**, **Semana** e **Mês**.
3. Na visão **Hoje**, confira a régua horária das 05h às 20h, o marcador vertical do horário atual e o scroll horizontal sincronizado.
4. Na visão **Semana**, passe o mouse sobre os blocos diários para verificar o tooltip com horário e rota.
5. Na visão **Mês**, confira a grade de calendário e os chips de gestão por exceção com ícones `lucide-react`.
6. Clique em qualquer viagem (em Hoje ou Semana) para abrir o **Modal de Detalhes da Viagem**, conferindo o trajeto, horários, motorista, veículo e justificativa institucional (sem passageiros avulsos fictícios).

## 13. Matriz de Rastreabilidade Geral (Figma vs. Banco de Dados / Produto Real)

Visão geral consolidada de todas as adequações realizadas entre o protótipo visual (Figma) e o sistema real (Banco e Back-end):

| Módulo / Tela | O que o Figma tinha a mais (Removido do produto real) | O que o Banco / Produto Real tem a mais (Não existia no Figma) |
|---|---|---|
| **Veículos (`/veiculos`)** | - Ano de fabricação e Km atual no cadastro estático<br>- Motorista fixo vinculado ao veículo<br>- Categorias "Caminhão" e "Van"<br>- Status "Inativo" e "Em Viagem" | - `tipo_frota`: `ADMINISTRATIVA` e `SVO` obrigatórios<br>- `capacidade_maxima` de lotação obrigatória<br>- Status oficiais: `DISPONIVEL`, `EM_USO`, `MANUTENCAO` |
| **Motoristas (`/motoristas`)** | - Telefone e contador de viagens acumuladas<br>- Veículo fixo vinculado<br>- Status "Ativo", "Em Viagem" e "Licença" | - `numero_cnh`, `categoria_cnh` (A–E) e `validade_cnh`<br>- Alerta proativo de CNH vencida calculado no front<br>- `tipo_motorista`: `FROTA` e `SVO`<br>- Vínculo relacional `usuario_id` com a tabela `usuarios` |
| **Usuários (`/usuarios`)** | - Coluna "Último Acesso" (`ultimo`)<br>- Status "Licença"<br>- Perfis fictícios ("Gestor", "Operacional")<br>- Toggle "É motorista?" criando CNH e alocando veículo no modal | - 6 perfis oficiais FSPH (`ADMINISTRADOR`, `SOLICITANTE`, `GESTOR_FROTA`, `GESTOR_SVO`, `MOTORISTA_FROTA`, `MOTORISTA_SVO`)<br>- `tipo_usuario` derivado por constraint<br>- Rota de Redefinir Senha (`PATCH /api/usuarios/:id/senha`) com regras de senha forte<br>- Ação de Ativar/Desativar conta com autoproteção do admin logado |
| **Dashboard (`/dashboard`)** | - Sub-rótulos "Passeio" e "Amb."<br>- Status "Manutenção" em solicitações de viagem<br>- IDs com string (`SOL-1042`)<br>- Motorista fixado antes da aprovação da solicitação | - Segregação real da frota (`ADMINISTRATIVA` vs `SVO`)<br>- Alertas unificados de manutenção de veículos e CNH vencida<br>- Vínculos relacionais com solicitantes institucionais (`solicitacoes_viagem`) |
| **Viagens (`/viagens`)** | - Viagem avulsa sem solicitação institucional vinculada<br>- Distância fixa como texto arbitrário ("99 km")<br>- Lista fictícia de passageiros avulsos<br>- IDs com string (`VIA-0881`) | - Vínculo relacional obrigatório com `solicitacao_id` aprovada (RN01–RN03)<br>- Controle estrito por odômetro (`km_inicial`, `km_final`, distância apurada)<br>- Segregação de frotas (Frota Adm vs SVO) conforme RN21<br>- Ação de despacho e registro de retorno pelo motorista/gestor |
| **Agenda (`/agenda`)** | - Lista fictícia de passageiros avulsos e vagas ("3/5 vagas")<br>- IDs com string (`VIA-0881`, `W01`)<br>- Emojis de alerta (`🔴`, `⚠️`, `🟢`)<br>- Status em texto livre ("Concluída", "Em Andamento") | - Vínculo relacional institucional (`solicitacoes_viagem` e `viagens_frota`)<br>- Capacidade máxima oficial do veículo (`veiculos.capacidade_maxima`)<br>- Solicitante e justificativa institucional da viagem<br>- Status enum padrão do banco (`AGENDADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`)<br>- Ícones vetoriais padronizados `lucide-react` |
| **Identidade / Ícones** | - Emojis textuais e SVGs soltos | - Biblioteca profissional padronizada `lucide-react` em todas as telas |

## 14. Pontos em aberto com o back-end
- O banco **não tem CHECK na coluna `status`** de `veiculos` nem de `motoristas`. Os valores válidos estão só no dicionário de dados.
- O dicionário cita `EM_USO` para veículos, mas nenhum código do back-end usa esse valor ainda.
- **O dicionário de dados está desatualizado para `motoristas`**: ele lista `cnh` e `validade_cnh`, mas o banco tem `numero_cnh`, `categoria_cnh`, `validade_cnh`, `tipo_motorista` e `status`. O front segue o banco.
- Para `motoristas.status`, só se conhece `DISPONIVEL` (padrão). Falta definir os demais valores (ex.: em viagem, afastado).
- Os endpoints de `usuarios` estão totalmente prontos e documentados no backend (`GET /api/usuarios`, `POST /api/usuarios`, `PATCH /api/usuarios/:id`, `PATCH /api/usuarios/:id/senha`).
- **Ainda não há endpoints para Viagens no back-end**: a tela de viagens consome os dados mockados em `services/mocks/viagensMock.ts`. Quando os endpoints forem desenvolvidos pela equipe de back-end, basta conectar a camada de serviços sem alterar a interface.

## 15. Roadmap de Funcionalidades & Entregas (Ordenado por Complexidade)

Para que o sistema passe de um conjunto de protótipos visuais isolados para uma aplicação web plenamente funcional e integrada, foi estabelecido um fluxo gradual de entregas. 

A estratégia técnica adota uma **camada de persistência em Cache local (`localStorage` / Store centralizado)** inicial. Isso garante que qualquer operação (cadastros, edições, alterações de status) seja persistida no navegador e sincronizada entre diferentes módulos em tempo real, servindo como base estável antes do chaveamento definitivo para os endpoints da API REST do back-end.

---

### 🗺️ Matriz de Priorização das Entregas

| Nível | Módulo / Funcionalidade | Complexidade | Impacto Prático & Dependências |
|---|---|---|---|
| **Nível 1** | **Veículos em Cache (`/veiculos`)** | 🟢 Muito Fácil | Cadastro de novo veículo com persistência em `localStorage`. Atualiza a tabela imediatamente, recalcula os 4 cards do topo e persiste após F5. |
| **Nível 1** | **Motoristas em Cache (`/motoristas`)** | 🟢 Muito Fácil | Cadastro de novo motorista com persistência em `localStorage`. Atualiza listagem, recalcula cards (inclusive alerta de CNH vencida) e persiste após F5. |
| **Nível 2** | **Usuários em Cache (`/usuarios`)** | 🟡 Fácil / Médio | CRUD completo (cadastro, edição, redefinição de senha e toggle de ativação/inativação) persistido em cache, com bloqueio de auto-desativação do admin. |
| **Nível 2** | **Sincronização Cruzada (Veículos/Motoristas ➔ Viagens/Dashboard)** | 🟡 Fácil / Médio | O modal de "Nova Viagem" (`/viagens`) passa a consumir os veículos e motoristas recém-cadastrados no cache, e o `/dashboard` reflete os quantitativos reais da frota. |
| **Nível 3** | **Ciclo de Viagens em Cache (`/viagens`)** | 🟠 Médio | Agendamento de viagem vinculando solicitação aprovada, despacho (`EM_ANDAMENTO`), finalização com registro de `km_final >= km_inicial`, apuração da distância e liberação automática do veículo e condutor para `DISPONIVEL`. |
| **Nível 3** | **Aprovação de Solicitações no Dashboard (`/dashboard`)** | 🟠 Médio | Gestor aprova ou rejeita solicitações pendentes direto no dashboard; solicitações aprovadas ficam imediatamente disponíveis para agendamento em `/viagens`. |
| **Nível 4** | **Tela de Agenda (`/agenda`)** | 🔴 Médio / Avançado | Visualização em grade horária interativa (*Timeline Gantt*, 05h–20h) mapeando veículos vs. viagens programadas nos modos Hoje, Semana e Mês, com detecção visual de conflitos de horário. |
| **Nível 5** | **Login Institucional & Controle de Sessão (`/login` + RBAC)** | 🔴 Avançado | Tela de login corporativa FSPH, persistência de token/sessão, rotas protegidas (guards) e restrições de permissão por perfil (RN07 e RN21). |
| **Nível 6** | **Integração Real com API REST do Back-end** | 🔴 Avançado | Substituição da camada de `localStorage` por clientes HTTP (`fetch` / `axios`), com gestão assíncrona de loading, tratamento global de erros (400, 401, 403, 500) e feedback de rede. |

---

### Detalhamento dos Níveis:

#### 🟢 Nível 1: Cadastros em Cache de Veículos e Motoristas (Ponto de Partida)
- **Objetivo**: Fornecer a base cadastral da frota persistida no navegador sem dependência de backend imediato.
- **Entregáveis**:
  - Utilitário central de cache local (`storageService.ts`) populado inicialmente com os mocks oficiais caso o `localStorage` esteja vazio.
  - `VeiculosPage`: ao salvar um novo veículo, adiciona no cache, insere no topo da listagem e recalcula os contadores.
  - `MotoristasPage`: ao cadastrar novo condutor, grava no cache, atualiza a tabela e atualiza os contadores de frota/SVO e CNHs vencidas.

#### 🟡 Nível 2: Usuários e Sincronização Cruzada
- **Objetivo**: Conectar o ecossistema para que ações em uma tela repercutam nas demais.
- **Entregáveis**:
  - Persistência das mutações em `UsuariosPage` (edições, novos usuários, senhas redefinidas).
  - Modal `ModalNovaViagem`: dropdowns dinâmicos consumindo veículos e motoristas ativos e disponíveis direto do cache.

#### 🟠 Nível 3: Regras de Negócio de Viagens e Solicitações
- **Objetivo**: Operar o fluxo de vida completo da viagem conforme as regras da FSPH.
- **Entregáveis**:
  - Validação estrita de odômetro de retorno (`km_final >= km_inicial`).
  - Mudança automática de estados: veículo alocado passa para `EM_USO`; veículo finalizado volta para `DISPONIVEL`.
  - Ações de aprovação/rejeição no painel de solicitações do Dashboard.

#### 🔴 Nível 4 a 6: Agenda, Login e Integração de Rede
- **Objetivo**: Fechar o ciclo do sistema com a experiência completa de agendamento visual, autenticação segura e comunicação cliente-servidor real via endpoints REST.

---

## 16. Guia Técnico de Transição: Mocks ➔ Back-end Real & API REST

Este guia detalha o plano de chaveamento arquitetural para substituir os dados simulados (`services/mocks/`) pelas chamadas HTTP reais aos endpoints do back-end Node.js / PostgreSQL.

### Por que as telas já estão 90% prontas?
1. **Fidelidade de Schema**: Todas as interfaces em `src/frontend/src/types/` foram modeladas estritamente a partir do banco PostgreSQL (`veiculos`, `motoristas`, `usuarios`, `solicitacoes_viagem`, `viagens_frota`).
2. **Zero Campos Fictícios**: Foram removidos todos os dados arbitrários do Figma que não possuem sustentação relacional (como listas avulsas de passageiros, tags de telefone estáticas e emojis).
3. **Identificadores e Enums Oficiais**: As telas já esperam IDs inteiros (`number`) e enums padronizados em caixa alta (`DISPONIVEL`, `EM_ANDAMENTO`, `AGENDADA`, etc.).

---

### 🗺️ Matriz de Mapeamento: Telas vs. Endpoints REST da API

| Módulo / Tela | Ação no Front | Endpoint no Back-end | Verbo HTTP | Status Esperado | Payload / Retorno |
|---|---|---|---|---|---|
| **Usuários (`/usuarios`)** | Listar usuários | `/api/usuarios` | `GET` | `200 OK` | `Usuario[]` (já implementado no back) |
| **Usuários (`/usuarios`)** | Criar usuário | `/api/usuarios` | `POST` | `201 Created` | `{ nome, email, senha, perfil }` ➔ `Usuario` |
| **Usuários (`/usuarios`)** | Editar usuário | `/api/usuarios/:id` | `PATCH` | `200 OK` | `{ nome, email, perfil, ativo }` |
| **Usuários (`/usuarios`)** | Redefinir senha | `/api/usuarios/:id/senha` | `PATCH` | `200 OK` | `{ senhaAtual, novaSenha }` |
| **Veículos (`/veiculos`)** | Listar frota | `/api/veiculos` | `GET` | `200 OK` | `Veiculo[]` |
| **Veículos (`/veiculos`)** | Cadastrar veículo | `/api/veiculos` | `POST` | `201 Created` | `{ placa, modelo, tipo_frota, capacidade_maxima }` |
| **Veículos (`/veiculos`)** | Alterar status | `/api/veiculos/:id/status`| `PATCH` | `200 OK` | `{ status: 'DISPONIVEL' \| 'MANUTENCAO' }` |
| **Motoristas (`/motoristas`)** | Listar condutores | `/api/motoristas` | `GET` | `200 OK` | `Motorista[]` (com join de `usuarios.nome`) |
| **Motoristas (`/motoristas`)** | Cadastrar motorista | `/api/motoristas` | `POST` | `201 Created` | `{ usuario_id, numero_cnh, categoria_cnh, validade_cnh, tipo_motorista }` |
| **Viagens (`/viagens`)** | Listar viagens | `/api/viagens` | `GET` | `200 OK` | `Viagem[]` (filtros opcionais `?status=&tipo=`) |
| **Viagens (`/viagens`)** | Despachar nova viagem | `/api/viagens` | `POST` | `201 Created` | `{ solicitacao_id, veiculo_id, motorista_id, km_inicial, data_hora_saida }` |
| **Viagens (`/viagens`)** | Finalizar viagem | `/api/viagens/:id/finalizar` | `PATCH` | `200 OK` | `{ km_final, data_hora_chegada }` |
| **Agenda (`/agenda`)** | Buscar visão do dia | `/api/viagens/agenda?data=YYYY-MM-DD` | `GET` | `200 OK` | `RotaAgenda[]` |
| **Agenda (`/agenda`)** | Buscar visão semanal | `/api/viagens/agenda?semana=YYYY-MM-DD` | `GET` | `200 OK` | `RotaAgenda[]` da semana |
| **Agenda (`/agenda`)** | Exceções do mês | `/api/viagens/agenda/excecoes?mes=MM&ano=YYYY` | `GET` | `200 OK` | `{ excecoes: Record<dia, ExcecaoAgenda[]>, totais: Record<dia, number> }` |
| **Dashboard (`/dashboard`)** | Solicitações recentes | `/api/solicitacoes` | `GET` | `200 OK` | `SolicitacaoViagem[]` |
| **Dashboard (`/dashboard`)** | Aprovar/Rejeitar | `/api/solicitacoes/:id/status` | `PATCH` | `200 OK` | `{ status: 'APROVADA' \| 'REJEITADA' }` |
| **Login (`/login`)** | Autenticar operador | `/api/auth/login` | `POST` | `200 OK` | `{ token: string, usuario: Usuario }` |

---

### 🛠️ Os 4 Passos Práticos para Executar a Migração:

#### 1. Instalação e Configuração do Cliente HTTP (`services/api.ts`)
Criar uma instância centralizada (com `fetch` ou `axios`) para gerenciar URLs base, headers de autenticação e tratamento de respostas:
```typescript
// Exemplo em src/frontend/src/services/api.ts
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('@fsph:token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  if (response.status === 401) {
    localStorage.removeItem('@fsph:token');
    window.location.href = '/login';
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.mensagem || `Erro na requisição: ${response.status}`);
  }

  return response.json();
}
```

#### 2. Criação dos Arquivos de Serviço (`services/<modulo>Service.ts`)
Isolar as chamadas de rede em módulos de serviço, separando a lógica de API dos componentes de UI:
```typescript
// Exemplo em src/frontend/src/services/viagensService.ts
import { request } from './api';
import type { Viagem, NovaViagemInput, FinalizarViagemInput } from '../types/viagem';

export const viagensService = {
  listar: () => request<Viagem[]>('/viagens'),
  criar: (dados: NovaViagemInput) => request<Viagem>('/viagens', { method: 'POST', body: JSON.stringify(dados) }),
  finalizar: (id: number, dados: FinalizarViagemInput) =>
    request<Viagem>(`/viagens/${id}/finalizar`, { method: 'PATCH', body: JSON.stringify(dados) }),
};
```

#### 3. Conversão de `useState(MOCK_...)` para Chamadas Assíncronas nas Telas
Nas páginas (`VeiculosPage`, `MotoristasPage`, `ViagensPage`, `AgendaPage`, etc.), substituir a carga estática por um ciclo de vida assíncrono com feedback visual:

```tsx
// ANTES (Mock Estático na Memória):
const [viagens, setViagens] = useState<Viagem[]>(MOCK_VIAGENS);

// DEPOIS (Consumo Real da API REST):
const [viagens, setViagens] = useState<Viagem[]>([]);
const [carregando, setCarregando] = useState(true);
const [erro, setErro] = useState<string | null>(null);

useEffect(() => {
  viagensService.listar()
    .then((dados) => setViagens(dados))
    .catch((err) => setErro(err.message))
    .finally(() => setCarregando(false));
}, []);
```

#### 4. Geração de Identificadores (Substituir `Math.max` por Retorno do Banco)
Atualmente, as telas geram IDs locais somando `+ 1` sobre os mocks existentes. Com a API conectada:
- A mutation (`POST`) envia apenas o payload sem `id` (ex: `Omit<Veiculo, 'id'>`).
- O PostgreSQL gera a chave primária autoincrementada (`SERIAL`).
- O back-end responde com o objeto completo persistido (`201 Created`).
- O front-end insere a resposta do back-end diretamente na listagem (`setItens((prev) => [novoDoBackend, ...prev])`), garantindo consistência relacional absoluta.

---

### 🔬 Análise Tela a Tela da Transição (Como Cada Tela Será Conectada)

Aproveitando que todas as telas do projeto foram construídas rigorosamente sobre o mesmo padrão arquitetural, a transição individual de cada módulo segue uma receita uniforme:

#### 1. Veículos (`/veiculos`)
- **Estado Atual**: `useState(MOCK_VEICULOS)` na memória do componente.
- **Transição no Front**: Substituir por `veiculosService.listar()` no `useEffect`, e na gravação chamar `veiculosService.cadastrar(payload)`.
- **Contrato com o Back-end**: 
  - `GET /api/veiculos`: retorna a lista de veículos com status atual (`DISPONIVEL`, `EM_USO`, `MANUTENCAO`).
  - `POST /api/veiculos`: valida formato de placa único e insere no PostgreSQL retornando o objeto com `id` serial.
  - `PATCH /api/veiculos/:id/status`: permite enviar o veículo para manutenção ou liberá-lo.

#### 2. Motoristas (`/motoristas`)
- **Estado Atual**: `useState(MOCK_MOTORISTAS)`.
- **Transição no Front**: Consumir `motoristasService.listar()` e `motoristasService.cadastrar()`.
- **Contrato com o Back-end**:
  - `GET /api/motoristas`: rota deve fazer um `JOIN` relacional com `usuarios` para fornecer o nome do condutor (`usuarios.nome`), além de `numero_cnh`, `categoria_cnh`, `validade_cnh` e `tipo_motorista` (`FROTA` / `SVO`).
  - *Auditoria no Front*: O alerta de **CNH Vencida** continuará sendo computado instantaneamente no front-end (`validade_cnh < hoje`), dispensando novas colunas na modelagem.

#### 3. Usuários (`/usuarios`) — *Módulo Pioneiro para Conexão Imediata*
- **Estado Atual**: `useState(MOCK_USUARIOS)` simulando o admin logado.
- **Situação no Back-end**: **Todos os 4 endpoints já estão desenvolvidos, testados e documentados** (`GET /api/usuarios`, `POST /api/usuarios`, `PATCH /api/usuarios/:id`, `PATCH /api/usuarios/:id/senha`).
- **Transição no Front**: Será o primeiro módulo a ser conectado fisicamente quando o token de autenticação estiver ativo.
- **Garantias**: Regras de unicidade de e-mail e validação de senha forte (mínimo 8 caracteres, maiúscula, número e símbolo) já são validadas de forma idêntica tanto no modal do front quanto nas controllers do back.

#### 4. Viagens (`/viagens`)
- **Estado Atual**: `useState(MOCK_VIAGENS)` com cálculo dinâmico de odômetro e ticket de manifesto inline.
- **Transição no Front**: `viagensService.listar()`, `viagensService.despachar(dados)` e `viagensService.finalizar(id, dados)`.
- **Contrato com o Back-end**:
  - `GET /api/viagens`: deve retornar as viagens com os relacionamentos de `solicitacoes_viagem` (origem, destino, finalidade, solicitante), `veiculos` (modelo, placa) e `motoristas` (nome).
  - `PATCH /api/viagens/:id/finalizar`: recebe `{ km_final, data_hora_efetiva_chegada }`, valida `km_final >= km_inicial`, atualiza o status para `CONCLUIDA` e, em transação no PostgreSQL, atualiza o veículo vinculado de volta para `DISPONIVEL`.

#### 5. Dashboard (`/dashboard`)
- **Estado Atual**: Contadores derivados de arrays locais e tabela de solicitações recentes.
- **Transição no Front**: Substituir por `solicitacoesService.listarRecentes()` e endpoints de contagem agregada (ou processamento das listas já cacheadas).
- **Ações Operacionais**: Os botões contextuais de aprovação e rejeição de solicitações dispararão `PATCH /api/solicitacoes/:id/status`.

#### 6. Agenda (`/agenda`)
- **Estado Atual**: `MOCK_AGENDA_HOJE`, `MOCK_AGENDA_SEMANA` e `MOCK_EXCECOES_MES`.
- **Transição no Front**: Como a Agenda utiliza a mesma estrutura relacional de `Viagem`, a rota `GET /api/viagens/agenda?data=...` retornará as viagens agrupadas por veículo para alimentar o Gantt e a timeline de 7 dias sem alterar nenhuma linha de CSS ou componente de renderização.
