# SCRUM-263 · Solicitações externas do SVO

O portal usa a fila operacional existente. Solicitações internas exigem um registrante válido e têm protocolo nulo. Solicitações externas têm registrante nulo, protocolo público opaco e único, dados protegidos e credencial de acompanhamento em relações 1:1. A gravação dos três registros ocorre na mesma transação. O portal permanece desativado por padrão.

## Endereço e fila

- `solicitacoes_svo.local_ocorrencia` (VARCHAR(255)) é a fonte do endereço operacional, com entrada manual disponível. Fila, ordens de coleta e `VIAGENS_UNIFICADAS_SQL` leem esse campo. A correção autorizada durante a triagem atualiza o endereço e seus complementos na mesma transação e invalida o roteiro que depender da localização anterior (SCRUM-268/274).
- Número ou indicação de imóvel sem número, complemento, referência, par opcional de coordenadas e indicador de cobertura permanecem separados. Use `dados_solicitante` para o rótulo operacional “Solicitação externa”. Identidade, dados clínicos, texto do registro e credenciais ficam nas tabelas protegidas.
- O DTO operacional tem projeção explícita. O DTO público da SCRUM-266 deve definir sua própria lista de estados e a mensagem pública pertinente. O protocolo identifica um registro, e a autenticação exige o segredo correspondente. A justificativa pública permanece separada do motivo interno. O pedido externo de cancelamento depende de decisão autorizada e a emissão de protocolo mantém a solicitação para triagem.
- A SCRUM-264 publica S1 na mesma transação/outbox com `registranteId: null`. As notificações públicas ou operacionais devem permanecer neutras, sem endereço, CPF ou dados clínicos, mantendo a exclusão do S2.

## Credencial e tentativa de criação

O banco exige chave de idempotência única, digest do payload e digest da credencial, mantém o vínculo e o protocolo imutáveis e bloqueia reativação de credencial revogada. A primeira versão é 1. A role da aplicação pode registrar a revogação e o último acesso. Rotação de credencial exigirá contrato explícito da SCRUM-266.

A única expiração pública é `solicitacoes_svo_dados_externos.consulta_publica_expira_em`, calculada a partir do encerramento operacional registrado uma vez, em UTC. Durante operação aberta, a coluna permanece nula. O serviço da SCRUM-266 valida o estado operacional real, o digest em tempo constante, a revogação e a janela de consulta a cada acesso. O serviço que encerra uma operação verifica o encerramento efetivo, inclusive a situação física de ordem ou deslocamento, antes de registrar a data. O banco rejeita encerramento em solicitação ativa, em data anterior à criação ou em data futura.

A correção remove o armazenamento do envelope. A SCRUM-264 precisa vincular o retry da criação ao mesmo payload e à prova autenticada da tentativa original antes de devolver qualquer resposta com credencial. A prova deve ser imprevisível e independente da chave de idempotência. Se a retomada de resposta após commit exigir envelope, o serviço precisa de criptografia autenticada, chave separada, expiração curta e descarte, com uma migration revisada que exija o digest da prova. A recuperação de credencial perdida segue pendente de decisão institucional. O serviço deve rejeitar consulta somente pelo protocolo e recuperação somente pela chave de idempotência.

## Privacidade e retenção

A SCRUM-295 é responsável por inventário, simulação, autorização e execução auditada com role segregada. O prazo de 12 meses após o encerramento segue condicionado à aprovação institucional. Antes de processar um registro, revalidar encerramento efetivo, prazo, integridade, retenção legal e qualquer reabertura ou vínculo ativo. A role de atendimento não grava legal hold, prazo de retenção, marcadores de tratamento ou auditoria de expurgo.

| Área | Tratamento após retenção autorizada |
| --- | --- |
| Identidade, contato e saúde | Remover nome, CPF, telefone, e-mail, documento e nome do falecido, instituição identificável, informações clínicas, descrição e data/hora exata da ocorrência. |
| Localização e textos livres | Descaracterizar `local_ocorrencia`, remover número, complemento, referência e coordenadas. Limpar observações, motivo interno, recusa pública, razões e justificativas do cancelamento e texto livre relacionável. Inventariar cópias em ordens, evidências, rotas, serviços de mapas, logs, notificações, caches, exportações e backups. Aplicar às cópias a política da categoria correspondente ou a preservação legal documentada. |
| Acompanhamento | Remover a credencial protegida, seus digests e a chave de idempotência ao consolidar o tratamento. O prazo de consulta pública encerra em até 30 dias, independentemente do tratamento posterior. |
| Histórico mínimo | Preservar chaves relacionais, canal, estado operacional, ordens, vínculos indispensáveis, odômetro e auditoria segregada. O protocolo pode continuar como identificador opaco indisponível publicamente. A auditoria do tratamento registra evento, responsável, horário e motivo categorizado, sem transportar os dados tratados. |

Constraint e triggers exigem descaracterização conjunta dos campos cobertos por esta migration e bloqueiam registro de tratamento antes da data elegível ou sob preservação legal. O mecanismo de execução e a verificação das cópias e vínculos dependentes pertencem à SCRUM-295.

## Migrations e verificação

- `20261127130000_scrum_263_solicitacoes_externas_svo.js` registra o histórico original e o backfill para `INTERNA`. `20261127140000_scrum_263_integridade_svo_externo.js` valida o catálogo e consolida endereço, credencial e privilégios. Em banco que já recebeu a primeira migration, a segunda bloqueia divergências de endereço, registros incompletos e dados que exigiriam reconciliação antes da remoção de campos.
- Provisione a role da aplicação e configure `POSTGRES_APP_USER` antes da execução compartilhada. A migration exige role de login distinta e sem concessões administrativas ou memberships. A role recebe INSERT e UPDATE por coluna e SELECT nas duas tabelas, com verificação de ACL efetiva e remoção de permissões herdadas de PUBLIC ou defaults nas tabelas protegidas. `SOLICITACOES_EXTERNAS_SVO_DB_DESCARTAVEL=1` admite ausência da role somente em loopback isolado. O validador completo continua exigindo as duas roles.
- `npm run db:validar-solicitacoes-externas-svo` roda as migrations Knex reais em dois bancos descartáveis criados no PostgreSQL local e preserva a validação histórica complementar em schemas temporários. Inclui `npm run migrate:status`, `npm run migrate` e novo status em banco vazio e upgrade de banco populado. Em caso de dados externos, ambas as migrations bloqueiam rollback. O caminho de recuperação é roll-forward com o portal desabilitado.
