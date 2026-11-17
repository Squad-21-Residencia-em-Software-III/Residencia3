# SCRUM-196: implementação e pendências

Base de desenvolvimento: `develop` no commit `ea08d75`. A integração PostgreSQL e a homologação desta história permanecem pendentes; manter o PR em rascunho até revisar e testar o contrato da SCRUM-198.

## Implementado na branch

- Consulta de disponibilidade, agendamento e reavaliação da fila não exigem escala. `escalas_svo` e seu histórico não são alterados. São preservados os bloqueios existentes de equipe, veículo e motorista; a fila também considera integrantes comuns a equipes diferentes.
- Administrador e Gestor SVO podem listar, criar e renomear equipes. `GET /api/equipes-svo`, `GET /api/equipes-svo/:id`, `POST /api/equipes-svo` e `PATCH /api/equipes-svo/:id` recebem ou retornam `id` e `nome_equipe`. Escritas têm auditoria e trava transacional entre operações da aplicação. A unicidade contra outros clientes depende de índice no banco.
- Perfil individual `INTEGRANTE_SVO` usa autenticação existente. APIs específicas em `/api/equipes-svo/integrantes` criam e listam integrantes sem dar ao Gestor SVO acesso à gestão geral de usuários. As rotas `/:id/integrantes` e `/:id/integrantes/:usuarioId` listam, vinculam e desvinculam; a desvinculação é recusada enquanto houver designação futura pendente. Há auditoria e preservação do histórico de vínculo.
- Agendamento e reprogramação recebem `integrantes_ids`. Equipe é opcional; com equipe exige-se ao menos um integrante elegível e no máximo lotação da cabine menos um. A seleção é nominal. A validação, auditoria e persistência usam a transação e trava global da agenda; alterações são bloqueadas após início real. O conflito individual considera reservas, múltiplas equipes e atraso de coleta em andamento. A confirmação de intervalo reduzido é vinculada aos integrantes selecionados.
- `GET /api/viagens/coletas-svo/minhas` aceita somente paginação e filtra pelo usuário do token e designação ativa, sem conceder acesso pela simples vinculação à equipe. Retorna identificador, status, local de ocorrência, veículo, motorista e horários, sem corpo completo da solicitação. O cadastro atual não fornece destino SVO separado em coluna estruturada; esse campo ainda não é apresentado.
- A interface inclui a aba Equipes SVO, cadastro e vínculo de integrantes, escolha nominal no agendamento e consulta pessoal paginada. O início e a finalização de coleta SVO são restritos ao motorista SVO associado à ordem.

## Dependências e limites

- O contrato proposto está em `docs/scrum-196-contrato-banco.md`. As tabelas `equipes_svo_integrantes` e `ordens_svo_integrantes`, o perfil na constraint de usuários e o índice único de nomes ainda dependem da SCRUM-198. Nenhum DDL ou migration foi criado ou executado aqui. Antes dessa entrega, funcionalidades dependentes dessas estruturas não estão disponíveis e a reavaliação de ordens com equipe pode falhar; não publicar ou integrar isoladamente.
- Os testes unitários e de rotas não substituem execução em PostgreSQL. Permanecem pendentes testes de persistência, rollback, concorrência real, integração de migração, regressão de dados legados e homologação ponta a ponta. O contrato e o comportamento de destinos precisam de revisão na integração.
- A separação entre lotação da cabine e capacidade de corpos é mantida; com lotação ausente, a designação com equipe é bloqueada. Nenhum calendário de escala é criado.
