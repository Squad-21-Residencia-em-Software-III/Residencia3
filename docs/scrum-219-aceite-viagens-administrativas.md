# SCRUM-219 · Aceite de viagens administrativas

Escopo e critérios no [Jira SCRUM-219](https://squad21.atlassian.net/browse/SCRUM-219). A integração `a70865d` contém develop `9ba559e` e a [SCRUM-231](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/218) em `f1804f4`. O [#210](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/210) fornece A9/A10.

| Evento | Resultado esperado | Evidência executada |
| --- | --- | --- |
| A5 | Motorista designado, In-App e Push elegível ao App Badge, destino /viagens | API, central e fila em PostgreSQL confirmaram uma publicação para o condutor. |
| A6 | Motorista e solicitante ativos e autorizados, rotas por perfil, tag viagem-{id}, uma ocorrência por alteração efetiva | Oito casos HTTP/PostgreSQL do #218 cobrem autorização por unidade, datas solicitadas e planejadas, preservação da aprovação, ocorrências distintas, concorrência, retries e rollback. |
| A7 | Mesmo público, canais, tag e rotas de A6, com acesso ligado ao registro | Cancelamento real confirmou os dois destinos, a tag na fila e ausência de notificações repetidas. |
| A8 | Gestor de Frota e solicitante autorizado, In-App. Início e fim são ocorrências distintas | A API publicou dois avisos por destinatário. O contador interno subiu dois, o total elegível para App Badge permaneceu estável e a outbox ficou vazia para A8. Repetições não geraram novos avisos. |
| A9 | Gestor de Frota e Administrador, /viagens, sem expor o motivo no Push | Teste de PostgreSQL e HTTP na suíte de evidências do odômetro, com pedido concorrente, atomicidade e exclusão do Gestor SVO. |
| A10 | Motorista autorizado, /viagens, justificativa disponível na central autenticada e ausente no Push | A decisão concorrente produz uma notificação e um item de fila. O teste da história confirma a segregação A9/A10 por destinatário e operação. |

Em 26/11/2026, Node 24, Vitest e PostgreSQL 17 descartável em loopback, com `SCRUM208_POSTGRES_TESTS=1`, `SCRUM231_POSTGRES_TESTS=1` e `SCRUM235_POSTGRES_TESTS=1`, executaram seis suítes na integração `a70865d`: 131 passaram, incluindo A6 e S8. Na árvore deste commit, a suíte de odômetro foi reexecutada após acrescentar a verificação do sino e do App Badge para A8: 11 passaram. A rotina de retenção que exige GitHub Actions foi omitida nas duas rodadas. O Push físico segue pendente.
