# SCRUM-263 — Modelagem de Solicitações Externas SVO, Canal de Origem e Dados Protegidos

## 1. Objetivo e Visão Geral

Esta entrega implementa a evolução aditiva de banco de dados da **Fase 3 (`SCRUM-263`)** para permitir que solicitações vindas do Portal Público de Atendimento SVO sejam registradas sem criar contas fictícias em `usuarios`, sem quebrar nem exigir alterações nos chamados internos existentes e segregando dados pessoais/clínicos e credenciais secretas em tabelas protegidas com princípio de mínimo privilégio.

Esta modelagem desbloqueia diretamente:
- **`SCRUM-264`:** Endpoint público `POST /api/solicitacoes-svo/externas`, emissão transacional de protocolo e idempotência por tentativa.
- **`SCRUM-266`:** Credenciais secretas de alta entropia (digest protegido), recuperação segura de resposta interrompida e acompanhamento externo até 30 dias após encerramento.
- **`SCRUM-268`:** Correção autenticada de contato/localização enquanto em análise (`EM_TRIAGEM`), pedido externo de cancelamento decidido pelo gestor e justificativa pública de recusa separada da justificativa interna.
- **`SCRUM-295`:** Retenção segura de 12 meses após encerramento operacional, preservação legal (`preservacao_legal`) e anonimização/expurgo sem apagar o histórico operacional de `solicitacoes_svo` e `ordens_svo`.

---

## 2. Alterações Aditivas em `public.solicitacoes_svo`

Arquivo da migration: `src/backend/database/migrations/20261127130000_scrum_263_solicitacoes_externas_svo.js`

1. **`registrante_id INTEGER NULL`:**
   - A FK `solicitacoes_svo_registrante_id_foreign` (`REFERENCES usuarios(id) ON DELETE RESTRICT`) é integralmente preservada.
   - A coluna passa a permitir `NULL` exclusivamente quando `canal_origem = 'EXTERNA'`.
2. **`canal_origem VARCHAR(20) NOT NULL DEFAULT 'INTERNA'`:**
   - Todos os registros legados recebem backfill explícito para `'INTERNA'` sem criação de protocolos ou dados externos fictícios.
   - Constraint `chk_solicitacoes_svo_canal_origem`: `CHECK (canal_origem IN ('INTERNA', 'EXTERNA'))`.
3. **`protocolo VARCHAR(64) NULL DEFAULT NULL`:**
   - Protocolo público opaco exclusivo para solicitações externas (`UNIQUE (protocolo)` via `uq_solicitacoes_svo_protocolo`).
   - Constraint `chk_solicitacoes_svo_canal_registrante_protocolo`:
     - Quando `canal_origem = 'INTERNA'`: exige `registrante_id IS NOT NULL AND protocolo IS NULL`.
     - Quando `canal_origem = 'EXTERNA'`: exige `registrante_id IS NULL AND protocolo IS NOT NULL` com formato opaco alfanumérico em maiúsculas e hífens (`^[A-Z0-9][A-Z0-9-]{10,62}[A-Z0-9]$`, comprimento entre 12 e 64 caracteres).
4. **Reaproveitamento de `local_ocorrencia`:**
   - O campo `solicitacoes_svo.local_ocorrencia` (`VARCHAR(255) NOT NULL`) continua sendo a fonte operacional de endereço exibida na fila única de triagem e em `VIAGENS_UNIFICADAS_SQL` (`viagemModel.ts`), evitando duplicação textual na tabela principal.
5. **Índice e Imutabilidade de Canal/Protocolo:**
   - Índice composto `idx_solicitacoes_svo_canal_status_id` em `(canal_origem, status, id DESC)` para filtragem e ordenação na fila única de triagem.
   - Trigger `trg_proteger_integridade_canal_solicitacao_svo` (`proteger_integridade_canal_solicitacao_svo()`) impede que `canal_origem` seja trocado após o registro ou que o `protocolo` de um chamado externo seja adulterado após a emissão.

---

## 3. Tabelas Protegidas Segregadas

### 3.1. `public.solicitacoes_svo_dados_externos` (Relação 1:1 com `solicitacoes_svo`)
Guarda os dados pessoais, institucionais, clínicos, coordenadas opcionais e metadados de ciclo de vida do portal externo:
- **Identificação do solicitante:** `nome_solicitante`, `telefone_solicitante`, `email_solicitante`, `cpf_solicitante` (`CHAR(11)` com validação de 11 dígitos e bloqueio de sequências repetidas), `tipo_solicitante` (`PESSOA_FISICA` | `INSTITUICAO`) e `nome_instituicao` (obrigatório quando `INSTITUICAO` e proibido quando `PESSOA_FISICA` via `chk_solicitacoes_svo_dados_externos_tipo_instituicao`).
- **Identificação do falecido:** `nome_falecido` (obrigatório) e `documento_falecido` (opcional).
- **Localização detalhada da ocorrência:** `endereco_ocorrencia` (`VARCHAR(255)`), `numero_imovel` (`VARCHAR(30)`), `sem_numero_imovel` (`BOOLEAN NOT NULL DEFAULT false`, com `chk_solicitacoes_svo_dados_externos_numero_imovel`), `complemento_ocorrencia` (`VARCHAR(120)`), `ponto_referencia` (`VARCHAR(255)`), `latitude_ocorrencia` e `longitude_ocorrencia` (par opcional finito em `[-90, 90]` e `[-180, 180]` via `chk_solicitacoes_svo_dados_externos_coordenadas`) e `fora_area_cobertura` (`BOOLEAN NOT NULL DEFAULT false`).
- **Contexto clínico e ocorrência:** `descricao_ocorrencia` (`VARCHAR(2000)`), `data_hora_ocorrencia` (`TIMESTAMPTZ NOT NULL`) e `informacoes_medicas` (`VARCHAR(2000)` opcional).
- **Privacidade:** `ciencia_aviso_privacidade` (`BOOLEAN NOT NULL`, exigido `true`), `versao_aviso_privacidade` (`VARCHAR(40) NOT NULL`) e `ciencia_registrada_em`.
- **Recusa pública e pedido de cancelamento (`SCRUM-268`):** `motivo_recusa_publico` (`VARCHAR(500)` separado de `solicitacoes_svo.motivo_recusa`), `cancelamento_solicitado_em`, `cancelamento_motivo`, `cancelamento_status` (`PENDENTE` | `ACEITO` | `NEGADO`), `cancelamento_decidido_por`, `cancelamento_decidido_em`, `cancelamento_justificativa_decisao` e `versao_dados` (`INTEGER NOT NULL DEFAULT 1`).
- **Retenção e preservação legal (`SCRUM-295`):** `encerrado_operacional_em`, `consulta_publica_expira_em`, `retencao_ate` ($\ge 12$ meses após `encerrado_operacional_em`), `preservacao_legal`, `preservacao_motivo`, `anonimizado_em`, `expurgado_em`, `expurgado_por` e `expurgo_motivo`.

### 3.2. `public.solicitacoes_svo_credenciais_externas` (Relação 1:1 com `solicitacoes_svo`)
Guarda o digest da credencial secreta de acompanhamento e a chave de idempotência da tentativa de criação:
- `segredo_digest` (`CHAR(64) NOT NULL`, formato hex SHA-256/HMAC-SHA-256), `algoritmo_digest`, `versao_credencial`.
- `chave_idempotencia_criacao` (`VARCHAR(120) UNIQUE`), `payload_criacao_digest` (`CHAR(64)`), `prova_tentativa_digest` (`CHAR(64)`), `envelope_recuperacao` (`TEXT`) e `recuperacao_expira_em` (`TIMESTAMPTZ`).
- `emitida_em`, `valida_ate`, `revogada_em`, `revogada_motivo`, `ultimo_acesso_em`, `atualizado_em`.

### 3.3. Barreira de Canal por Trigger
As triggers `trg_validar_vinculo_canal_externo_dados_svo` e `trg_validar_vinculo_canal_externo_credenciais_svo` (`validar_vinculo_canal_externo_svo()`) garantem no PostgreSQL que nenhum registro possa ser inserido nas tabelas externas apontando para uma solicitação cujo `canal_origem` seja `'INTERNA'`.

---

## 4. Privilégios Mínimos (`frotas_app`) e Estratégia de Rollback / Roll-Forward

- **Sem `DELETE` para `frotas_app`:** A role de aplicação não possui permissão `DELETE` em `solicitacoes_svo_dados_externos` nem em `solicitacoes_svo_credenciais_externas` (verificado automaticamente em `provisionar-usuario-app.cjs`).
- **`UPDATE` granular por coluna:**
  - Em `solicitacoes_svo_dados_externos`, `frotas_app` só pode atualizar colunas de contato (`telefone_solicitante`, `email_solicitante`), localização, recusa pública, fluxo de cancelamento, versionamento e metadados de encerramento/preservação. Colunas de identidade (`cpf_solicitante`, `nome_solicitante`, `tipo_solicitante`, `nome_falecido`, `ciencia_aviso_privacidade`, `versao_aviso_privacidade`) são imutáveis para a role da aplicação (`42501 insufficient_privilege`).
  - Em `solicitacoes_svo_credenciais_externas`, `frotas_app` não pode sobrescrever `segredo_digest`, `chave_idempotencia_criacao` nem `payload_criacao_digest` após a emissão.
- **Rollback seguro e Roll-Forward:**
  - O método `down` verifica se existem registros em `solicitacoes_svo_dados_externos`, `solicitacoes_svo_credenciais_externas` ou chamados com `canal_origem = 'EXTERNA'` / `registrante_id IS NULL` / `protocolo IS NOT NULL`. Caso exista qualquer dado externo persistido, o rollback de schema é bloqueado com erro explícito para evitar perda de dados; nesses cenários, a recuperação deve ocorrer por **roll-forward** mantendo as tabelas e desativando a feature flag `FASE3_PORTAL_SVO`.
