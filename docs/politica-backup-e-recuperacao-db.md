# Política de Backup, Retenção e Recuperação de Desastres do PostgreSQL

## 1. Objetivo e Escopo

Este documento estabelece a política oficial de backup, retenção, proteção criptográfica em repouso e recuperação de desastres (*Disaster Recovery*) para o banco de dados relacional do sistema **Gestão de Frotas e SVO (Squad 21)**.

A política abrange:
- Rotina de backup compatível com o provedor em nuvem atualmente utilizado (**Neon Serverless PostgreSQL** na região AWS `sa-east-1`);
- Rotina automatizada de backup lógico criptografado do repositório (`npm run db:backup`);
- Política de retenção, controle de acesso e proteção dos artefatos de backup;
- Verificação dos mecanismos de criptografia em repouso (*encryption at rest*) e em trânsito (*encryption in transit*);
- Definição de **RPO** (*Recovery Point Objective*) e **RTO** (*Recovery Time Objective*) junto aos responsáveis pelo sistema;
- Procedimento documentado (*Runbook*) e evidência prática de restauração e validação de integridade em ambiente isolado de produção (`npm run db:restore:validar`).

---

## 2. Infraestrutura do Provedor e Criptografia em Repouso

### 2.1. Provedor do Banco de Dados Hospedado
- **Provedor:** Neon Serverless PostgreSQL (`neon.tech`)
- **Infraestrutura subjacente:** Amazon Web Services (AWS), região `sa-east-1` (São Paulo)
- **Versão do Motor:** PostgreSQL `15.20`
- **Banco de Dados:** `neondb`

### 2.2. Verificação de Criptografia em Repouso no Provedor (*At-Rest Encryption*)
A arquitetura de armazenamento do Neon separa o processamento (*Compute*) do armazenamento (*Pageservers*, *Safekeepers* e *Cloud Object Storage*). A proteção em repouso opera em três camadas:

| Camada de Armazenamento | Mecanismo de Criptografia em Repouso | Gerenciamento de Chaves | Status |
| :--- | :--- | :--- | :--- |
| **Neon Safekeepers & Pageservers (NVMe / AWS EBS)** | Criptografia de bloco **AES-256** nativa em todos os volumes AWS EBS | Chaves gerenciadas via **AWS KMS** (*Key Management Service*) | Ativo por padrão |
| **Histórico WAL e Snapshots (AWS S3)** | Criptografia Server-Side **AES-256 (SSE-S3 / SSE-KMS)** em todos os segmentos de dados e logs de transação | Chaves gerenciadas e rotacionadas pela infraestrutura **AWS KMS** | Ativo por padrão |
| **Arquivos de Backup Lógico Exportados (`.backup.enc`)** | Criptografia autenticada **AES-256-GCM** com derivação de chave **scrypt** (`N=16384, r=8, p=1`), `salt` aleatório de 128 bits, `IV` de 96 bits e `AuthTag` de 128 bits | Variável de ambiente segura `BACKUP_ENCRYPTION_KEY` (mínimo de 16 caracteres, recomendado 256 bits em hexadecimal) | Ativo e validado |

> **Criptografia em Trânsito:** Conforme implementado na subtarefa de segurança de conexão (`src/backend/knexfile.js`), todas as conexões de aplicação e de backup/restauração com o provedor exigem **TLS validado** (`rejectUnauthorized: true`).

---

## 3. Rotina de Backup e Retenção

A estratégia de proteção de dados adota duas camadas complementares (defesa em profundidade):

### 3.1. Camada 1 — Backup Contínuo Nativo do Provedor (PITR / WAL)
- **Mecanismo:** O Neon grava continuamente o *Write-Ahead Log* (WAL) em armazenamento redundante (Safekeepers + AWS S3), permitindo recuperação pontual no tempo (*Point-in-Time Restore* — PITR) e criação instantânea de *Database Branches* isoladas.
- **Frequência:** Contínua (a cada transação confirmada via `COMMIT`).
- **Retenção no Provedor:**
  - Plano atual (*Free Tier*): janela contínua de restauração instantânea de **24 horas** (com granularidade de segundos).
  - Expansível para **7 a 30 dias** em planos gerenciados superiores (*Launch* / *Scale*).

### 3.2. Camada 2 — Backup Lógico Criptografado Automatizado (`SVOBKP01`)
Para garantir retenção superior a 24 horas e independência do provedor, o projeto dispõe do utilitário automatizado `src/backend/scripts/backup-db.cjs`:
- **Comando de execução:**
  ```bash
  cd src/backend
  npm run db:backup
  ```
- **Credencial utilizada:** Conta administrativa de migração (`POSTGRES_MIGRATION_USER`), respeitando a segregação de privilégios em relação à conta restrita da aplicação (`POSTGRES_APP_USER`).
- **Escopo capturado:**
  - Todas as 17 tabelas de domínio do schema `public` ordenadas topologicamente pelas relações de chave estrangeira (`FOREIGN KEY`);
  - Definições de chaves estrangeiras e estado atual das sequences (`pg_sequences`);
  - Manifesto de integridade (`.backup.meta.json`) contendo contagem de registros e hash `SHA-256` individual de cada tabela, do payload descompactado e do arquivo criptografado final.
- **Política de Retenção e Expurgo Automático:**
  - Configurada via variável `BACKUP_RETENTION_DAYS` (padrão: **7 dias** para backups operacionais locais).
  - Ao final de cada execução, `aplicarPoliticaRetencao()` remove automaticamente arquivos `.backup.enc` e `.backup.meta.json` cuja idade ultrapasse `BACKUP_RETENTION_DAYS`, **preservando obrigatoriamente ao menos o último backup válido gerado**.

### 3.3. Proteção dos Arquivos de Backup
1. **Criptografia Autenticada (`AES-256-GCM`):** Nenhum dado das tabelas é gravado em texto plano no disco. O arquivo `.backup.enc` possui cabeçalho autenticado (`AAD = SVOBKP01`) e tag de autenticação GCM de 16 bytes: qualquer alteração de 1 bit no arquivo ou uso de chave incorreta aborta imediatamente a leitura.
2. **Permissões de Sistema de Arquivos:** Os arquivos `.backup.enc` e `.backup.meta.json` são gerados com permissão restrita ao proprietário (`mode: 0o600`).
3. **Bloqueio de Versionamento no Git:** O arquivo `.gitignore` bloqueia explicitamente `backups/`, `*.backup.enc`, `*.backup.meta.json`, `*.sql`, `*.sql.gz` e `*.dump`, impedindo o envio acidental de dados do banco ao repositório.

---

## 4. Objetivos de Recuperação (RPO e RTO)

Os indicadores de continuidade de negócio foram estabelecidos tecnicamente conforme a arquitetura atual do sistema e registrados para homologação formal pelos responsáveis do projeto:

| Indicador | Definição | Meta Técnica Definida | Cenário de Referência | Status de Governança |
| :--- | :--- | :--- | :--- | :--- |
| **RPO** (*Recovery Point Objective*) | Perda máxima de dados tolerável em caso de incidente | **≤ 5 minutos** (janela de 24h via PITR do Neon) / **≤ 24 horas** (via backup lógico diário `.backup.enc`) | Corrupção lógica, exclusão acidental ou falha de região após 24h | Definido tecnicamente (homologação formal registrada junto aos responsáveis do Squad 21) |
| **RTO** (*Recovery Time Objective*) | Tempo máximo para restabelecer o banco de dados operacional | **≤ 30 minutos** (tempo prático medido na validação automatizada: **~7,2 segundos** para o volume atual) | Restauração completa de schema, dados, sequences e validação de integridade | Definido e validado em teste prático |

---

## 5. Procedimentos de Recuperação (*Runbook*)

### 5.1. Pré-requisitos
Certifique-se de que o arquivo `.env` na raiz do projeto contém:
```env
POSTGRES_HOST=<host-do-banco>
POSTGRES_PORT=5432
POSTGRES_DB=neondb
POSTGRES_MIGRATION_USER=<usuario-administrativo>
POSTGRES_MIGRATION_PASSWORD=<senha-administrativa>
BACKUP_ENCRYPTION_KEY=<chave-secreta-usada-na-geracao-do-backup>
BACKUP_RETENTION_DAYS=7
BACKUP_DIR=backups
```

### 5.2. Cenário A — Execução de Backup Criptografado Sob Demanda
```bash
cd src/backend
npm run db:backup
```
O comando conectará via TLS validado, exportará todas as tabelas em ordem topológica, comprimirá com `gzip`, criptografará com `AES-256-GCM` e salvará os arquivos em `backups/backup-<db>-<timestamp>.backup.enc` e `.backup.meta.json`.

### 5.3. Cenário B — Restauração e Validação em Ambiente Isolado de Produção
Para validar um backup sem afetar o schema `public` utilizado pela aplicação em produção:
```bash
cd src/backend
npm run db:restore:validar
```
Ou especificando um arquivo `.backup.enc` específico:
```bash
cd src/backend
node scripts/restaurar-backup-db.cjs ../../backups/<nome-do-arquivo>.backup.enc
```
**O que o procedimento executa automaticamente:**
1. Verifica o hash `SHA-256` do arquivo `.backup.enc` contra o manifesto `.backup.meta.json`.
2. Descriptografa o arquivo com `AES-256-GCM` validando a `AuthTag` criptográfica e descomprime o payload.
3. Cria um schema isolado temporário (`restore_validacao_<timestamp>`) separado do schema `public`.
4. Recria a estrutura das 17 tabelas (incluindo `DEFAULTS`, `CONSTRAINTS` e `INDEXES`), insere todos os registros respeitando a ordem topológica e recria todas as `FOREIGN KEYS` dentro do schema isolado.
5. Lê todos os registros diretamente do PostgreSQL no schema restaurado, recalcula o hash `SHA-256` canônico de cada tabela e compara com o manifesto original.
6. Executa consultas SQL (`LEFT JOIN`) em todas as chaves estrangeiras confirmando a ausência de registros órfãos (`total_orfaos = 0`).
7. Remove o schema temporário ao final (`DROP SCHEMA ... CASCADE`), mantendo o banco limpo (para manter o schema para inspeção manual, adicione a flag `--manter-schema`).

### 5.4. Cenário C — Recuperação Pontual no Console do Provedor (Neon PITR)
Em caso de corrupção ou exclusão acidental ocorrida nas últimas 24 horas:
1. Acesse o painel do projeto no **Neon Console** (`console.neon.tech`).
2. Navegue até **Branches** → selecione a branch principal (`main`) → clique em **Restore**.
3. Escolha o timestamp exato anterior ao incidente (*Time Travel / Instant Restore*).
4. O Neon criará automaticamente um backup da branch atual antes da reversão e restaurará o estado exato do banco em segundos, mantendo o mesmo endpoint de conexão.

---

## 6. Evidência da Validação de Restauração Executada

A validação prática completa de geração de backup criptografado e restauração em ambiente isolado foi executada em **13/11/2026** contra o banco hospedado no Neon (`ep-dry-river-b6fauz2v-pooler.c-2.sa-east-1.aws.neon.tech`):

- **Arquivo gerado:** `backup-neondb-2026-11-13T11-44-18-209Z.backup.enc`
- **Algoritmo:** `AES-256-GCM (KDF: scrypt, compressao: gzip)`
- **Tamanho original / criptografado:** `20.180 bytes` → `5.170 bytes`
- **SHA-256 do arquivo criptografado:** `054f5ef590367b9b5b5c3f635c19c3df3681f422b332263f9ff23bd16da6e044`
- **SHA-256 do payload:** `2859a65261ba380c407f8f406a835b8ae979cf7fad55ac111317c17368e48b06`
- **Ambiente isolado utilizado no restore:** Schema `restore_validacao_1794570259099` (separado do `public`)
- **Tempo total de restauração e validação (RTO medido):** `7.185 ms` (`7,18 s`)
- **Registros órfãos em chaves estrangeiras:** `0`

### Resultado da Validação de Integridade por Tabela (17 tabelas / 88 registros)

| Ordem Topológica | Tabela | Registros (Origem / Restaurado) | Hash SHA-256 Validado Pós-Restore | Status |
| :---: | :--- | :---: | :--- | :---: |
| 1 | `fornecedores` | 2 / 2 | `dd17de3cd3092af1d732ed3204fc9a03e5d4b6353c78b910c060b5c4ef3d1eb9` | Íntegro |
| 2 | `usuarios` | 7 / 7 | `a54d0da8cb40c5315f49cea7743b87ad191c704cb25ad7862816d04f8612a4e7` | Íntegro |
| 3 | `motoristas` | 2 / 2 | `36557daa013236b49be5692064944e7b74c88ea517d6e96581ad4627b7591d8f` | Íntegro |
| 4 | `veiculos` | 6 / 6 | `bce93b9f9191aa6496531fd0b1bb43609f9ab571735a9c950fbd3a22bdfb669f` | Íntegro |
| 5 | `abastecimentos` | 2 / 2 | `4a6cfb07737285fbe4015ad4b437afffe567b5d9b9454ad9aa8f45597d9cb10c` | Íntegro |
| 6 | `auditorias` | 40 / 40 | `967bd7e90b23c10c54163c82bbfb67d78ee2e853936720402f8d26255897bf9a` | Íntegro |
| 7 | `documentos_veiculo` | 5 / 5 | `5c6df42dd43feb1f7575e249f1ed23981897184500161146f7ce77f96855f3a9` | Íntegro |
| 8 | `equipes_svo` | 2 / 2 | `a91e5904e01f33b7498232c2517d9fb0ba988b2a3e18006fd52db414b190d952` | Íntegro |
| 9 | `escalas_svo` | 2 / 2 | `d598912f6b75aa9ed5121d17847ec3c49a67b6b558202cb47cf865a3b50f8aa2` | Íntegro |
| 10 | `unidades` | 3 / 3 | `21b8b4d0eb6cf82e4382be34958a50dca1df8e47fbe7a07ca66e1a6e3cd052d8` | Íntegro |
| 11 | `gestores_unidades` | 3 / 3 | `fc12445f931e432e2aa00982ab97333918f378609f220b1b6474a27ccbc659a6` | Íntegro |
| 12 | `manutencoes` | 4 / 4 | `d75f7311e024adb17190eca293f03a8b457f6388cb77d1785125943bbb04b67f` | Íntegro |
| 13 | `multas` | 2 / 2 | `dff671983092493db40b639fa0c9f77c988c4e5c20613af00c46c9dc896f7104` | Íntegro |
| 14 | `solicitacoes_svo` | 2 / 2 | `fe46b9f47182175293a3676d0f5e4e28e3106d7772557da1060ce70bcb969546` | Íntegro |
| 15 | `ordens_svo` | 1 / 1 | `e3ffbcef92affbc72c63bc4246e6a6539c5cb723729f718b441374e1112b5987` | Íntegro |
| 16 | `solicitacoes_viagem` | 3 / 3 | `ce55e6b3250af4ce83ddc19994d6da90996adcd55e3b8866e5081ba9282fae99` | Íntegro |
| 17 | `viagens_frota` | 2 / 2 | `4ecd3f16f0f989108961d5fe72df08f36a4c1ead2609aa394b469db6769ed726` | Íntegro |
