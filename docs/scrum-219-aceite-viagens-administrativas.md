# SCRUM-219 · Aceite de viagens administrativas

Escopo e critérios no [Jira SCRUM-219](https://squad21.atlassian.net/browse/SCRUM-219). Em 26/11/2026, a integração `4806daa` combinou a develop `6cbe676` e a [SCRUM-231](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/218) em `ed6ae84`. O [#210](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/210) fornece A9/A10 na develop.

| Evento | Resultado esperado | Evidência executada |
| --- | --- | --- |
| A5 | Motorista designado, In-App e Push elegível ao App Badge, destino /viagens | API, central e fila em PostgreSQL confirmaram uma publicação para o condutor. |
| A6 | Motorista e autor autorizado, rotas por perfil, tag viagem-{id}, uma ocorrência por reprogramação efetiva | O montador tem testes unitários. A operação administrativa e os testes HTTP de reprogramações sucessivas ainda estão pendentes. |
| A7 | Mesmo público, canais, tag e rotas de A6, com acesso ligado ao registro | Cancelamento real confirmou os dois destinos, a tag na fila e ausência de notificações repetidas. |
| A8 | Gestor de Frota e autor autorizado, In-App. Início e fim são ocorrências distintas | Início e fim por HTTP produziram dois avisos distintos por destinatário em PostgreSQL, sem outbox. Repetições não geraram novos avisos. |
| A9 | Gestor de Frota e Administrador, /viagens, sem expor o motivo no Push | Teste de PostgreSQL e HTTP na suíte de evidências do odômetro, com pedido concorrente, atomicidade e exclusão do Gestor SVO. |
| A10 | Motorista autorizado, /viagens, justificativa disponível na central autenticada e ausente no Push | A decisão concorrente produz uma notificação e um item de fila. O teste da história confirma a segregação A9/A10 por destinatário e operação. |

`evidenciaOdometroPostgres.test.ts` passou em PostgreSQL 17 descartável com `SCRUM208_POSTGRES_TESTS=1` e `SCRUM231_POSTGRES_TESTS=1`. Foram 11 testes aprovados e um caso transversal SVO omitido pelo recorte desta execução. A CI desta branch habilita `SCRUM231_POSTGRES_TESTS`. Para implementar A6, confirmar se a aprovação original permanece válida após a alteração do período e se é necessário preservar as datas solicitadas separadamente das datas reprogramadas.
