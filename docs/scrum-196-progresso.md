# SCRUM-196: implementação e pendências

O PR #162 foi integrado à `develop`. O histórico abaixo registra as revisões da implementação.

## Implementado na develop

- Consulta de disponibilidade, agendamento e reavaliação da fila não exigem escala. `escalas_svo` e seu histórico não são alterados. São preservados os bloqueios existentes de equipe, veículo e motorista; a fila também considera integrantes comuns a equipes diferentes.
- Administrador e Gestor SVO podem listar, criar e renomear equipes. `GET /api/equipes-svo`, `GET /api/equipes-svo/:id`, `POST /api/equipes-svo` e `PATCH /api/equipes-svo/:id` recebem ou retornam `id` e `nome_equipe`. Escritas têm auditoria e trava transacional entre operações da aplicação. A migration da SCRUM-198 define o índice único para o nome normalizado.
- Perfil individual `INTEGRANTE_SVO` usa autenticação existente. APIs específicas em `/api/equipes-svo/integrantes` criam e listam integrantes sem dar ao Gestor SVO acesso à gestão geral de usuários. As rotas `/:id/integrantes` e `/:id/integrantes/:usuarioId` listam, vinculam e desvinculam; a desvinculação é recusada enquanto houver designação futura pendente. Há auditoria e preservação do histórico de vínculo.
- Agendamento e reprogramação recebem `integrantes_ids`. Equipe é opcional; com equipe exige-se ao menos um integrante elegível e no máximo lotação da cabine menos um. A seleção é nominal. A validação, auditoria e persistência usam a transação e trava global da agenda; alterações são bloqueadas após início real. O conflito individual considera reservas, múltiplas equipes e atraso de coleta em andamento. A confirmação de intervalo reduzido é vinculada aos integrantes selecionados.
- `GET /api/viagens/coletas-svo/minhas` aceita somente paginação e filtra pelo usuário do token e designação ativa, sem conceder acesso pela simples vinculação à equipe. Retorna identificador, status, local de ocorrência, veículo, motorista e horários, sem corpo completo da solicitação. O cadastro atual não fornece destino SVO separado em coluna estruturada; esse campo ainda não é apresentado.
- A interface inclui a aba Equipes SVO, cadastro e vínculo de integrantes, escolha nominal no agendamento e consulta pessoal paginada. O início e a finalização de coleta SVO são restritos ao motorista SVO associado à ordem.

## Dependências e limites

- **Migration integrada ao código.** A develop contém a migration `20261118113000_scrum_198_equipes_integrantes_designacoes_svo.js` pelo PR #169. A mesma develop inclui fila e alertas (#157), chegada e ocupação em NO_LOCAL (#164), apresentação operacional (#167), segurança do proxy (#168) e evidências do odômetro (#170–#172).
- **Contrato analisado.** A implementação foi comparada com as tabelas, colunas, constraints, índices e relacionamentos definidos na migration, incluindo o perfil INTEGRANTE_SVO, a unicidade dos nomes e as tabelas de vínculos e designações. Consulte o [contrato da SCRUM-196](scrum-196-contrato-banco.md).
- **Aplicação da migration no ambiente compartilhado:** não verificada nesta revisão. Isso inclui o Neon.
- **Validação e homologação.** Os cenários de concorrência, persistência e designações foram executados no ambiente isolado descrito em [Validação da SCRUM-198](validacao-banco-scrum-198.md). A homologação funcional e visual no ambiente da equipe continua a cargo do QA.
- A separação entre lotação da cabine e capacidade de corpos é mantida; com lotação ausente, a designação com equipe é bloqueada. Nenhum calendário de escala é criado.

## Histórico da primeira revisão de QA do PR #162

- O reagendamento consulta `GET /api/viagens/ordens-svo/:id/designacoes` para restaurar somente designações ativas; a consulta é restrita a Administrador e Gestor SVO. Falha na consulta impede o envio. Mudança de equipe limpa a seleção, e nova lotação é validada.
- `GET /api/equipes-svo/:id/integrantes/disponibilidade?inicio=...&fim=...&ignorar_ordem_id=...` distingue membros elegíveis de membros ocupados. A validação transacional continua obrigatória ao salvar; coleta em deslocamento sem conclusão real ocupa o integrante.
- `PATCH /api/equipes-svo/integrantes/:id` aceita somente nome e e-mail para contas do perfil INTEGRANTE_SVO; audita a operação e rejeita campos extras. A senha segue o mecanismo de contas existente.
- Na primeira revisão, os fixtures de agenda PostgreSQL foram adaptados à proposta de contrato disponível na época e à finalização pelo motorista. A homologação com o esquema integrado consta nas pendências acima.
- A consulta pessoal continua sem destino: o schema documentado não oferece destino SVO estruturado; não se deve expor `dados_solicitante` como substituto. Confirmação do destino depende da definição de produto/modelo.

## Histórico da segunda revisão do PR #162

- A consulta de designações lê equipe, início e participantes ativos em uma única instrução. Rotas testadas com autenticação e perfis distintos, incluindo gestor sem vínculo com a unidade SVO.
- O reagendamento preserva participantes em mudanças de horário e restaura os IDs persistidos ao retornar à equipe original. Para outra equipe, exige seleção nova. Cabine insuficiente e falha de leitura impedem o envio sem apagar a escolha. Participantes que perderam o vínculo são mostrados para regularização explícita.
- No cenário de finalização simultânea, cada requisição usa o motorista da ordem. Antes da corrida, um motorista diferente é rejeitado e a ordem continua em deslocamento. A corrida deve produzir duas conclusões e uma única liberação.
- A suíte opt-in cobre também conflito do mesmo integrante entre equipes, desvinculação com designação pendente, bloqueio de revogação após início, histórico pessoal após conclusão/desvinculação, rollback por falha induzida no final da transação e conclusão de uma ordem legada sem designações. Rodar somente em PostgreSQL isolado e autorizado com SCRUM-198 aplicada. A falha induzida é na auditoria final e o rollback será verificado nos registros reais de ordem e designações.
- Validação local: backend com 1.236 testes aprovados e 19 ignorados, frontend com 296 aprovados. Typecheck e builds aprovados.
- Edge em prévia local do build, com respostas HTTP fictícias: Administração e Gestão SVO abriram Equipes SVO e reagendaram com o participante existente. O gestor cadastrou, editou, vinculou e desvinculou um integrante. Testados foco inicial, Tab/Shift+Tab, Escape e retorno ao acionador na confirmação. Motorista teve a ação de início na tela de viagens, sem reagendamento. Integrante visualizou Minhas coletas em 390 px de largura, sem ações operacionais. Bloqueios de URL verificados para motorista e integrante. A autorização do servidor foi exercitada separadamente com Supertest.

## Histórico da terceira revisão e do estado NO_LOCAL

- A agenda, a seleção de equipes, a disponibilidade individual e a fila reconhecem `NO_LOCAL` como ativo. O indicador de disponibilidade e a validação ao salvar compartilham a mesma consulta de conflito por pessoa, inclusive entre equipes. Designações ativas seguem ocupadas enquanto a ordem estiver em curso e não tiver conclusão real, mesmo depois da previsão.
- Minhas coletas mostra a mesma ordem como “No local” na consulta seguinte e mantém a tela somente leitura. A tela operacional reconhece “No local” como andamento e permite finalizar dentro das permissões existentes. A transição de chegada permanece na BL31 (#164).
- A fila mantém reservas que disputam recursos bloqueadas enquanto houver coleta em curso. Na conclusão, só libera a reserva elegível, sem iniciar a próxima coleta.
- A suíte opt-in de PostgreSQL ganhou casos de cabine e revogação pré-início, além do cenário BL31 que usa o endpoint real de chegada, nega a ação ao integrante, consulta a situação pessoal antes e depois da transição, verifica conflito entre equipes e confirma liberação após a conclusão. A execução depende das estruturas da SCRUM-198, das dependências #157/#164 e de ambiente isolado autorizado.
- Destino pessoal segue pendente de definição na SCRUM-196. No dicionário e no schema, `solicitacoes_svo.local_ocorrencia` é a origem, embora a listagem operacional de Viagens a projete sob o alias genérico `destino`. Não existe campo separado aprovado para destino SVO. `dados_solicitante` e `observacoes` não integram o DTO pessoal. Produto precisa definir qual dado de destino pode ser registrado e mostrado ao integrante.
- Validação local desta revisão: backend com 1.242 testes aprovados e 21 ignorados, sendo 17 de agenda PostgreSQL. Frontend com 299 testes aprovados. Typecheck e builds aprovados. Os testes de fila, agenda, conclusão e interface usam dados de teste e não comprovam persistência nem concorrência em PostgreSQL.

## Histórico da revisão de fronteira com a SCRUM-110

- O PR #167 concentra a apresentação operacional de `NO_LOCAL` em Viagens, no drawer e na agenda. O #162 mantém `viagens.executarSvo`, as regras de ocupação no backend e a apresentação da consulta pessoal. A integração manteve uma única declaração dessa permissão e os rótulos, filtros e estilos operacionais do #167.
- Minhas coletas usa `PageHeader` e `Badge`. A lista usa `inicio_previsto DESC NULLS LAST, id DESC` e seu menu e rota são exclusivos de `INTEGRANTE_SVO`. O agendamento usa o `Checkbox` compartilhado e orienta o cadastro da lotação quando a equipe está selecionada e o veículo ainda não tem esse dado.
- `/api/equipes-svo` exige associação à unidade SVO para o gestor, inclusive em consultas, criação de equipes e contas e vinculação. A consulta de designações foi movida para o serviço. Criação e edição de equipes usam o módulo existente `USUARIOS` na auditoria.
- Validação local desta revisão: 1.244 testes de backend aprovados, 21 ignorados e 304 testes de frontend aprovados. Typecheck do backend e builds de ambos passaram.

## Integração com develop

- O reagendamento usa a composição efetiva para validar agenda e cabine. Mantém as designações quando a equipe é a mesma e a lista é omitida. Trocas explícitas passam pela validação de vínculo ativo e preservam o histórico.
- Validação local da integração com 251 testes selecionados de backend e 168 de frontend. Typecheck do backend e builds dos dois módulos aprovados. O build do frontend também inclui a verificação TypeScript.
- A CI do commit 7532f0a aprovou os jobs de frontend e backend. O log, consultado novamente nesta revisão, registra as suítes de agenda SVO, BL31 e evidências de odômetro como ignoradas. [Execução da CI](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/actions/runs/44466216100)

## Ajustes finais de QA

- O aviso de intervalo reduzido usa o rótulo “Integrante” com a identificação retornada pela API. O teste existente do modal verifica os quatro tipos de recurso e o reenvio do token após a confirmação.
- A validação local aprovou os 19 testes de ModalAgendarColetaSvo.test.tsx e o build do frontend com verificação TypeScript.
