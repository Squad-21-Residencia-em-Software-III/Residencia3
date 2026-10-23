# Login e conexão front-back: problemas encontrados e solução

Registro do que aconteceu ao integrar o PR #36 (tela de login e autenticação no front-end) à `develop`, e de como chegamos a um ambiente em que o login funciona e o front conversa com a API.

- **Data:** 22/10/2026
- **Contexto:** após o merge do PR #36 (`login-frontend-limpo` → `develop`, commit `e96f71f`), todas as telas passaram a exigir login. Isso exigiu a API rodando, com banco, migrations e seed.
- **Ambiente:** Windows, PostgreSQL instalado localmente (sem Docker), Node.js 24.

> [!NOTE]
> O fluxo oficial do projeto continua sendo o **Docker** (ver o `guia-de-execucao.md`). Este documento descreve o que foi necessário para rodar com um **PostgreSQL local**, como alternativa, e não muda a arquitetura (ver a seção "Impacto na arquitetura").

## Resumo

| # | Sintoma | Causa | Solução |
|---|---|---|---|
| 1 | Tela do front em branco | `<AuthProvider>` não envolvia as rotas no `App.tsx` | Envolver `<AppRoutes />` com `<AuthProvider>` |
| 2 | Back-end caía: `JWT_SECRET não definida` | O back lê o `.env` da **raiz**, e a variável estava em outro arquivo | Colocar as variáveis no `.env` da raiz |
| 3 | `migrate` falha (`role "admin" não existe`, banco inexistente, `permission denied`) ou conecta na porta errada | O Docker criava usuário, banco e porta automaticamente; no Postgres local nada disso existia | Criar usuário e banco, ajustar permissões e definir `POSTGRES_PORT` (ver item 3) |

## Detalhamento

### 1. Tela em branco depois do merge do PR #36
O `useAuth()` (em `AuthContext.tsx`) lança o erro `useAuth deve ser usado dentro de <AuthProvider>` quando não há provedor acima. O PR criou o `AuthProvider`, mas o `App.tsx` não o usava. O erro derrubava a árvore de componentes e a tela ficava em branco.

Correção em `src/frontend/src/App.tsx`:

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
### 2. O back-end lê o `.env` da raiz, não o de `src/backend`
São necessários apenas dois arquivos `.env`:

| Arquivo | Quem lê |
|---|---|
| `Residencia3/.env` (raiz) | Back-end, Knex e `docker-compose.yml` |
| `src/frontend/.env` | Front-end (Vite), para definir `VITE_API_URL` |

O `JWT_SECRET` estava em `src/backend/.env`, que o back-end ignora. Por isso a API não subia. Se esse arquivo existir na sua máquina, pode removê-lo.

### 3. Configuração do banco (Postgres local)
O `docker-compose.yml` cria o usuário e o banco a partir do `.env` e publica a porta `5433`. Num Postgres instalado localmente nada disso existe, e o Knex só cria as **tabelas**, não o usuário nem o banco. Por isso o `migrate` falhava com `role "admin" não existe`.

Foi criado um usuário e um banco **exclusivos do projeto local**, sem usar o `postgres` nem outros bancos já existentes na máquina.

**a) Usuário e banco.** No Query Tool do pgAdmin, uma instrução por vez:

```sql
CREATE USER admin WITH PASSWORD 'squad_21_password';
```
```sql
CREATE DATABASE frotas_svo OWNER admin;
```

Se o banco já existir com outro dono, use `ALTER DATABASE frotas_svo OWNER TO admin;`.

**b) Permissão no schema.** Conectado ao `frotas_svo`:

```sql
ALTER SCHEMA public OWNER TO admin;
```

No PostgreSQL 15 ou superior, um usuário comum não cria tabelas no schema `public` se não for o dono. Sem isso, o `migrate` falha com `permission denied for schema public`. `SUPERUSER` não é necessário: o `pgcrypto` usado no seed é uma extensão "trusted" desde o PostgreSQL 13 e pode ser criada pelo dono do banco.

**c) Porta.** Sem `POSTGRES_PORT`, o `knexfile.js` usa `5433`. Um Postgres local costuma usar `5432`. Confira no pgAdmin em **Properties → Connection**, ou com `SHOW port;`, e defina `POSTGRES_PORT` no `.env` da raiz.

> [!TIP]
> Com mais de um Postgres instalado (por exemplo, 16 e 18), cada um usa uma porta diferente. Confirme a do servidor em que o banco foi criado.

> [!NOTE]
> Se o pgAdmin responder `NOT FOUND` ao rodar um comando, não é erro do Postgres: a sessão da aba do Query Tool se perdeu. Feche a aba e abra uma nova em **Tools → Query Tool**.

## Configuração final que funcionou

### `.env` da raiz (lido pelo back-end e pelo Knex)
```env
POSTGRES_USER=admin
POSTGRES_PASSWORD=squad_21_password
POSTGRES_DB=frotas_svo
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
JWT_SECRET=<um segredo longo e aleatório>
JWT_EXPIRES_IN=8h
PORT=3000
```

### `src/frontend/.env`
```env
VITE_API_URL=http://localhost:3000/api
```

O cliente HTTP usa `import.meta.env.VITE_API_URL ?? '/api'`. O `src/frontend/.env.example` menciona um proxy do Vite para `/api`, mas o `vite.config.ts` atual **não define esse proxy**. Por isso a variável `VITE_API_URL` é necessária em desenvolvimento. O CORS está habilitado no back-end (`app.use(cors())`).

> [!WARNING]
> Não faça commit de arquivos `.env` nem coloque senhas reais em documentos. A senha acima é a de desenvolvimento usada neste projeto.

## Sequência para subir tudo do zero

1. Garanta o banco e o usuário no Postgres (item 3) e o `.env` da raiz preenchido.
2. Back-end:
   ```powershell
   cd src/backend
   npm install
   npm run migrate   # Batch 1 run: 5 migrations
   npm run seed      # Seed concluído: 7 usuários, 5 veículos, 3 motoristas.
   npm run dev       # Servidor rodando na porta 3000
   ```
3. Front-end, em outro terminal:
   ```powershell
   cd src/frontend
   npm install
   npm run dev       # http://localhost:5173/
   ```
4. Conferir a API: `http://localhost:3000/api/status` deve responder com `banco_conectado: true`.
5. Entrar em `http://localhost:5173/`.

## Usuários de teste (senha `Senha@123`)

| Perfil | E-mail |
|---|---|
| Administrador | `admin@exemplo.com` |
| Gestor de Frota | `gestor.frota@exemplo.com` |
| Gestor SVO | `gestor.svo@exemplo.com` |
| Solicitante | `solicitante@exemplo.com` |
| Motorista Frota | `motorista.frota@exemplo.com` |
| Motorista SVO | `motorista.svo@exemplo.com` |
| Motorista (CNH vencida) | `motorista.vencido@exemplo.com` |

> [!WARNING]
> O `npm run seed` apaga e recria os dados de `usuarios`, `veiculos` e `motoristas` (e tabelas dependentes). Use só em desenvolvimento.

## Impacto na arquitetura: Docker x Postgres local

Usar um Postgres local **não altera a arquitetura** do projeto. Nada no código ou nos arquivos versionados foi modificado para isso:

| Item | Mudou? |
|---|---|
| Código do back-end (Express, Knex, migrations, seed) | Não |
| `docker-compose.yml`, `knexfile.js`, `env.ts` | Não |
| Estrutura das tabelas (vem das migrations) | Não |
| Postgres local e `.env` da raiz | Sim, mas só na máquina de quem usa (o `.env` não vai para o GitHub) |

O back-end conversa com **um Postgres** definido por host, porta, usuário, senha e banco, todos lidos do `.env`. Ele não distingue um container de uma instalação local. O Docker apenas cria esse usuário e esse banco automaticamente a partir do `.env`. No Postgres local, o mesmo resultado vem dos comandos SQL do item 3, com os **mesmos valores** do projeto (`admin`, `squad_21_password`, `frotas_svo`). As migrations e o seed rodam de forma idêntica nos dois caminhos.

| | Docker (oficial) | Postgres local |
|---|---|---|
| Criar usuário e banco | Automático pelo `.env` | Manual (item 3) |
| Porta | `5433` (publicada pelo compose, padrão do `knexfile.js`) | A do seu Postgres, por exemplo `5432` (definir `POSTGRES_PORT`) |
| Versão do Postgres | 15 (imagem do compose) | A instalada na máquina |
| `migrate` e `seed` | Iguais | Iguais |

> [!WARNING]
> Rodar com Postgres local não valida o ambiente de entrega. Se o projeto for implantado com Docker, vale testar `docker compose up -d` pelo menos uma vez, pois a versão do Postgres e a porta podem diferir.

## Pendências identificadas

- Commitar a correção do `AuthProvider` no `App.tsx` (item 1).
- Remover o arquivo duplicado `src/frontend/src/pages/ViagensPage.tsx` + crase no final do nome, criado por engano no commit `8fdb576`.
- Remover o `src/backend/.env`, que não é usado, ou alinhar o `env.ts` para lê-lo.
- Alinhar o `src/frontend/.env.example` e o `vite.config.ts` quanto ao proxy `/api`.
- Corrigir os erros de TypeScript que impedem o `npm run build` do front: variáveis declaradas e não usadas em `UsuariosPage.tsx` (`tipoUsuarioDoPerfil`, `usuarioAtualizado`, `novoUsuario`) e imports não usados em `storageService.ts` (`NovaViagemInput`, `FinalizarViagemInput`).
- Atualizar o `guia-de-execucao.md`, que ainda afirma que front e back não estão conectados.
