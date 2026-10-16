# Documentação do Front-end

Documento único do front-end. Atualize-o a cada nova tela ou mudança de padrão.

## 1. Stack
- React 19 + TypeScript (modo estrito) + Vite
- CSS puro com variáveis (sem Tailwind)
- `react-router-dom` para as rotas

## 2. Como rodar
```bash
cd src/frontend
npm install
npm run dev      # http://localhost:5173/
npm run build    # confere tipos e gera o build
```
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
| `/dashboard` | `DashboardPage` | provisória |
| `/agenda` | `AgendaPage` | provisória |
| `/veiculos` | `VeiculosPage` | implementada (mock) |
| `/motoristas` | `MotoristasPage` | implementada (mock) |
| `/viagens` | `ViagensPage` | provisória |
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

## 10. Pontos em aberto com o back-end
- O banco **não tem CHECK na coluna `status`** de `veiculos` nem de `motoristas`. Os valores válidos estão só no dicionário de dados.
- O dicionário cita `EM_USO` para veículos, mas nenhum código do back-end usa esse valor ainda.
- **O dicionário de dados está desatualizado para `motoristas`**: ele lista `cnh` e `validade_cnh`, mas o banco tem `numero_cnh`, `categoria_cnh`, `validade_cnh`, `tipo_motorista` e `status`. O front segue o banco.
- Para `motoristas.status`, só se conhece `DISPONIVEL` (padrão). Falta definir os demais valores (ex.: em viagem, afastado).
- Os endpoints de `usuarios` estão totalmente prontos e documentados no backend (`GET /api/usuarios`, `POST /api/usuarios`, `PATCH /api/usuarios/:id`, `PATCH /api/usuarios/:id/senha`). A integração do front com o backend poderá ser realizada assim que a camada de autenticação/token JWT for conectada.

## 11. Próximas telas
Dashboard, Viagens, Login e Agenda, nessa ordem de facilidade. Cada uma ganha uma subseção neste documento ao ser implementada.
