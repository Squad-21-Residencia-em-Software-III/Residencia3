# Expiração de solicitações administrativas

Uma solicitação **Aprovada** que continua aguardando agendamento expira quando o relógio do PostgreSQL chega à saída desejada mais 30 minutos. Por exemplo, saída prevista às 10h implica vencimento às 10h30 no mesmo fuso. A data persistida é `timestamptz`; o intervalo é comparado como tempo decorrido.

O status **Expirada** aparece em **Solicitações → Administrativo**, para o gestor e para o solicitante. O painel mostra a contagem e o filtro permite consultar somente as expiradas. A ação de agendamento fica indisponível. Uma tela aberta que tenta agendar após o limite recebe HTTP 409, código `SOLICITACAO_EXPIRADA` e atualiza a lista elegível. A API bloqueia a operação mesmo entre duas execuções do job. A regra abrange somente solicitações administrativas aprovadas sem viagem válida associada. Uma viagem cancelada que reabriu a solicitação segue o prazo original.

## Implantação para revisão de Gabriel Arruda

Revisar a migration `20261119110000_expiracao_solicitacoes_viagem.js` e aplicá-la em homologação pelo procedimento habitual. Ela adiciona o valor à constraint existente e cria índice parcial, preservando registros. Validar `timestamptz`, constraint validada e permissão de SELECT/UPDATE na solicitação, SELECT na viagem e INSERT na auditoria, incluindo a sequência. O rollback da constraint só é possível sem registros expirados. Para interromper o processamento, suspender o cron e manter o histórico.

Após revisão do banco e implantação autorizada do backend e frontend, criar um [Render Cron Job](https://render.com/docs/cronjobs) independente com estas configurações.

| Campo | Valor |
|---|---|
| Fonte | Revisão homologada que contém o comando |
| Root Directory | `src/backend` |
| Build Command | `npm ci --include=dev && npm run build` |
| Command | `npm run solicitacoes:expirar` |
| Schedule (UTC) | `* * * * *` |
| Variáveis | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_SSL=true`, `POSTGRES_APP_USER`, `POSTGRES_APP_PASSWORD`, `POSTGRES_POOL_MIN=0`, `POSTGRES_POOL_MAX=2`, `DB_ROLE=app` |

A rotina usa lotes transacionais de até 100, com até 20 lotes por execução. O bloqueio de linha evita agendamento e expiração concorrentes; outra execução ignora linhas travadas. A auditoria registra o identificador da solicitação e a origem automática, com autor nulo. Em caso de atraso, a próxima execução processa os registros vencidos, inclusive antigos. Monitorar o evento `expiracao_solicitacoes_viagem` e falhas na aba **Runs** do Render. Após corrigir a causa de uma falha, reexecutar o mesmo comando. O job termina com código não zero se a constraint estiver ausente ou a execução falhar.

Validar em homologação com o navegador fechado, conferindo a mudança e a auditoria na abertura seguinte. A frequência proposta pode introduzir cerca de um minuto de atraso na persistência em condições normais; um agendamento submetido no limite já é recusado.
