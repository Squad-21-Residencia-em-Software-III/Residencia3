# SCRUM-230: avisos das solicitações administrativas (A1 a A4)

Publicados por `services/avisosSolicitacao.ts` na transação de cada operação, com a base da SCRUM-229.

| Evento | Quando | Quem recebe | Push |
|---|---|---|---|
| A1 `SOLICITACAO_CRIADA` | Pedido criado | Gestor de Frota e Administrador, menos quem criou | Não |
| A2 `SOLICITACAO_APROVADA` | Pedido aprovado | Autor do pedido | Sim |
| A3 `SOLICITACAO_RECUSADA` | Pedido recusado | Autor do pedido, com o motivo só no sistema | Sim, neutro |
| A4 `SOLICITACAO_EXPIRADA` | Rotina marca `EXPIRADA` | Autor do pedido | Sim |
| A4 `SOLICITACAO_EXPIRADA` | Rotina marca `EXPIRADA` | Gestor de Frota | Não |

- **Destino:** `/solicitacoes`. **Referência:** `SOLICITACAO_VIAGEM` (SCRUM-226) e o número do pedido. **Categoria:** `SOLICITACOES`.
- **Autor do pedido:** qualquer perfil com a tela de Solicitações (Solicitante, Gestor SVO, Gestor de Frota e Administrador). Quem mudou para um perfil sem a tela, ou foi inativado, não recebe.
- **Privacidade:** o push tem só textos fixos, sem motivo, nome, local, finalidade ou número. O da recusa não revela a decisão.
- **Sem repetição:** cada situação avisa uma vez por pedido. Quem é autor e Gestor de Frota recebe um aviso só.
- **A4 é real:** a expiração já existe (`docs/expiracao-solicitacoes-administrativas.md`). Só é avisado o que a rotina de fato mudou para `EXPIRADA`.

Os títulos e textos, a categoria e o código dos eventos são **proposta**, a conferir com o plano.

## Como ligar

`NOTIFICACOES_ATIVAS=true` na API. O padrão é `false`: nada é publicado nem consultado, e as operações ficam como antes. Ligada, o servidor só inicia se as tabelas das SCRUM-225 e 228 existirem, porque uma falha ao publicar desfaz a operação.

### A4: permissões da rotina de expiração

A rotina usa uma role restrita, sem acesso aos avisos. **Antes** de definir a variável `FSPH_EXPIRACAO_AVISOS_ATIVOS=true` no GitHub, conceder à role (frente de banco):

```sql
GRANT SELECT (solicitante_id) ON solicitacoes_viagem TO <role>;
GRANT SELECT (id, perfil, ativo) ON usuarios TO <role>;
GRANT SELECT (id, usuario_id, chave_idempotencia),
  INSERT (usuario_id, tipo, titulo, mensagem, severidade, operacao, referencia_tipo, referencia_id, url_destino, chave_idempotencia)
  ON notificacoes TO <role>;
GRANT INSERT (notificacao_id, usuario_id, evento_tipo, categoria, operacao, referencia_tipo, referencia_id,
  ocorrencia_versao, chave_idempotencia, payload_push) ON notificacao_outbox TO <role>;
```

Sem as permissões e com a variável ligada, a expiração falha e é desfeita. `provisionar-roles-cron.cjs` não foi alterado aqui: ele revoga e concede tudo de novo, então precisa incluir estas linhas. O PR #205 tem um teste que hoje proíbe qualquer acesso da role de expiração a `notificacoes`, e os dois precisam ser alinhados.

A pendência de push criada pela rotina é enviada pela API, na primeira requisição seguinte (SCRUM-229).

A rotina não tem `JWT_SECRET`. Por isso o interruptor fica em `config/notificacoes.ts`, e não em `config/env.ts`.

## Testes

- `avisosSolicitacao.test.ts`: interruptor, texto do push e independência da rotina.
- `avisosSolicitacaoPostgres.test.ts`: A1 a A4 pela API e pela rotina, com destinatários, negativos, concorrência, desfazimento e a role restrita com as permissões acima. Só roda com `SCRUM230_POSTGRES_TESTS=1`, `POSTGRES_HOST=127.0.0.1` e `POSTGRES_DB=frotas_teste`. Roda no CI.
- Suítes que mexem no banco inteiro (fila e expiração) usam `usarBancoComExclusividade`, para não interferirem umas nas outras.
