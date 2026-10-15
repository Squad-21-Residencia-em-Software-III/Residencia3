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
| `/usuarios` | `UsuariosPage` | provisória |
| qualquer outra | `NotFoundPage` | pronta |

Ainda não há tela de login nem proteção de rotas.

## 6. Origem dos dados
> [!WARNING]
> Os dados exibidos são **fictícios (mock)**. Não vêm do banco nem da API. Itens cadastrados pela tela existem só na memória do navegador e somem ao recarregar.

| Tela | Origem | Observação |
|---|---|---|
| Veículos | `services/mocks/veiculosMock.ts` | dados baseados nos 5 veículos do seed (`src/backend/database/seeds/01_dados_iniciais.js`) |
| Motoristas | `services/mocks/motoristasMock.ts` | lista de motoristas simulados (respeitando o schema de `motoristas` e perfis de `usuarios`) |

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

## 9. Pontos em aberto com o back-end
- O banco **não tem CHECK na coluna `status`** de `veiculos` nem de `motoristas`. Os valores válidos estão só no dicionário de dados.
- O dicionário cita `EM_USO` para veículos, mas nenhum código do back-end usa esse valor ainda.
- **O dicionário de dados está desatualizado para `motoristas`**: ele lista `cnh` e `validade_cnh`, mas o banco tem `numero_cnh`, `categoria_cnh`, `validade_cnh`, `tipo_motorista` e `status`. O front segue o banco.
- Para `motoristas.status`, só se conhece `DISPONIVEL` (padrão). Falta definir os demais valores (ex.: em viagem, afastado).
- Não existe endpoint de listagem nem de cadastro de veículos ou motoristas. Só há `GET /api/veiculos/svo/disponiveis`.

## 10. Próximas telas
Usuários, Dashboard, Viagens, Login e Agenda, nessa ordem de facilidade. Cada uma ganha uma subseção neste documento ao ser implementada.
