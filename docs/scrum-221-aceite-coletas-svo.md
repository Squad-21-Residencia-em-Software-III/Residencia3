# SCRUM-221 · Aceite das notificações SVO

Os PRs [#212](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/212) e [#214](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/214) mantêm as implementações. Em 26/11/2026 foram testados os HEADs `2cdb212` e `be1e941` combinados com o aceite SVO em `e5ff85d`, em PostgreSQL 17 local descartável. As três suítes de integração somaram 44 testes aprovados. O caso administrativo exclusivo da SCRUM-231 foi omitido nesta execução. O transporte Web Push nas suítes automatizadas é simulado.

| Evento | O que as suítes das subtarefas exercitam | Pendência de aceite |
| --- | --- | --- |
| S3 | Designação individual, retorno do motorista original, acesso atual, fila e rollback | Histórico e nova atribuição confirmados por HTTP. |
| S4 | Reprogramação, concorrência, revogação, idempotência e rollback | Retorno ao mesmo horário e mudança exclusiva de composição confirmados por HTTP. |
| S5 | Público designado, histórico de cancelamento, concorrência e rollback | Casos reexecutados no PostgreSQL após incorporar #214. |
| S6 | Chegada e concorrência, In-App sem Push | Validar sino e App Badge em navegador após correção do #216. |
| S7 | Um evento no término físico, com finalizações concorrentes e rollback | Confirmar independência do App Badge na integração PWA. |
| S8 | Pedido, decisão, recusa com novo pedido legítimo, rollback e revogação antes da entrega | Concorrência e publicação do pedido remanescente após decisão ou encerramento da primeira ordem confirmadas por HTTP. |

## Cenário transversal

Duas exceções reais, uma administrativa e outra SVO, compartilham o tipo `EXCECAO_ODOMETRO_SOLICITADA`. O teste usa a API autenticada e confirma que a central e a fila conservam referências e destinatários separados, inclusive para o Administrador. O motivo permanece fora do payload Push.

Executar `evidenciaOdometroPostgres.test.ts` em banco descartável com `SCRUM208_POSTGRES_TESTS=1` e `SCRUM235_POSTGRES_TESTS=1` após incorporar #212. Na develop anterior a #212 o cenário fica omitido. Os arquivos `avisosSvoS3S5Postgres.test.ts` e `avisosSvoS6S8Postgres.test.ts` cobrem as demais situações com as flags definidas no CI das dependências.

A ordem prevista é #212, #214 e então o aceite da [SCRUM-221](https://squad21.atlassian.net/browse/SCRUM-221), conforme a revisão independente.
