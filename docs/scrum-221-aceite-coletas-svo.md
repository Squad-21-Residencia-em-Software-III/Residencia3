# SCRUM-221 · Aceite das notificações SVO

Os PRs [#212](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/212) e [#214](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/214) já integram a develop. A integração `1ffed6f` incorpora develop `9ba559e` e os contratos de #216, #220 e #221. A rodada histórica em `e5ff85d` teve 44 testes de integração aprovados em PostgreSQL 17 descartável, com transporte Push simulado.

| Evento | O que as suítes das subtarefas exercitam | Resultado |
| --- | --- | --- |
| S3 | Designação individual, retorno do motorista original, acesso atual, fila e rollback | Histórico e nova atribuição confirmados por HTTP. |
| S4 | Reprogramação, concorrência, revogação, idempotência e rollback | Retorno ao mesmo horário e mudança exclusiva de composição confirmados por HTTP. |
| S5 | Público designado, histórico de cancelamento, concorrência e rollback | Casos reexecutados no PostgreSQL após incorporar #214. |
| S6 | Chegada e concorrência, In-App sem Push | PostgreSQL confirmou incremento do sino sem elegibilidade para App Badge. Dispositivo físico pendente. |
| S7 | Um evento no término físico, com finalizações concorrentes e rollback | PostgreSQL confirmou incremento do sino sem elegibilidade para App Badge. Dispositivo físico pendente. |
| S8 | Pedido, decisão, recusa com novo pedido legítimo, rollback e revogação antes da entrega | Concorrência e publicação do pedido remanescente após decisão ou encerramento da primeira ordem confirmadas por HTTP. |

## Cenário transversal

Duas exceções reais, uma administrativa e outra SVO, compartilham o tipo `EXCECAO_ODOMETRO_SOLICITADA` e o mesmo ID numérico de viagem/ordem. A API autenticada confirma a segregação por operação, tipo de referência e destinatário na central e na fila, inclusive para o Administrador. O motivo permanece fora do payload Push.

## Regressão de 26/11/2026

Em `1ffed6f`, Node 24 e PostgreSQL 17 descartável em loopback passaram 64 testes de S3–S8, odômetro e Push com as flags `SCRUM234`, `SCRUM235`, `SCRUM208` e `SCRUM237` habilitadas. Dezesseis ficaram omitidos nessa rodada, dos quais 15 de acesso e revogação passaram em rodada separada com `SCRUM226_POSTGRES_TESTS=1`. A rotina de retenção exclusiva de GitHub Actions permaneceu omitida. O cenário com ID coincidente passou isoladamente na árvore deste commit.

Na mesma integração, 19 testes de sino, ponte do Service Worker e App Badge passaram em jsdom. Os cenários físicos permanecem na homologação da [SCRUM-243](https://squad21.atlassian.net/browse/SCRUM-243).
