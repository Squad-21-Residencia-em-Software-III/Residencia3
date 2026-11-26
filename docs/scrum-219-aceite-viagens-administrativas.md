# SCRUM-219 · Aceite de viagens administrativas

Escopo e critérios no [Jira SCRUM-219](https://squad21.atlassian.net/browse/SCRUM-219). A integração de 26/11/2026 combinou a develop `6cbe676`, a branch [SCRUM-231](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/tree/feature/eventos-administrativos-a5-a8) em `e6c5296` e as dependências SVO e PWA no SHA local `6d0e87e`. O [#210](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/210) já fornece A9/A10 na develop.

| Evento | Resultado esperado | Evidência executada |
| --- | --- | --- |
| A5 | Motorista designado, In-App e Push elegível ao App Badge, destino /viagens | Montagem, serviço e publicação em testes automatizados da SCRUM-231. Operação → central → fila em PostgreSQL fica pendente. |
| A6 | Motorista e autor autorizado, rotas por perfil, tag viagem-{id}, uma ocorrência por reprogramação efetiva | Reprogramações e destinos exercitados nos testes da SCRUM-231. Reprogramações sucessivas via API e fila em PostgreSQL ficam pendentes. |
| A7 | Mesmo público, canais, tag e rotas de A6, com acesso ligado ao registro | Montagem e serviço foram exercitados nos testes da SCRUM-231. Revogação e fila via operação real ficam pendentes. |
| A8 | Gestor de Frota e autor autorizado, In-App. Início e fim são ocorrências distintas | Montagem para os dois estados, destinos e ausência de Push verificados na SCRUM-231. Falta validar contadores e deduplicação de retry ponta a ponta. |
| A9 | Gestor de Frota e Administrador, /viagens, sem expor o motivo no Push | Teste de PostgreSQL e HTTP na suíte de evidências do odômetro, com pedido concorrente, atomicidade e exclusão do Gestor SVO. |
| A10 | Motorista autorizado, /viagens, justificativa disponível na central autenticada e ausente no Push | A decisão concorrente produz uma notificação e um item de fila. O teste da história confirma a segregação A9/A10 por destinatário e operação. |

A nova cobertura foi executada sobre a develop com a alteração deste PR, em PostgreSQL 17 descartável. Foram 10 testes aprovados e um caso específico do SVO omitido pelo filtro da suíte. A execução integrada das dependências teve 1.994 testes backend aprovados. A homologação A5–A8 depende da SCRUM-231. Reaproveitar as suítes `avisosViagem`, `eventosViagemAdministrativa`, `publicacaoEventosViagem`, `viagemService` e `evidenciaOdometroPostgres` após a integração da subtarefa.
