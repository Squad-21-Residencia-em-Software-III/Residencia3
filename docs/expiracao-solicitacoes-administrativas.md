# Expiração de solicitações administrativas

Uma solicitação **Aprovada** que continua aguardando agendamento expira quando o relógio do PostgreSQL chega à saída desejada mais 30 minutos. Por exemplo, saída prevista às 10h implica vencimento às 10h30 no mesmo fuso. A data persistida é `timestamptz`; o intervalo é comparado como tempo decorrido.

O status **Expirada** aparece em **Solicitações → Administrativo**, para o gestor e para o solicitante. O painel mostra a contagem e o filtro permite consultar somente as expiradas. A ação de agendamento fica indisponível. Uma tela aberta que tenta agendar após o limite recebe HTTP 409, código `SOLICITACAO_EXPIRADA` e atualiza a lista elegível. A API bloqueia a operação mesmo entre duas execuções do job. A regra abrange somente solicitações administrativas aprovadas sem viagem válida associada. Uma viagem cancelada que reabriu a solicitação segue o prazo original.

## Implantação para revisão de Gabriel Arruda

Revisar a migration `20261119110000_expiracao_solicitacoes_viagem.js` e aplicá-la em homologação pelo procedimento habitual. Ela adiciona o valor à constraint existente e cria índice parcial, preservando registros. Validar `timestamptz`, constraint validada e permissão de SELECT/UPDATE na solicitação, SELECT na viagem e INSERT na auditoria, incluindo a sequência. O rollback da constraint só é possível sem registros expirados. Para interromper novos ciclos, definir `FSPH_EXPIRACAO_ATIVA=false` e manter o histórico.

## GitHub Actions

O workflow [Expiração administrativa](../.github/workflows/expiracao-administrativa.yml) usa o runner padrão gratuito do repositório público. A programação é a cada 15 minutos, nos minutos 07, 22, 37 e 52 em UTC. A [execução agendada](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) depende da versão integrada à branch padrão `main`.

| Onde | Configuração |
|---|---|
| Variável do repositório | `FSPH_EXPIRACAO_ATIVA=false`. Após validação do banco e da versão em `main`, alterar para `true`. |
| Ambiente GitHub Actions | `fsph-expiracao-neon`, restrito à branch `main` |
| Segredos do ambiente | `FSPH_CRON_PG_HOST`, `FSPH_CRON_PG_DATABASE`, `FSPH_CRON_PG_USER`, `FSPH_CRON_PG_PASSWORD` |
| Conexão | Porta 5432, TLS com certificado validado, pool de uma conexão e role exclusiva do cron |

A role precisa de CONNECT no banco, USAGE no schema, SELECT em `solicitacoes_viagem(id, status, data_saida_desejada)` e `viagens_frota(id, solicitacao_id, status)`, UPDATE em `solicitacoes_viagem(status)`, INSERT em `auditorias(usuario_id, acao, modulo)` e USAGE na sequência `auditorias_id_seq`. Usar o endpoint PostgreSQL do ambiente autorizado. A CI valida o comando em PostgreSQL descartável com uma role restrita.

Em um mês de 30 dias, a consulta a cada 15 minutos pode manter o compute ativo por cerca de 240 horas, considerando cinco minutos de inatividade antes de cada suspensão. A 0,25 CU, isso representa aproximadamente 60 CU-horas das 100 CU-horas mensais do Neon Free, antes do tráfego normal. Conferir o consumo efetivo no painel do Neon. [Suspensão automática](https://neon.com/docs/introduction/scale-to-zero) · [Cota Free](https://neon.com/blog/neon-free-plan-1-gb-per-project)

A rotina usa lotes transacionais de até 100, com até 20 lotes por execução. O bloqueio de linha evita agendamento e expiração concorrentes; outra execução ignora linhas travadas. A auditoria registra o identificador da solicitação e a origem automática, com autor nulo. Em caso de atraso, a próxima execução processa os registros vencidos, inclusive antigos. Monitorar o evento `expiracao_solicitacoes_viagem` e falhas na aba **Actions** do GitHub. Após corrigir a causa, usar **Run workflow** na `main` ou aguardar a próxima execução. O job termina com código não zero se a constraint estiver ausente ou a execução falhar.

Validar em homologação com o navegador fechado, conferindo a mudança e a auditoria na abertura seguinte. A frequência proposta pode introduzir até um ciclo de 15 minutos de espera na persistência, além de eventual atraso do GitHub; um agendamento submetido no limite já é recusado.
