# Guia de Execução e Teste

Passo a passo para rodar o banco de dados, a API (back-end) e o front-end na sua máquina.

> [!NOTE]
> Hoje o front-end e o back-end ainda **não estão conectados**. Cada parte roda e é testada separadamente.

## Pré-requisitos
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (versão LTS) e npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e aberto (reinicie o computador após instalar)

## 1. Atualizar o repositório
Na raiz do projeto:

```bash
git fetch origin
git checkout main
git pull origin main
```

Para testar a branch de um PR, troque `main` pelo nome da branch (`git checkout <nome-da-branch>` e `git pull origin <nome-da-branch>`).

## 2. Configurar o arquivo `.env`
O `.env` não vai para o GitHub por segurança, então cada pessoa precisa criar o seu.

Na raiz do projeto, copie o modelo:

```bash
# Windows (PowerShell)
copy .env.example .env

# Linux / macOS
cp .env.example .env
```

Abra o `.env` e preencha com as suas credenciais locais:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=a_sua_senha_aqui
POSTGRES_DB=frotas_svo
```

> [!IMPORTANT]
> Nunca faça commit do `.env`, nem coloque senhas reais em documentos ou no `.env.example`.

## 3. Subir o banco de dados (Docker)
Com o Docker Desktop aberto, na raiz do projeto:

```bash
docker compose up -d
```

O banco sobe **vazio**. As tabelas são criadas pelas migrations (passo 4).

Para conferir as tabelas depois das migrations (use os valores do seu `.env`):

```bash
docker exec -it bd_frotas_svo psql -U <POSTGRES_USER> -d <POSTGRES_DB> -c "\dt"
```

Para parar o banco:

```bash
docker compose down
```

> [!WARNING]
> O banco não tem volume persistente. Se o container for removido (`docker compose down`), os dados são apagados e é preciso rodar `npm run migrate` de novo.

## 4. Rodar o back-end (API)
Em outro terminal:

```bash
cd src/backend
npm install
npm run migrate   # cria/atualiza as tabelas
npm run dev
```

### Migrations (Knex)
O schema do banco é versionado em `src/backend/database/migrations/`, executados em ordem pelo nome. A migration inicial (`..._create_initial_schema.js`) cria todas as tabelas do modelo de dados; cada mudança posterior no schema é uma nova migration. O Knex registra o que já foi aplicado na tabela `knex_migrations`.

| Comando (em `src/backend`) | O que faz |
|---|---|
| `npm run migrate` | Aplica as migrations pendentes |
| `npm run migrate:rollback` | Desfaz o último lote aplicado |
| `npm run migrate:status` | Lista as migrations aplicadas e as pendentes |
| `npm run migrate:make -- nome_da_migration` | Cria um novo arquivo de migration |

> [!IMPORTANT]
> Nunca edite uma migration que já foi aplicada (ou que já está na `main`). Para alterar o schema, crie uma **nova** migration.

A API sobe na porta `3000`.

### Teste
Abra no navegador ou no Postman:

http://localhost:3000/api/status

Resultado esperado (confirma que a API e o banco estão se comunicando):

```json
{
  "status": "API funcionando perfeitamente!",
  "banco_conectado": true,
  "horario_banco": "2026-10-13T..."
}
```

Se aparecer `"banco_conectado": false`, confira se o Docker está rodando (`docker ps`) e se o `.env` está na raiz com os valores corretos.

## 5. Rodar o front-end
Em outro terminal:

```bash
cd src/frontend
npm install
npm run dev
```

O front sobe em http://localhost:5173/.

### Teste
- `/` redireciona para `/dashboard`.
- Clique nos itens da barra lateral e confira a troca de página e do título.
- Recolha e expanda a barra lateral.
- Abra uma rota inexistente (ex.: `/xyz`) e confira a página "Página não encontrada".

Para conferir se o build está íntegro:

```bash
npm run build
```

## Resumo dos comandos

| Parte | Pasta | Comando | Endereço |
|---|---|---|---|
| Banco | raiz | `docker compose up -d` | porta 5432 |
| API | `src/backend` | `npm install`, `npm run migrate` e `npm run dev` | http://localhost:3000/api/status |
| Front | `src/frontend` | `npm install` e `npm run dev` | http://localhost:5173/ |

## Problemas comuns
- **`docker compose` não encontra o `.env`**: o arquivo precisa estar na **raiz** do projeto, não dentro de `src/backend`.
- **Porta 5432 ou 3000 em uso**: pare o serviço que está usando a porta ou ajuste a porta.
- **Erro de autenticação no banco depois de trocar a senha**: recrie o container com `docker compose down` e `docker compose up -d`, pois a senha é definida só na primeira criação.
