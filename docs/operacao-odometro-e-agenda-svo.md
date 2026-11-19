# Implantação do odômetro, da retenção e da agenda SVO

## Odômetro

1. Gabriel revisa a migration `20261119120000_scrum_203_excecoes_odometro.js` e confirma as migrations SCRUM-210 e SCRUM-211. Validar no ambiente de homologação as FKs, os triggers que encerram pedidos inválidos e os privilégios de tabela e sequência. A role da API precisa de SELECT, INSERT e UPDATE em `excecoes_odometro` e acesso à sequência; o provisionamento revoga DELETE. Validar o acesso a `evidencias_odometro_arquivos` com a role da aplicação. A reversão da migration de exceções é bloqueada se existir histórico.
2. No Render de homologação, configurar `EVIDENCIAS_STORAGE=postgres`, `EXCECOES_ODOMETRO_ATIVAS=true`, `FOTOS_ODOMETRO_OBRIGATORIAS=false` e a cota `EVIDENCIAS_POSTGRES_LIMITE_MIB` conforme o orçamento de armazenamento. Com o armazenamento configurado, a inicialização verifica a disponibilidade das tabelas necessárias. A API informa o estado em `GET /api/evidencias-odometro/configuracao`, autenticado.
3. No ambiente de homologação do Vercel, configurar `VITE_FOTOS_ODOMETRO_ATIVAS=true` e gerar o build com o proxy apontando para a API de homologação. O build de revisão da missão tem auto-deploy desligado por branch. Conferir o destino antes de subir uma foto; o rewrite padrão do repositório aponta para a API de produção.
4. Homologar com foto fictícia em Android e iOS, incluindo câmera, galeria, perda de conexão, repetição, download por perfil e quota. Exercitar aprovação, recusa, justificativa, reprogramação, motorista de outra frota e tentativa sem foto, com e sem autorização. Validar saída e chegada administrativas e ordens SVO em deslocamento compartilhado.
5. Ativar `FOTOS_ODOMETRO_OBRIGATORIAS=true` em homologação e repetir as transições. Para produção, revisar banco, permissões, cota e backup. Implantar com fotos opcionais, validar o build e o fluxo de exceção e só então ativar a obrigatoriedade. Para suspender a exigência durante recuperação operacional, alterar a flag para `false` e manter o armazenamento disponível para leitura e conclusão dos deslocamentos.

## Agenda temporal SVO

Gabriel deve confirmar a coluna de lotação e as migrations já integradas de período previsto (`20261116171800`), fila e alertas SCRUM-183 (`20261117172500`), NO_LOCAL (`20261117220000` e `20261118010000`) e equipes/designações SCRUM-198 (`20261118113000`). Conferir o [contrato de agenda](scrum-166-contrato-backend.md) e a [alocação SVO](bl28-alocacao-veiculo-svo.md). O backend não usa uma flag de agenda equivalente.

Em homologação, definir `VITE_AGENDA_SVO_ATIVA=true` no Vercel e gerar novo build contra a API homologada. Verificar fila paginada, agendamento e reprogramação com início e fim previstos, disponibilidade de veículo, motorista, equipe e pessoa, capacidade de corpos e da cabine, confirmação de intervalo menor que 20 minutos, atraso e prioridade, ocupação em **No local** e liberação na conclusão efetiva. Verificar acesso de Administrador, Gestor SVO associado, motorista designado e integrante. Repetir a configuração em produção após aceite. Para reverter a exposição da agenda no cliente, reconstruir com a flag `false` e manter os dados já gravados.

## Retenção do odômetro

A rotina da SCRUM-211 preserva fotos ativas até 12 meses depois da conclusão efetiva. No SVO, usa a conclusão do deslocamento físico compartilhado. Ignora evidências com `preservacao_legal=true`, e trata uploads provisórios com bytes armazenados após 30 minutos. Viagens, ordens, auditoria e metadados são preservados.

1. Antes de executar com exclusão, confirmar backup e testar restauração por SHA-256 em um banco isolado. O responsável pelo banco deve aprovar a role de execução, a política de retenção dos backups e a preservação legal de cada evidência aplicável. Registrar quem autorizou o bloqueio ou a liberação no procedimento de auditoria operacional. Alterar `preservacao_legal` e `preservacao_motivo` com a evidência identificada em transação autorizada. O expurgo revalida a preservação sob lock da mesma linha.
2. Rodar `npm run evidencias:retencao -- --limite=100` em homologação. Sem `--aplicar`, o comando somente conta o lote elegível. Conferir os volumes, executar o modo de aplicação com fotos fictícias e repetir para verificar a idempotência.
3. O [workflow Retenção do odômetro](../.github/workflows/retencao-odometro.yml) roda de hora em hora no minuto 07 UTC, pelo runner padrão gratuito do GitHub Actions. Agendamento e execução manual usam `main`. A variável de repositório `FSPH_RETENCAO_MODO` começa com `desativada`. Depois da validação do banco, usar `simular` e conferir as contagens. Usar `aplicar` somente após backup, revisão de preservação legal e autorização de expurgo. O workflow então executa `npm run evidencias:retencao -- --aplicar --limite=100 --lotes=10`. Gravar `FSPH_CRON_PG_HOST`, `FSPH_CRON_PG_DATABASE`, `FSPH_CRON_PG_USER` e `FSPH_CRON_PG_PASSWORD` em **Settings → Environments → fsph-retencao-neon**, com role exclusiva e branch `main`. A conexão usa TLS validado e no máximo uma conexão.
4. A execução registra apenas contagens por lote no evento `retencao_odometro`. O lock da evidência e o delete de bytes na mesma transação evitam dupla exclusão. Em falha de um item, o banco preserva os bytes e os metadados desse item para novo processamento. O comando sinaliza erro pelo código de saída; habilitar notificações de falha do GitHub Actions e conferir contagens e erros na aba **Actions**. Se todos os lotes atingirem o limite, conferir o atraso acumulado antes de ajustar o volume. [Notificações do Render](https://render.com/docs/notifications)
5. Em caso de incidente, mudar `FSPH_RETENCAO_MODO` para `desativada` para impedir novos ciclos, identificar o lote e a causa pelos horários e logs, simular novamente e rodar o mesmo comando após corrigir a causa. Para recuperar arquivos já removidos, restaurar primeiro em destino isolado, validar os hashes e encaminhar a recuperação pontual com a frente DB. Suspender o cron preserva os próximos arquivos elegíveis, mas exclusões confirmadas exigem restauração.

### Privilégios da role de retenção

Conceder CONNECT no banco escolhido e USAGE no schema da aplicação. A simulação precisa das leituras abaixo. Para a aplicação, conceder adicionalmente UPDATE das quatro colunas indicadas e DELETE apenas da tabela de bytes.

| Tabela | Privilégios |
|---|---|
| `evidencias_odometro` | SELECT de `id`, `status`, `modalidade`, `preservacao_legal`, `criado_em`, `retencao_ate`, `conclusao_operacao_em`, `tipo_operacao`, `viagem_frota_id`, `deslocamento_svo_id`. UPDATE de `status`, `storage_key`, `expurgado_em`, `expurgo_motivo`. |
| `evidencias_odometro_arquivos` | SELECT de `evidencia_id` e DELETE dos bytes elegíveis pelo comando. |
| `viagens_frota` | SELECT de `id`, `status`, `data_hora_efetiva_chegada`. |
| `deslocamentos_svo` | SELECT de `id`, `status`, `data_hora_conclusao`. |
| `deslocamentos_svo_ordens` | SELECT de `deslocamento_svo_id` e `ordem_svo_id`. |
| `ordens_svo` | SELECT de `id` e `status`. |

A CI usa uma role restrita em PostgreSQL descartável para testar simulação e expurgo. As roles de execução e de migration devem ser distintas. Monitorar o consumo no Neon junto do cron de expiração. No Free, o banco pode levar cinco minutos de inatividade para suspender, inclusive após uma consulta que encontre zero registros. [Scale to Zero do Neon](https://neon.com/docs/introduction/scale-to-zero)
