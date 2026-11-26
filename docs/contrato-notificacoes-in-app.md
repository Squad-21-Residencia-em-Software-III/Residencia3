# Contrato REST — Central de Notificações In-App

Este documento registra o contrato integrado entre o frontend (`src/frontend/src/services/api/notificacoesApi.ts` e `src/frontend/src/contexts/NotificacoesContext.tsx`) e os endpoints do backend (`SCRUM-226` / PR `#206`) sobre a tabela `notificacoes` (`SCRUM-225`).

## Feature Flags

O frontend mantém duas flags independentes em `src/frontend/src/config/recursosBackend.ts` e `src/frontend/.env.example`:

```env
VITE_NOTIFICACOES_IN_APP_ATIVAS=false
VITE_WEB_PUSH_ATIVO=false
```

- Com `VITE_NOTIFICACOES_IN_APP_ATIVAS=false`, nenhuma chamada `/api/notificacoes/*` é disparada.
- Com `VITE_WEB_PUSH_ATIVO=false`, a faixa contextual de ativação de Web Push (`SCRUM-238`) não é exibida no sino.

---

## Endpoints

Todos os endpoints exigem autenticação (`Bearer` em memória + cookie HttpOnly de refresh, padrão `http.ts`) e retornam exclusivamente registros pertencentes ao `usuario_id` autenticado.

### 1. `GET /api/notificacoes`

Lista paginada da mais recente para a mais antiga (`ORDER BY criado_em DESC, id DESC`).

- **Query params:**
  - `limit` (opcional, 1 a 50, padrão `20`)
  - `cursor` (opcional, cursor composto opaco `data UTC com microssegundos|id` retornado em `proximo_cursor`)
  - `apenas_nao_lidas` (opcional, `true`/`false`)
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
      "referencia_tipo": "VIAGEM_FROTA",
      "referencia_id": 108,
      "url_destino": "/viagens",
      "lida_em": null,
      "criado_em": "2026-11-24T17:00:00.000Z",
      "acesso_revogado": false
    }
  ],
  "proximo_cursor": "2026-11-24T17:00:00.000000Z|42",
  "nao_lidas": 3,
  "versao": "opaque-version-token"
}
```

### 2. `GET /api/notificacoes/contador`

Endpoint leve utilizado pelo polling econômico do sino (a cada `60s` somente quando autenticado, online e com a aba visível, além de revalidação em `window.focus` / `visibilitychange` com debounce de `5s`).

- **Resposta `200 OK`:**

```json
{
  "nao_lidas": 3,
  "versao": "opaque-version-token"
}
```

- Quando `versao` muda em relação à última versão recebida e o dropdown do sino está aberto, o frontend recarrega silenciosamente a primeira página sem gerar requisições extras quando fechado.

### 3. `PATCH /api/notificacoes/:id/lida`

Marca uma notificação específica como lida (idempotente).

- **Resposta `200 OK`:**

```json
{
  "id": 42,
  "lida_em": "2026-11-24T17:05:12.000Z",
  "nao_lidas": 2,
  "versao": "opaque-version-token"
}
```

### 4. `PATCH /api/notificacoes/ler-todas`

A liderança aprovou a ação **Marcar avisos exibidos como lidos** (SCRUM-227). A central envia os IDs exatos dos avisos não lidos exibidos, em lotes de até 1.000. A ação fica desabilitada quando a lista carregada não contém avisos não lidos, mesmo que o contador indique pendências. O campo `nao_lidas` da resposta continua representando todos os avisos não lidos da conta.

```json
{
  "ids": [42, 39]
}
```

- **Resposta `200 OK`:**

```json
{
  "atualizadas": 2,
  "nao_lidas": 0,
  "versao": "opaque-version-token"
}
```

### 5. `PATCH /api/notificacoes/referencia/lida`

Marca como lidas todas as notificações vinculadas à mesma entidade de negócio quando o usuário abre o detalhe do registro diretamente nas telas operacionais.

- **Tipos de referência oficiais (`constants/referenciasNotificacao.ts`):**
  - `SOLICITACAO_VIAGEM` (Administrativo)
  - `VIAGEM_FROTA` (Administrativo)
  - `SOLICITACAO_SVO` (SVO)
  - `ORDEM_SVO` (SVO)
- **Body:**

```json
{
  "referencia_tipo": "VIAGEM_FROTA",
  "referencia_id": 108
}
```

- **Resposta `200 OK`:**

```json
{
  "atualizadas": 1,
  "nao_lidas": 1,
  "versao": "opaque-version-token"
}
```

---

## Regras de Retenção, Segurança e RBAC no Frontend

- **Retenção:** notificações lidas ficam disponíveis por **30 dias após a leitura** e não lidas por **90 dias após a criação**. Confira os limites e o rollout em [SCRUM-242](scrum-242-retencao-notificacoes.md).
- **`acesso_revogado`:** quando `true`, o item é exibido sem link de navegação, permitindo apenas a marcação como lida.
- **Validação de rotas:** `src/frontend/src/utils/destinoNotificacao.ts` valida `url_destino` por **match exato** contra as rotas existentes em `src/frontend/src/routes/index.tsx` e contra `perfilPode`, aplicando o fallback seguro do perfil (`/minhas-coletas`, `/solicitacoes`, `/viagens` ou `/inicio`) para qualquer destino inválido, inexistente ou sem permissão.
