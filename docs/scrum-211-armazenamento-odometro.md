# SCRUM-211 | Fotos do odômetro no PostgreSQL do Neon

As fotos de saída e de chegada ficam no mesmo PostgreSQL usado pela API. A decisão prioriza o baixo volume de um projeto acadêmico e dispensa um serviço de arquivos externo. A aplicação usa a conexão `POSTGRES_*` já configurada. [SCRUM-211](https://squad21.atlassian.net/browse/SCRUM-211) · [Contrato do backend](evidencias-odometro.md)

## Como funciona

- O endpoint recebe JPEG, PNG ou WebP de até 10 MiB e 16 milhões de pixels. O servidor aplica a orientação da câmera, remove EXIF e converte para JPEG com até 1.600 pixels no maior lado. A cópia persistida tem limite de 512 KiB. Se ultrapassar o limite após a compactação, o envio recebe 413.
- A migration cria `evidencias_odometro_arquivos`, com uma coluna `bytea` ligada à evidência. Em modo PostgreSQL, os bytes, o tamanho, o SHA-256, o vínculo e a auditoria do envio são gravados na mesma transação. Um reenvio com a mesma chave e o mesmo conteúdo reaproveita o registro.
- Ao confirmar uma evidência, a API confere tamanho e SHA-256 dentro da transação da viagem. A consulta do arquivo passa pelo mesmo proxy autenticado, com as permissões de gestor por operação e respostas sem cache.
- O expurgo remove os bytes e atualiza o estado da evidência na mesma transação. Os registros da viagem, a auditoria e os metadados permanecem disponíveis.

## Configuração

| Variável | Uso |
| --- | --- |
| `EVIDENCIAS_STORAGE=postgres` | Habilita a gravação no banco usado pela API. O padrão continua `desativado` até a liberação do recurso. |
| `EVIDENCIAS_POSTGRES_LIMITE_MIB=128` | Teto de bytes das fotos armazenadas. Faixa de 1 a 512 MiB. A checagem é serializada no banco para cobrir envios simultâneos. |
| `FOTOS_ODOMETRO_OBRIGATORIAS=true` | Exige a evidência nas transições. Ativar após a homologação e a aprovação do fluxo de exceção. |

O limite de 128 MiB cobre o conteúdo das fotos, inclusive as provisórias. O tamanho físico do PostgreSQL, seu histórico, as demais tabelas e a transferência têm limites próprios no Neon. Antes de ativar, confira o plano e o espaço disponível no painel. Quando a cota de fotos é atingida, novos envios são recusados com `EVIDENCIAS_LIMITE_ARMAZENAMENTO`. As fotos existentes continuam disponíveis e seguem a política de retenção. [Planos do Neon](https://neon.com/pricing) · [Tipo binário do PostgreSQL](https://www.postgresql.org/docs/current/datatype-binary.html)

A migration concede leitura, inserção e exclusão apenas dos bytes à role de aplicação, com `POSTGRES_APP_USER` definido no processo de migration. Os metadados permanecem na tabela existente da SCRUM-210. Conferir a presença de chaves do driver local em um inventário antes da troca. Arquivos locais anteriores, se houver, precisam de migração validada separadamente.

## Homologação e ativação

1. Aplicar a migration em um PostgreSQL descartável. Configurar a API de teste com `EVIDENCIAS_STORAGE=postgres` e usar fotos fictícias. Validar envio, retry, autorização, recebimento de erro ao atingir o teto e leitura após reinício.
2. Se usar a Vercel em QA, apontar o rewrite para a API de QA, com `PROXY_SECRET` próprio. O `vercel.json` do repositório encaminha o preview atual para a API de produção. Confirme o destino antes de enviar fotos.
3. Após revisão da equipe de banco, conferir o espaço do Neon do projeto, aplicar a migration e habilitar a variável na API pelo fluxo de implantação do Squad. Confirmar a presença da nova tabela no backup de teste e testar a restauração antes de habilitar a obrigatoriedade.
4. Para reverter uma implantação, preservar a migration e os arquivos armazenados. A reversão da migration é bloqueada enquanto houver fotos na tabela. Manter um leitor compatível até a recuperação ou a migração dos dados.

O ensaio local aplicou as 25 migrations em um PostgreSQL descartável. A suíte passou com 1.390 testes, incluindo as rotas de evidência, a cota sob concorrência, o expurgo e os rollbacks transacionais. Uma foto foi recuperada com o mesmo SHA-256 depois de reiniciar a API com a role restrita. A migration recusou rollback enquanto havia fotos. O teste de restauração do backup e a ativação no Neon do projeto seguem o fluxo de homologação.

## Retenção e backups

O prazo de 12 meses começa na conclusão real da viagem administrativa ou do deslocamento físico SVO. A rotina pula fotos com preservação legal e deslocamentos SVO ainda em andamento. Reservas de upload não confirmadas podem ser limpas após 30 minutos.

Após compilar o backend, `npm run evidencias:retencao` simula um lote de 25 itens. Na janela de manutenção aprovada, `npm run evidencias:retencao -- --aplicar` executa a limpeza e o expurgo. É possível usar `--limite=50`, com máximo de 100 por lote. Esse comando usa o banco já configurado e sai com erro se houver falhas no lote.

As fotos passam a integrar os backups completos do PostgreSQL. A retenção aprovada também precisa contemplar as cópias recuperáveis. Testar a restauração com fotos fictícias e comparar o SHA-256 no ambiente isolado. A exclusão libera a cota lógica de fotos. O espaço físico e as cópias históricas seguem o ciclo de manutenção e recuperação do PostgreSQL e do Neon.
