# SCRUM-266 — Credenciais Secretas e API Segura de Acompanhamento Externo SVO

## 1. Objetivo e Visão Geral

Esta entrega implementa a emissão transacional de credenciais secretas de alta entropia, a recuperação autenticada de comprovante em caso de falha de rede após o commit e a API pública de acompanhamento externo do Portal SVO (**`SCRUM-266`**), garantindo que apenas quem detém o par `(protocolo, credencial secreta)` consulte o andamento do próprio chamado sem expor dados internos (motorista, veículo, equipe, GPS, justificativa interna de recusa/cancelamento ou dados pessoais sensíveis).

---

## 2. Arquitetura Criptográfica, Chaves Dedicadas e Armazenamento Protegido

1. **Separação entre Protocolo Público e Credencial Secreta:**
   - **Protocolo público (`protocolo`):** Identificador opaco legível no formato `SVO-YYYYMMDD-XXXXXXXXXXXX` (`12` caracteres aleatórios sobre alfabeto sem ambiguidade visual `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`), gravado em `solicitacoes_svo.protocolo`. O protocolo isolado **não autoriza** nenhuma leitura.
   - **Credencial secreta (`credencial`):** Segredo de alta entropia com **256 bits** (`32 bytes` gerados via `crypto.randomBytes(32)` codificados em `base64url` com `43` caracteres).
2. **Chaves Criptográficas Dedicadas e Rotação Versionada (desacopladas de `JWT_SECRET`):**
   - Os digests e envelopes utilizam configuração própria: `CREDENCIAL_EXTERNA_SVO_SECRET`, `CREDENCIAL_EXTERNA_SVO_KEY_VERSION` e `CREDENCIAL_EXTERNA_SVO_PREVIOUS_SECRETS` (suportando rotação sem invalidar credenciais vigentes).
   - Cada finalidade deriva sua própria subchave (`svo-credencial-externa-vN`, `svo-prova-tentativa-vN`, `svo-envelope-tentativa-vN`).
   - Em produção (`NODE_ENV=production`), se `PORTAL_SVO_ATIVO=true` ou `ACOMPANHAMENTO_EXTERNO_SVO_ATIVO=true`, a ausência de `CREDENCIAL_EXTERNA_SVO_SECRET` impede a inicialização do servidor.
   - A verificação utiliza `crypto.timingSafeEqual` (`compararDigestsTempoConstante`), executando cálculo completo contra digest constante mesmo quando o protocolo não existe para eliminar canais laterais de tempo.
3. **Recuperação Autenticada de Resposta Interrompida (`solicitacoes_svo_recuperacoes_tentativa`):**
   - Criada via migration aditiva `20261128100000_scrum_266_acompanhamento_e_recuperacao_svo.js`, separada de `solicitacoes_svo_credenciais_externas` e protegida por trigger que exige `prova_tentativa_digest IS NOT NULL` e credencial não revogada.
   - Quando o caminho de criação habilita recuperação autenticada, exige `Idempotency-Key`, `payload` normalizado e `X-Prova-Tentativa` (de alta entropia).
   - O envelope cifrado em `AES-256-GCM` tem expiração máxima de **15 minutos** no banco (`chk_svo_recuperacao_janela`) e `descartada_em` marcada em caso de revogação.
   - No replay em `POST /api/solicitacoes-svo/externas/recuperar-comprovante`:
     - Payload divergente para a mesma `Idempotency-Key` $\to$ `409 Conflict` (`CONFLITO_IDEMPOTENCIA`).
     - Prova de posse inválida, chave inexistente, credencial revogada ou janela expirada $\to$ `401 Unauthorized` uniforme (`CREDENCIAL_EXTERNA_INVALIDA`).

---

## 3. Endpoints, Independência de Flags e Concorrência

### 3.1. Endpoints Públicos (flags independentes por rota)
- **`POST /api/solicitacoes-svo/externas/acompanhamento`** (`exigirRecursoAtivo('acompanhamentoExterno')`, lendo `ACOMPANHAMENTO_EXTERNO_SVO_ATIVO`)
  - Recebe `{ protocolo, credencial }` no corpo JSON (ou `protocolo` no corpo e credencial em `X-Credencial-Acompanhamento`).
- **`GET /api/solicitacoes-svo/externas/acompanhamento/:protocolo`** (`exigirRecursoAtivo('acompanhamentoExterno')`)
  - Recebe `:protocolo` no path e credencial exclusivamente em `X-Credencial-Acompanhamento`.
- **`POST /api/solicitacoes-svo/externas/recuperar-comprovante`** (`exigirRecursoAtivo('portalSvo', 'acompanhamentoExterno')`)
  - Recebe `Idempotency-Key`, `X-Prova-Tentativa` e `payload` normalizado no corpo JSON.
- **Independência de rotas:** nenhum middleware de disponibilidade ou rate-limit de acompanhamento é aplicado globalmente no router `/externas`, preservando a autonomia entre `PORTAL_SVO_ATIVO` (`SCRUM-264`) e `ACOMPANHAMENTO_EXTERNO_SVO_ATIVO`.

### 3.2. Encerramento Operacional, Concorrência e Revogação
- **Encerramento operacional real:** `solicitacoes_svo_dados_externos.encerrado_operacional_em` é gravado nos encerramentos reais (`solicitacaoSvoService.recusar` e conclusão/cancelamento definitivo de ordem em `viagemService.ts`); a validade pública vem exclusivamente da coluna calculada `consulta_publica_expira_em` (UTC + 30 dias), sem fabricar datas de fallback.
- **Concorrência consulta vs. revogação/expiração:** após validar o digest, `registrarAcessoValidoSeAutorizado` executa `UPDATE ... WHERE c.revogada_em IS NULL AND (d.consulta_publica_expira_em IS NULL OR d.consulta_publica_expira_em >= ?)`; se a credencial tiver sido revogada ou expirado concorrentemente, retorna `401` uniforme.
- **Revogação auditada (`POST /api/solicitacoes-svo/:id/credencial-externa/revogar`):** restrita a `ADMINISTRADOR` e `GESTOR_SVO` associado ao SVO; marca `revogada_em`, `revogada_motivo` e descarta qualquer envelope ativo em `solicitacoes_svo_recuperacoes_tentativa`.
- **Cache e query string:** qualquer parâmetro na query string resulta em `400 CREDENCIAIS_NA_URL_PROIBIDAS`; respostas aplicam `Cache-Control: no-store, no-cache, must-revalidate, private, max-age=0`, `Pragma: no-cache` e `Expires: 0`.

---

## 4. Mapeamento dos 7 Estados Públicos e Mensagens Públicas Autorizadas

| Estado Interno (`solicitacoes_svo` / `ordens_svo` / `dados_externos`) | Status Público (`status`) | Rótulo (`status_label`) | Regra de Transição e Visibilidade |
| :--- | :--- | :--- | :--- |
| `EM_TRIAGEM` com `analise_iniciada_em IS NULL` | `RECEBIDA` | `Recebida` | Aguardando início da análise pelo gestor (alteração cadastral pelo cidadão não muda o estado). |
| `EM_TRIAGEM` com `analise_iniciada_em IS NOT NULL` | `EM_ANALISE` | `Em análise` | Análise iniciada na triagem via transição verificável (`PATCH /api/solicitacoes-svo/:id/iniciar-analise`). |
| `CONFIRMADA` (sem ordem em deslocamento ou com ordem `AGUARDANDO_ALOCACAO`/`ALOCADA`) | `CONFIRMADA` | `Confirmada` | Triagem confirmada; alocação de viatura/equipe sem saída não antecipa o estado para `EM_ANDAMENTO`. |
| `EM_ANDAMENTO` ou ordem `EM_DESLOCAMENTO` / `NO_LOCAL` | `EM_ANDAMENTO` | `Em andamento` | Deslocamento/atendimento efetivo em curso; sem expor motorista, viatura, placa, equipe ou GPS. |
| `CONCLUIDA` | `CONCLUIDA` | `Concluída` | Atendimento encerrado. Consulta válida até `consulta_publica_expira_em` (30 dias após `encerrado_operacional_em`). |
| `RECUSADA` | `NAO_ACOLHIDA` | `Não acolhida` | Exibe apenas `motivo_recusa_publico` (ou mensagem padrão). Nunca expõe `solicitacoes_svo.motivo_recusa`. |
| `CANCELADA` | `CANCELADA` | `Cancelada` | Exibe apenas `cancelamento_mensagem_publica` (ou mensagem padrão). Nunca expõe `cancelamento_justificativa_decisao`. |

- O campo `atualizada_em` retorna sempre a maior data válida entre todos os marcos públicos permitidos (`criado_em`, `analise_iniciada_em`, `confirmado_em`, `ordem_saida_em`, `ordem_conclusao_em`, `cancelamento_solicitado_em`, `cancelamento_decidido_em`, `encerrado_operacional_em`, `atualizado_em`).
