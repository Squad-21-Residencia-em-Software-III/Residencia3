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
- **Autor do pedido:** A2 e A3 se limitam a Solicitante e Gestor SVO que fizeram o pedido. A4 preserva o aviso ao autor com acesso à tela. Usuários inativos são excluídos.
- **Privacidade:** o push tem só textos fixos, sem motivo, nome, local, finalidade ou número. O da recusa não revela a decisão: push neutro **aprovado pela liderança**, com a decisão e o motivo só no sistema, para quem está autenticado e autorizado.
- **Sem repetição:** cada situação avisa uma vez por pedido. Quem é autor e Gestor de Frota recebe um aviso só.
- **A4 é real:** a expiração já existe (`docs/expiracao-solicitacoes-administrativas.md`). Só é avisado o que a rotina de fato mudou para `EXPIRADA`.

Os títulos e textos do sistema, a categoria e o código dos eventos são **proposta**, a conferir com o plano.

## Como ligar

`NOTIFICACOES_ATIVAS=true` na API. O padrão é `false`: nada é publicado nem consultado, e as operações ficam como antes. Ligada, o servidor só inicia se as tabelas das SCRUM-225 e 228 existirem, porque uma falha ao publicar desfaz a operação.

### A4: permissões da rotina de expiração

O script de provisionamento concede à role de expiração leitura das colunas necessárias para selecionar autores e gestores, inserção restrita nas tabelas de avisos e uso das sequências respectivas. O job permanece sem DELETE e sem leitura irrestrita: o DELETE em `notificacoes` fica só com a role de retenção (SCRUM-242), e a validação de privilégio mínimo do provisionamento recusa o contrário. Gabriel deve aplicar o provisionamento após a integração e antes de qualquer autorização para ligar FSPH_EXPIRACAO_AVISOS_ATIVOS.

A pendência de push criada pela rotina é enviada pela API, na primeira requisição seguinte (SCRUM-229).

A rotina não tem `JWT_SECRET`. Por isso o interruptor fica em `config/notificacoes.ts`, e não em `config/env.ts`.

## Testes

- `avisosSolicitacao.test.ts`: interruptor, texto do push e independência da rotina.
- `avisosSolicitacaoPostgres.test.ts`: A1 a A4 pela API e pela rotina, com destinatários, negativos, concorrência, desfazimento e a role restrita com as permissões acima. Só roda com `AVISOS_SOLICITACAO_POSTGRES_TESTS=1`, `POSTGRES_HOST=127.0.0.1` e `POSTGRES_DB=frotas_teste`. Roda no CI.
- Suítes que mexem no banco inteiro (fila e expiração) usam `usarBancoComExclusividade`, para não interferirem umas nas outras.
