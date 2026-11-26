# SCRUM-231: reprogramação administrativa (A6)

`PATCH /api/viagens/administrativas/:id/reprogramar`, sessão autenticada. Corpo: `tipo_operacao: "ADMINISTRATIVA"`, `inicio_previsto` e `fim_previsto` ISO 8601 com fuso, `versao_programacao` da leitura, `chave_idempotencia` UUID. O retorno é a viagem atualizada. O retry de um comando aceito devolve o estado atual sem reaplicar. Uma nova alteração usa a versão atual e outra chave. Sem alteração efetiva, não incrementa a versão nem publica. Chave reutilizada com dados diferentes e versão desatualizada retornam 409. Unidade alheia ou perfil indevido: 403. Viagem inexistente: 404. Intervalo inválido: 400. Conflito de agenda: 409.

Administrador pode reprogramar inclusive registros legados sem unidade. Gestor de Frota precisa de associação à unidade da solicitação. A6 muda exclusivamente o período de viagem administrativa agendada, sem saída ou chegada efetiva. Mantém os recursos designados, aprovação, solicitação original, evidências e exceções. A validação de período compartilha os locks de recursos da criação. A auditoria registra antes/depois; o identificador da auditoria identifica a ocorrência. O histórico de comandos impede reaplicação tardia. O mesmo período pode ser escolhido novamente após mudança intermediária.

A5 agendamento, A6 reprogramação, A7 cancelamento: In-App e Web Push elegível ao App Badge, conforme destinatários e preferências do contrato existente. A8 início/fim: somente In-App. A6 usa motorista e solicitante ativos, exclui o autor e conteúdo sensível. Publicação e atualização ocorrem na mesma transação. O desligamento da flag impede publicação. O serviço SVO integrado não é substituído por uma versão anterior.

## Banco e rollout

Migration aditiva 20261126180000: datas planejadas anuláveis, versão inicial zero e histórico de comandos. Nenhum backfill inventado: a leitura legada usa o período solicitado, com fallback de chegada para meia-noite em Brasília. Novos agendamentos persistem o período efetivo da reserva. Solicitações e horários reais não são sobrescritos. A role da aplicação só pode ler e inserir no histórico. Não executar em produção como parte do executor de QA.

Aplicar migration antes do backend novo; não habilitar reprogramação enquanto instâncias antigas do backend ainda recebem gravações, pois elas não consultam o período planejado. Após uso, não remover colunas/histórico: a migration down recusa perda de dados. Recuperação por roll-forward compatível, preservando o histórico; rollback de schema apenas em banco descartável antes de qualquer gravação no contrato novo.

Testes locais devem comprovar upgrade com fixtures, schema novo, privilégios, HTTP real, concorrência, rollback e regressões. Homologação física Push, publicação, CI e aprovação de QA são evidências separadas; não são declaradas por este documento.
