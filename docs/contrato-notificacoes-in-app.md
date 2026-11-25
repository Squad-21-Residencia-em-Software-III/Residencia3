# Contrato REST — Central de Notificações In-App

Este documento registra o contrato esperado pelo frontend (`src/frontend/src/services/api/notificacoesApi.ts` e `src/frontend/src/contexts/NotificacoesContext.tsx`) para integração com os endpoints do backend (`SCRUM-226`) e a tabela `notificacoes` (`SCRUM-225`).

## Feature Flag

Enquanto o backend não estiver homologado no ambiente, o frontend mantém a integração desativada por padrão via variável de ambiente:

```env
VITE_NOTIFICACOES_IN_APP_ATIVAS=false
```

Controlada em `src/frontend/src/config/recursosBackend.ts` (`RECURSOS_BACKEND.notificacoesInApp`). Com a flag desligada, nenhuma chamada `/api/notificacoes/*` é disparada.

---

## Endpoints

Todos os endpoints exigem autenticação (`Bearer` em memória + cookie HttpOnly de refresh, padrão `http.ts`) e retornam exclusivamente registros pertencentes ao `usuario_id` autenticado.

### 1. `GET /api/notificacoes`

Lista paginada da mais recente para a mais antiga (`ORDER BY criado_em DESC, id DESC`).

- **Query params:**
  - `limit` (opcional, padrão `20`, máximo recomendado `50`)
  - `cursor` (opcional, cursor composto opaco retornado em `proximo_cursor`)
  - `apenas_nao_lidas` (opcional, `true`)
- **Resposta `200 OK`:**

```json
{
  "itens": [
    {
      "id": 42,
      "tipo": "VIAGEM_AGENDADA",
      "titulo": "Viagem #108 agendada",
      "mensagem": "Veículo QKN-4A12 alocado para saída às 14:00.",
      "severidade": "info",
      "operacao": "Administrativo",
      "referencia_tipo": "VIAGEM",
      "referencia_id": 108,
      "url_destino": "/viagens",
      "lida_em": null,
      "criado_em": "2026-11-24T17:00:00.000Z"
    }
  ],
  "proximo_cursor": "2026-11-24T17:00:00.000Z|42",
  "nao_lidas": 3
}
```

### 2. `GET /api/notificacoes/contador`

Endpoint leve utilizado pelo polling econômico do sino (a cada `60s` somente quando autenticado, online e com a aba visível, além de revalidação em `window.focus` / `visibilitychange` com debounce de `5s`).

- **Resposta `200 OK`:**

```json
{
  "nao_lidas": 3
}
```

### 3. `PATCH /api/notificacoes/:id/lida`

Marca uma notificação específica como lida (idempotente).

- **Resposta `200 OK`:**

```json
{
  "id": 42,
  "lida_em": "2026-11-24T17:05:12.000Z",
  "nao_lidas": 2
}
```

### 4. `PATCH /api/notificacoes/ler-todas`

Marca todas as notificações não lidas do usuário autenticado como lidas.

- **Resposta `200 OK`:**

```json
{
  "atualizadas": 2,
  "nao_lidas": 0
}
```

### 5. `PATCH /api/notificacoes/referencia/lida`

Marca como lidas todas as notificações vinculadas à mesma entidade de negócio quando o usuário já abriu o registro diretamente.

- **Body:**

```json
{
  "referencia_tipo": "VIAGEM",
  "referencia_id": 108
}
```

- **Resposta `200 OK`:**

```json
{
  "atualizadas": 1,
  "nao_lidas": 1
}
```

---

## Regras de Segurança e RBAC no Frontend

- `url_destino` deve ser sempre uma rota interna começando com `/` (sem `//`, `\`, espaços ou caracteres de controle), alinhada à constraint da tabela `notificacoes` (`SCRUM-225`).
- Antes de navegar, `src/frontend/src/utils/destinoNotificacao.ts` valida a rota contra `perfilPode` (`src/frontend/src/utils/permissoes.ts`). Caso a URL seja inválida ou pertença a uma tela sem permissão para o perfil atual (por exemplo, `INTEGRANTE_SVO` recebendo `/viagens`), o frontend redireciona com segurança para a rota padrão do perfil (`/minhas-coletas`, `/solicitacoes`, `/viagens` ou `/inicio`).
