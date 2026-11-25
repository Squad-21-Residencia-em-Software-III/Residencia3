# SCRUM-226: API de notificações In-App

Rotas em `/api/notificacoes`, sobre a tabela `notificacoes` (SCRUM-225). Seguem o contrato do front da SCRUM-227. Todas exigem sessão e valem para todos os perfis: cada usuário acessa **só os próprios avisos**. O usuário vem sempre da sessão, e qualquer id de usuário enviado pelo cliente é ignorado.

| Método e rota | Entrada | Resposta `200` |
|---|---|---|
| `GET /` | `limit` (1 a 50, padrão 20), `cursor`, `apenas_nao_lidas` (`true`/`false`) | `{ itens, proximo_cursor, nao_lidas }` |
| `GET /contador` | — | `{ nao_lidas, versao }` |
| `PATCH /:id/lida` | — | `{ id, lida_em, nao_lidas }` |
| `PATCH /ler-todas` | `ate_id` (opcional) | `{ atualizadas, nao_lidas }` |
| `PATCH /referencia/lida` | `referencia_tipo`, `referencia_id` | `{ atualizadas, nao_lidas }` |

Os nomes `nao_lidas` e `proximo_cursor` correspondem a `unreadCount` e `nextCursor` da tarefa, no padrão de nomes da API.

## Regras

- **Operação por perfil:** além do dono, vale a operação do aviso, conferida a cada chamada. Administrador: as duas. Solicitante, Gestor de Frota e Motorista da frota: Administrativo. Gestor SVO: Administrativo e, se associado à unidade SVO, SVO. Motorista SVO e Integrante SVO: SVO. Assim, quem muda de perfil deixa de ver os avisos da operação anterior.
- **Destino:** abrir o aviso não concede acesso. A rota do registro confere a permissão de novo.
- **Cursor:** `data UTC com microssegundos|id`. É opaco para o front e não repete nem pula itens, mesmo com datas iguais ou avisos novos entre as páginas. Cursor inválido responde `400`.
- **Leitura:** repetir é seguro e mantém a data da primeira leitura. Aviso inexistente ou de outra pessoa responde `404`, sem diferença entre os dois.
- **`nao_lidas`:** sempre contado no banco depois da alteração, por isso não fica negativo e inclui o que chegou no meio.
- **`versao`:** texto opaco que muda quando chega ou se lê um aviso, mesmo com o total igual. O front pode usar para decidir se recarrega a lista.
- **`ate_id`:** id mais novo que o usuário viu. Sem ele, `ler-todas` marca também os avisos que chegaram depois da última consulta da tela. **Recomendado para o front.**
- **Cache:** as respostas levam `Cache-Control: no-store`.

## Testes

- `notificacaoRoutes.test.ts`: sessão, perfis, validações e contrato.
- `notificacaoPostgres.test.ts`: acesso cruzado, paginação, idempotência e concorrência em PostgreSQL descartável. Só roda com `SCRUM226_POSTGRES_TESTS=1`, `POSTGRES_HOST=127.0.0.1` e `POSTGRES_DB=frotas_teste`, depois de `npm run migrate`. Roda no CI.

## Atenção

O limite de leitura é de 300 consultas por minuto **por IP**. O sino consulta uma vez por minuto em cada aba visível, então muitos usuários atrás do mesmo IP somam no mesmo limite. Ajustar `RATE_LIMIT_LEITURA_POR_MIN` se necessário (ver `limites-e-timeouts.md`).
