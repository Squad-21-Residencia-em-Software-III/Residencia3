# SCRUM-219 · Aceite de viagens administrativas

Escopo e critérios no [Jira SCRUM-219](https://squad21.atlassian.net/browse/SCRUM-219). A integração de 26/11/2026 combinou a develop `6cbe676`, a branch [SCRUM-231](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/tree/feature/eventos-administrativos-a5-a8) em `e6c5296` e as dependências SVO e PWA no SHA local `6d0e87e`. O [#210](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/210) já fornece A9/A10 na develop.

| Evento | Resultado esperado | Evidência executada |
| --- | --- | --- |
| A5 | Motorista designado, In-App e Push elegível ao App Badge, destino /viagens | API, central e fila em PostgreSQL confirmaram uma publicação para o condutor. |
| A6 | Motorista e autor autorizado, rotas por perfil, tag viagem-{id}, uma ocorrência por reprogramação efetiva | Reprogramações e destinos exercitados nos testes da SCRUM-231. Reprogramações sucessivas via API e fila em PostgreSQL ficam pendentes. |
| A7 | Mesmo público, canais, tag e rotas de A6, com acesso ligado ao registro | Cancelamento real confirmou os dois destinos, a tag na fila e ausência de notificações repetidas. |
| A8 | Gestor de Frota e autor autorizado, In-App. Início e fim são ocorrências distintas | Início e fim por HTTP produziram dois avisos distintos por destinatário em PostgreSQL, sem outbox. Repetições não geraram novos avisos. |
| A9 | Gestor de Frota e Administrador, /viagens, sem expor o motivo no Push | Teste de PostgreSQL e HTTP na suíte de evidências do odômetro, com pedido concorrente, atomicidade e exclusão do Gestor SVO. |
| A10 | Motorista autorizado, /viagens, justificativa disponível na central autenticada e ausente no Push | A decisão concorrente produz uma notificação e um item de fila. O teste da história confirma a segregação A9/A10 por destinatário e operação. |

A nova cobertura foi executada sobre a develop com a alteração deste PR, em PostgreSQL 17 descartável. Foram 10 testes aprovados e um caso específico do SVO omitido pelo filtro da suíte. A execução integrada das dependências teve 1.994 testes backend aprovados. A execução complementar com SCRUM231_POSTGRES_TESTS=1 usou a integração local 450cb47720539db0c1845712cfe61f3c38696be5. O aceite final depende de integrar a SCRUM-231 e ligar A6 a uma operação administrativa real. Reaproveitar as suítes `avisosViagem`, `eventosViagemAdministrativa`, `publicacaoEventosViagem`, `viagemService` e `evidenciaOdometroPostgres` após a integração da subtarefa.
