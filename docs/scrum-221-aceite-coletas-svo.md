# SCRUM-221 · Aceite das notificações SVO

Os PRs [#212](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/212) e [#214](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/214) mantêm as implementações. Em 26/11/2026 foram testados localmente os HEADs `155be17` e `65548af` combinados em `6d0e87e`. A suíte backend teve 1.994 testes aprovados e 48 omitidos por configuração. O transporte Web Push nas suítes automatizadas é simulado.

| Evento | O que as suítes das subtarefas exercitam | Pendência de aceite |
| --- | --- | --- |
| S3 | Designação individual, exclusão do autor, acesso atual, fila e rollback | Retorno de motorista antes substituído ainda usa identidade derivada do horário e veículo no #214. |
| S4 | Reprogramação, concorrência, revogação, idempotência e rollback | Retorno a horário anterior e mudança exclusiva de composição para quem permanece precisam da correção do #214. |
| S5 | Público designado, histórico de cancelamento, concorrência e rollback | Reexecutar após integrar a correção de S3/S4. |
| S6 | Chegada e concorrência, In-App sem Push | Validar sino e App Badge em navegador após correção do #216. |
| S7 | Um evento no término físico, com finalizações concorrentes e rollback | Confirmar independência do App Badge na integração PWA. |
| S8 | Pedido, decisão, recusa com novo pedido legítimo, rollback e revogação antes da entrega | A deduplicação do #212 mudou. Confirmar o caso específico de pedidos concorrentes em ordens do mesmo deslocamento e fase, além de nova revisão de QA. |

## Cenário transversal

Duas exceções reais, uma administrativa e outra SVO, compartilham o tipo `EXCECAO_ODOMETRO_SOLICITADA`. O teste usa a API autenticada e confirma que a central e a fila conservam referências e destinatários separados, inclusive para o Administrador. O motivo permanece fora do payload Push.

Executar `evidenciaOdometroPostgres.test.ts` em banco descartável com `SCRUM208_POSTGRES_TESTS=1` e `SCRUM235_POSTGRES_TESTS=1` após incorporar #212. Na develop anterior a #212 o cenário fica omitido. Os arquivos `avisosSvoS3S5Postgres.test.ts` e `avisosSvoS6S8Postgres.test.ts` cobrem as demais situações com as flags definidas no CI das dependências.

A ordem prevista é #212, #214 e então o aceite da [SCRUM-221](https://squad21.atlassian.net/browse/SCRUM-221), conforme a revisão independente.
