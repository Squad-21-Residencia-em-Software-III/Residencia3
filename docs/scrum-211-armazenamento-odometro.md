# SCRUM-211 | Armazenamento das fotos do odômetro

O driver Cloudflare R2 integra as fotos das viagens administrativas e dos deslocamentos SVO à API existente. Upload, autorização, download e metadados continuam nas rotas e tabelas já integradas à `develop`. O R2 precisa ser provisionado e homologado para ser ativado. [SCRUM-211](https://squad21.atlassian.net/browse/SCRUM-211) · [Contrato do backend](evidencias-odometro.md)

## Decisão de armazenamento

O sistema de arquivos padrão do Render é efêmero. Um disco persistente no Render limita o serviço a uma instância e impede deploys sem interrupção. O Neon continua responsável pelos metadados e vínculos. A Vercel encaminha `/api` ao Render e o navegador recebe as imagens pelo proxy autenticado. [Discos do Render](https://render.com/docs/disks) · [Rewrites da Vercel](https://vercel.com/docs/routing/rewrites#rewrites-to-external-origins)

| Opção | Custo de referência | Segurança e operação |
| --- | --- | --- |
| **R2 Standard** | 10 GB-mês, 1 milhão de operações classe A e 10 milhões classe B incluídos. Excedentes de US$ 0,015/GB-mês, US$ 4,50/milhão A e US$ 0,36/milhão B. Saída de dados do R2 sem tarifa. | Bucket privado por padrão, durabilidade projetada de onze noves, criptografia e PUT condicional atômico. A localização sugerida não garante residência no Brasil. [Preços](https://developers.cloudflare.com/r2/pricing/) · [Consistência](https://developers.cloudflare.com/r2/reference/consistency/) · [Localização](https://developers.cloudflare.com/r2/reference/data-location/) |
| **AWS S3 Standard** | US$ 0,023/GB-mês como referência na Virgínia, mais operações e transferência conforme tabela regional. | IAM e Block Public Access, retenção e versões administráveis, opção de região São Paulo. O descarte precisa alcançar as versões e réplicas aplicáveis. [Preços](https://aws.amazon.com/s3/pricing/) · [Escrita condicional](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html) |
| **Backblaze B2** | 10 GB gratuitos, US$ 6,95/TB-mês e saída incluída até 3× o armazenamento médio mensal. | Bucket privado por escopo e versões. A integração teria de comprovar a escrita sem sobrescrita e o descarte das versões. [Preços](https://www.backblaze.com/cloud-storage/pricing) · [Versões](https://www.backblaze.com/apidocs/b2-list-file-versions) |
| **Neon Object Storage** | 5 GB incluídos no plano gratuito anunciado. | S3 vinculado a branches e disponibilidade regional variável. Avaliar como clonagem e restauração afetam as cópias privadas e o expurgo. [Preços](https://neon.com/pricing) · [Regiões](https://neon.com/docs/introduction/regions#product-availability) |

Como referência, 1.000 deslocamentos físicos por mês com duas fotos de 2 MB geram aproximadamente 48 GB em 12 meses. No R2 Standard, o armazenamento primário custaria cerca de US$ 0,57/mês após a franquia, antes de operações excedentes, cópias e tráfego de outros serviços. Confirmar com a FSPH a jurisdição, a política de cópias e a cobrança institucional antes de provisionar. Se houver exigência de residência no Brasil, avaliar S3 São Paulo antes da ativação. [Localização e jurisdição do R2](https://developers.cloudflare.com/r2/reference/data-location/)

## Configuração no backend

| Variável | Uso |
| --- | --- |
| `EVIDENCIAS_STORAGE` | `r2` para habilitar o bucket. O padrão é `desativado`. |
| `EVIDENCIAS_R2_AMBIENTE` | `qa` ou `producao` com `NODE_ENV=production`. `teste` e `desenvolvimento` ficam restritos aos respectivos ambientes. |
| `EVIDENCIAS_R2_BUCKET` | Bucket privado exclusivo, com sufixo `-<ambiente>`. |
| `EVIDENCIAS_R2_ACCOUNT_ID` e `EVIDENCIAS_R2_JURISDICAO` | Formam o endpoint HTTPS da Cloudflare. Jurisdição vazia, `eu` ou `us`. |
| `EVIDENCIAS_R2_ACCESS_KEY_ID`, `EVIDENCIAS_R2_SECRET_ACCESS_KEY` e `EVIDENCIAS_R2_SESSION_TOKEN` | Credenciais de objeto no servidor. O token de sessão é opcional e deve acompanhar credenciais temporárias. |
| `EVIDENCIAS_R2_CHAVE_SECRETA` | Segredo estável de 32 bytes aleatórios em hexadecimal, distinto por ambiente. O HMAC associa o UUID de retry ao autor sem gravar o identificador do autor na chave. Manter estável durante a rotação das credenciais S3. |
| `EVIDENCIAS_R2_TIMEOUT_MS` | 4.000 ms por padrão para a operação do SDK, de 250 a 8.000. O PUT e a leitura após conflito compartilham o mesmo prazo. |
| `FOTOS_ODOMETRO_OBRIGATORIAS` | Ativar somente após a homologação da integração e aprovação do fluxo de exceção. |

1. Com aprovação institucional, criar um bucket Standard exclusivo de QA. Manter `r2.dev`, domínios públicos e CORS de bucket desativados. Usar outro bucket, outras credenciais e outro segredo de HMAC em produção. Manter os segredos no Render e fora de `VITE_*`, do repositório e dos logs.
2. Provisionar credenciais efetivas de API limitadas a `PutObject` e `GetObject` no prefixo `odometro/v1/`. Usar uma credencial separada para `DeleteObject` na rotina de retenção. Para R2, ações individuais podem ser limitadas com credenciais temporárias assinadas localmente. O deploy deve fornecer credenciais válidas e renová-las antes de expirar. Objetos com chaves legadas precisam de plano de migração e leitura aprovado antes da troca de driver. [Credenciais privadas](https://developers.cloudflare.com/r2/api/tokens/) · [Ações e prefixos](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/)
3. Após `npm ci` e `npm run build`, testar o caminho Vercel → Render com imagens sintéticas de até 10 MiB incluindo o multipart. Verificar a resposta em dispositivos móveis, memória da instância, concorrência limitada por rota e latência p95 de PUT/GET. O limite de payload de Vercel Functions tem escopo próprio e não substitui o teste do rewrite externo. [Limites de Functions](https://vercel.com/docs/functions/limitations)
4. Confirmar GET anônimo negado no R2, negação para credenciais de outro ambiente e para DELETE com a credencial da API. Enviar uma imagem, reiniciar o Render de QA e comparar os bytes recuperados com o SHA-256 registrado. Cobrir falha de rede após PUT, retry, download com ACL do aplicativo, preservação formal e SVO compartilhado. A API mantém a viagem no estado anterior quando a confirmação da foto falha.

## Retenção e recuperação

`npm run evidencias:retencao` simula a rotina e mostra contagens, com 25 candidatos por padrão. `npm run evidencias:retencao -- --limite=50 --aplicar` executa o lote após homologação e autorização. Usar um processo separado com credenciais do ambiente alvo e capturar o código de saída e as contagens para alertar sobre falhas e acúmulo.

- A reserva `STAGING` é válida por 30 minutos. A rotina concede mais cinco minutos antes de remover os bytes de uma reserva abandonada e marcar sua linha como `REJEITADA`.
- O expurgo de fotos confirmadas usa `retencao_ate` da operação efetivamente concluída. No SVO, a consulta exige o deslocamento concluído e todas as ordens associadas em status terminal. A preservação legal impede qualquer remoção da rotina. A trava da evidência serializa o expurgo com alterações de preservação e confirmação.
- A rotina altera o estado e envia DELETE dentro da transação por evidência. Uma falha remota deixa a linha elegível para reprocessamento. Um retorno perdido após DELETE pode significar que o objeto já foi removido. Pausar a rotina para registrar pedidos formais de preservação durante um incidente e reconciliar operações pendentes com os registros do bucket.
- O expurgo mantém a viagem, a auditoria e os metadados da evidência. Excluir por idade de objeto no bucket violaria a regra de conclusão efetiva. A rotina é restrita às chaves opacas criadas para R2. Objetos sem registro após restauração ou migração devem passar por inventário e reconciliação assistida antes de qualquer remoção.
- Aprovar RPO e RTO das fotos separadamente do PostgreSQL. Usar manifestos de referências e SHA-256 para validar a recuperação em isolamento. Cópias recuperáveis devem obedecer à mesma política de descarte e preservação aprovada. Para reverter, pausar expurgo e novos uploads, preservar o bucket e os vínculos e manter a leitura disponível enquanto se reconcilia a versão anterior. Confirmar que o deploy de reversão entende o driver R2 antes de redirecionar tráfego.
