# SCRUM-266 — Credenciais Secretas e API Segura de Acompanhamento Externo SVO

## 1. Objetivo e Visão Geral

Esta entrega implementa a emissão transacional de credenciais secretas de alta entropia, a recuperação autenticada de comprovante em caso de falha de rede após o commit e a API pública de acompanhamento externo do Portal SVO (**`SCRUM-266`**), garantindo que apenas quem detém o par `(protocolo, credencial secreta)` consulte o andamento do próprio chamado sem expor dados internos (motorista, veículo, equipe, GPS, justificativa interna de recusa ou dados pessoais sensíveis).

---

## 2. Arquitetura Criptográfica e Armazenamento Protegido

1. **Separação entre Protocolo Público e Credencial Secreta:**
   - **Protocolo público (`protocolo`):** Identificador opaco legível no formato `SVO-YYYYMMDD-XXXXXXXXXXXX` (`12` caracteres aleatórios sobre alfabeto sem ambiguidade visual `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`), gravado em `solicitacoes_svo.protocolo`. O protocolo isolado **não autoriza** nenhuma leitura.
   - **Credencial secreta (`credencial`):** Segredo de alta entropia com **256 bits** (`32 bytes` gerados via `crypto.randomBytes(32)` codificados em `base64url` com `43` caracteres).
2. **Digest Protegido e Comparação em Tempo Constante:**
   - O segredo em texto claro **nunca é persistido** em `solicitacoes_svo_credenciais_externas.segredo_digest`.
   - O banco armazena apenas o digest hexadecimal de 64 caracteres calculado com **`HMAC-SHA-256`** derivado do segredo do servidor (`calcularDigestCredencialExterna`).
   - A verificação utiliza `crypto.timingSafeEqual` (`compararDigestsTempoConstante`), executando um cálculo completo contra um digest constante mesmo quando o protocolo não existe para eliminar canais laterais de tempo e impedir enumeração de protocolos.
3. **Idempotência da Criação (alinhado à correção da SCRUM-263, commit 263165a):**
   - `chave_idempotencia_criacao` e `payload_criacao_digest` são obrigatórios (NOT NULL no banco); `prova_tentativa_digest` é opcional.
   - O envelope cifrado de recuperação (`envelope_recuperacao` / `recuperacao_expira_em`) e `valida_ate` foram removidos do schema. Por isso o endpoint `POST /recuperar-comprovante` foi retirado desta entrega. A retomada de resposta perdida após o commit fica com a SCRUM-264, dependendo de migration revisada e decisão institucional.
   - A única expiração pública é `solicitacoes_svo_dados_externos.consulta_publica_expira_em`, coluna GENERATED (encerramento operacional + 30 dias em UTC). A aplicação grava apenas `encerrado_operacional_em`, uma única vez.

---

## 3. Endpoints, Transporte Seguro e Proteção de Cache/Logs

### 3.1. Endpoints Públicos (sob `FASE3_ACOMPANHAMENTO_EXTERNO=true`)
- **`POST /api/solicitacoes-svo/externas/acompanhamento`**
  - Recebe `{ protocolo, credencial }` no corpo JSON (ou `protocolo` no corpo e credencial no cabeçalho `X-Credencial-Acompanhamento`).
- **`GET /api/solicitacoes-svo/externas/acompanhamento/:protocolo`**
  - Recebe `:protocolo` no path e a credencial exclusivamente no cabeçalho `X-Credencial-Acompanhamento`.

### 3.2. Endpoint Interno de Revogação
- **`POST /api/solicitacoes-svo/:id/credencial-externa/revogar`**
  - Restrito a `ADMINISTRADOR` e `GESTOR_SVO` associado à unidade SVO (`autenticar` + `autorizar` + `exigirAssociacaoSvo`).
  - Preenche `revogada_em` e `revogada_motivo` e grava trilha em `auditorias` (`REVOGOU_CREDENCIAL_EXTERNA_SVO solicitacao_id=...`).

### 3.3. Proibição de Credencial na URL, Cache e Logs
- Qualquer requisição de acompanhamento que contenha parâmetros na query string (`?credencial=...`, `?protocolo=...`) é imediatamente recusada com `400 Bad Request` (`CREDENCIAIS_NA_URL_PROIBIDAS`).
- Todas as respostas públicas aplicam `Cache-Control: no-store, no-cache, must-revalidate, private, max-age=0`, `Pragma: no-cache` e `Expires: 0`, além de a rota `/api/*` estar configurada como `NetworkOnly` no Service Worker (`src/frontend/src/sw.ts`).
- O middleware `logRequisicao.ts` registra apenas `requestId`, método HTTP, status e duração, sem logar URL, headers ou corpo.
- Rate-limit anti-enumeração (`limitarTentativasAcompanhamentoExterno`): limita a 15 falhas por janela de 15 minutos por IP (`skipSuccessfulRequests: true`), protegendo contra força bruta sem bloquear hospitais em NAT com consultas válidas.

---

## 4. Mapeamento Explícito dos 7 Estados Públicos e Janela de 30 Dias

| Estado Interno (`solicitacoes_svo` / `ordens_svo`) | Status Público (`status`) | Rótulo (`status_label`) | Regra de Transição e Visibilidade |
| :--- | :--- | :--- | :--- |
| `EM_TRIAGEM` (`versao_dados = 1` e sem pedido de cancelamento) | `RECEBIDA` | `Recebida` | Chamado registrado e aguardando início da análise. Permite edição de contato/local e pedido de cancelamento. |
| `EM_TRIAGEM` (`versao_dados > 1` ou com pedido de cancelamento) | `EM_ANALISE` | `Em análise` | Chamado em análise/revisão pela triagem. Permite edição de contato/local e pedido de cancelamento. |
| `CONFIRMADA` (ordem `AGUARDANDO_ALOCACAO`) | `CONFIRMADA` | `Confirmada` | Triagem confirmada; bloqueia edição de contato/local e permite pedido de cancelamento sujeito à decisão do gestor. |
| `EM_ANDAMENTO` (ou ordem `ALOCADA` / `EM_DESLOCAMENTO` / `NO_LOCAL`) | `EM_ANDAMENTO` | `Em andamento` | Atendimento em execução operacional; não expõe dados da equipe, motorista, viatura ou GPS. |
| `CONCLUIDA` | `CONCLUIDA` | `Concluída` | Atendimento encerrado. Consulta pública disponível por até **30 dias** a partir de `encerrado_operacional_em`. |
| `RECUSADA` | `NAO_ACOLHIDA` | `Não acolhida` | Exibe apenas `motivo_recusa_publico` (ou mensagem padrão). **Nunca** expõe `solicitacoes_svo.motivo_recusa` interno. Consulta até **30 dias**. |
| `CANCELADA` | `CANCELADA` | `Cancelada` | Solicitação cancelada após decisão autorizada. Consulta disponível por até **30 dias** do encerramento. |

---

## 5. Decisão Institucional Pendente

- **Política de recuperação de credencial perdida após o encerramento da janela da tentativa:** Conforme especificado na `SCRUM-250` e `SCRUM-266`, não existe busca pública por CPF, telefone ou e-mail e nenhuma recuperação fora da prova criptográfica da tentativa foi implementada, permanecendo condicionada à definição institucional formal.
