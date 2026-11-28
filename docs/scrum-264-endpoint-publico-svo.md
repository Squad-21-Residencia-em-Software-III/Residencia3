# SCRUM-264 — Endpoint público SVO e emissão transacional de protocolo

Pai: SCRUM-249 (Sprint DEV 7). Depende do modelo de dados da SCRUM-263 (já na `develop`) e **do serviço de credencial da SCRUM-266 (PR #237)**, que emite e recupera a credencial dentro da transação deste endpoint.

> **Ordem de entrega:** este PR contém o merge da branch da SCRUM-266. Enquanto o #237 não estiver na `develop`, o diff do PR inclui os arquivos dele. Depois do merge do #237, o diff encolhe para os arquivos próprios da 264 (ver "Alinhamento com o PR #237").

## Contrato

`POST /api/solicitacoes-svo/externas` (público, sem autenticação, sem parâmetros na URL)

Cabeçalhos obrigatórios (mesmas regex da SCRUM-266):

| Cabeçalho | Formato | Função |
|---|---|---|
| `Idempotency-Key` | `^[A-Za-z0-9._:-]{8,120}$` | Identifica a intenção de criação |
| `X-Prova-Tentativa` | `^[A-Za-z0-9_-]{32,128}$` | Prova de posse da tentativa |

**Geração da prova (contrato para a SCRUM-265):** 32 bytes (256 bits) do CSPRNG do navegador (`crypto.getRandomValues`), em Base64URL (43 caracteres), gerados uma vez por intenção de envio e **nunca derivados da chave, do conteúdo ou de dados do cidadão**. O servidor só consegue validar formato e tamanho; não comprova entropia. A prova e a chave devem ficar só em memória/sessão durante a tentativa e ser repetidas, sem alteração, em qualquer reenvio.

Corpo: JSON estrito (campos desconhecidos são rejeitados), limite de 100 KB (413 acima disso).
Campos: `tipo_solicitante` (PESSOA_FISICA | INSTITUICAO), `nome_instituicao` (mín. 2), `nome_solicitante`,
`telefone_solicitante`, `email_solicitante`, `cpf_solicitante` (só formato e dígitos verificadores, normalizado
para 11 dígitos), `nome_falecido`, `documento_falecido`, `local_ocorrencia`, `numero_imovel`,
`sem_numero_imovel`, `complemento_ocorrencia`, `ponto_referencia`, `latitude_ocorrencia`/`longitude_ocorrencia`
(sempre em par), `fora_area_cobertura`, `descricao_ocorrencia`, `data_hora_ocorrencia` (ISO com fuso, nunca futura, sem tolerância),
`informacoes_medicas`, `ciencia_aviso_privacidade` (deve ser `true`), `versao_aviso_privacidade` (reconhecida, ver abaixo).

Resposta (sempre `Cache-Control: private, no-store`, inclusive em erros antecipados):

- `201` primeira criação; `200` resposta perdida recuperada (mesma chave, mesma prova, mesmo conteúdo, dentro da janela).
- Corpo mínimo: `protocolo`, `credencial`, `status` (`RECEBIDA`), `status_label`, `registrada_em`.
- `401 CREDENCIAL_EXTERNA_INVALIDA` (resposta uniforme): chave existente com prova errada, chave sem prova, janela expirada
  ou credencial revogada. Quem não prova a posse da tentativa não descobre se a chave existe nem o que ela contém.
- `409 CONFLITO_IDEMPOTENCIA`: mesma chave com **prova correta** e conteúdo diferente. Sem efeitos e sem devolver credencial.
- `404 RECURSO_DESATIVADO`: flag `PORTAL_SVO_ATIVO` desligada (padrão).
- `400` validação ou parâmetros na URL (mensagens nunca ecoam valores enviados), `413` corpo acima de 100 KB.

## Decisões

- Canal `EXTERNA` e `registrante_id = null` definidos no servidor; o cliente não consegue enviá-los. A rota não exige JWT nem conta artificial.
- Tudo em uma transação: chamado, dados protegidos, credencial (serviço da 266), auditoria (usuário nulo) e alertas S1 na outbox.
  Falha em qualquer etapa desfaz tudo. Não há S2 nem confirmação automática.
- **Credencial, digests e recuperação são exclusivamente da SCRUM-266** (`acompanhamentoExternoSvoService.emitirCredencialNaTransacao` e
  `recuperarComprovanteTentativa`): credencial aleatória de 256 bits, HMAC-SHA-256 com chave dedicada e versionada
  (`CREDENCIAL_EXTERNA_SVO_SECRET`, `_KEY_VERSION`, `_PREVIOUS_SECRETS`), comparação em tempo constante e envelope AES-256-GCM.
  Este PR **não usa `JWT_SECRET` e não tem implementação criptográfica própria** (o antigo `credencialExternaSvo.ts` foi removido).
- Protocolo `SVO-AAAAMMDD-XXXXXXXXXXXX` gerado pelo serviço da 266 (alfabeto de 32 caracteres: sem viés de módulo), com até 3 tentativas em colisão (savepoint).
- Idempotência: `pg_advisory_xact_lock` por chave serializa tentativas; coluna única `chave_idempotencia_criacao` é a rede de segurança.
- **Janela de recuperação: 15 minutos** (`JANELA_RECUPERACAO_TENTATIVA_MS` da 266). Depois dela, repetir a mesma chave **não cria novo chamado** e responde 401 uniforme.
  A recuperação de credencial **perdida** depois da janela não existe: depende de decisão institucional.
- Ordem de validação na repetição: 1) prova de posse (digest com a versão criptográfica original, em tempo constante); 2) só então a SCRUM-266 confere conteúdo (409), revogação, expiração e envelope.
- Rotação de chaves: a repetição usa a versão com que a tentativa foi emitida; tentativas novas usam a versão atual.
- Dois ajustes mínimos em arquivos ligados à SCRUM-266 (ver "Alinhamento com o PR #237").
- S1 (`SVO_SOLICITACAO_CRIADA`) reutiliza `notificacaoSvoService.publicarAlertasRegistroSolicitacao` (autor nulo):
  administradores ativos e gestores SVO associados à unidade SVO, um aviso por destinatário, texto sem dados pessoais.
- Rota montada antes de `/solicitacoes-svo` para não conflitar com `/:id`; roteador interno e seus guards intactos.
- Cabeçalhos HTTP: `no-store` é aplicado em `app.ts` para todo `/api/solicitacoes-svo/externas`, antes do parser JSON, do limite de concorrência e das flags
  (vale em JSON inválido, 413, 429, 503 e 404). A rota rejeita qualquer parâmetro na query string. CORS libera, além dos padrões, só
  `Idempotency-Key`, `X-Prova-Tentativa` e `X-Credencial-Acompanhamento` (SCRUM-266), com origens restritas por ambiente.

### Regras de campos (SCRUM-263 / ADR-07)

- `nome_instituicao`: mínimo de 2 caracteres (igual ao declarado).
- `fora_area_cobertura`: se houver coordenadas **fora do retângulo de Sergipe** (`src/frontend/src/config/mapas.ts`, `LIMITES_SERGIPE`), o servidor força `true`.
  Dentro do retângulo, ou sem coordenadas (endereço manual), vale o informado: o retângulo cobre parte de estados vizinhos e não prova localização. Nada é rejeitado por estar fora de Sergipe.
- `versao_aviso_privacidade`: validada contra `AVISO_PRIVACIDADE_SVO_VERSOES` (lista separada por vírgula). Sem a variável, só o formato é validado.
  **A lista oficial precisa ser definida pela instituição antes da homologação.**
- `data_hora_ocorrencia`: sem tolerância de relógio, para coincidir com a regra escrita aqui (rejeita futuro). Confirmar com a instituição se aparelhos adiantados precisam de margem.
- CPF continua validado só por formato e dígitos verificadores.

## Integrações

- **SCRUM-266 (PR #237):** serviço de credencial, recuperação e API de acompanhamento. Cobertura real nos testes PostgreSQL (abaixo).
  Atenção ao endpoint `POST /externas/recuperar-comprovante`: ele compara o digest do `payload` **como recebido**, então o cliente precisa enviar o payload **já normalizado**
  (CPF só dígitos, data em ISO UTC, opcionais ausentes, `fora_area_cobertura` e `sem_numero_imovel` preenchidos). O caminho recomendado para a SCRUM-265 é **repetir o mesmo
  `POST /externas`**, em que o servidor normaliza o conteúdo.
- **SCRUM-271 (proteção do portal):** não duplicada aqui. Quando entrar na `develop`, a cadeia da rota passa a ser flag → `protegerPortalSvo('cadastrar')` →
  `verificarHoneypotPortalSvo` (remove `website_hp` vazio antes do `strictObject`) → controller. Enquanto isso, qualquer `website_hp` é rejeitado pelo `strictObject` (400).
  Repetição legítima da mesma tentativa não gera novo chamado; duplicidade provável de ocorrência não é bloqueada automaticamente.
- **SCRUM-272 (acesso público):** a criação funciona para anônimos e não exige JWT. Com sessão autenticada, a política de perfis fica com a 272; este endpoint nunca confia em perfil informado pelo cliente e mantém `EXTERNA` + registrante nulo.
- **SCRUM-265 (frontend):** gerar chave e prova como descrito, repetir a mesma tentativa em caso de resposta perdida, guardar a credencial apenas na tela de comprovante.

## Alinhamento com o PR #237

1. Este branch contém o merge de `feat/be-db-scrum-266-credenciais-acompanhamento-externo`.
2. **Ajustes feitos aqui para o #245 ficar verde sem depender de correção no #237** (se o #237 corrigir de outra forma, **vale a versão do #237** ao resolver o conflito):
   - `acompanhamentoExternoSvoService.ts`: `emitirCredencialNaTransacao` deixa de gravar `emitida_em` (usa o padrão do banco e devolve o valor do `RETURNING`). Sem isso a role restrita `frotas_app` falha com `42501`. Nenhum privilégio foi ampliado.
   - `scripts/validar-schema-solicitacoes-externas-svo.cjs` (validador da 263): reverte a migration da 266 antes do `down` da 263. A 266 cria `solicitacoes_svo_recuperacoes_tentativa` com FK para a credencial, e o `down` da 263 falhava com `2BP01` no CI.
3. `segurancaHttp.ts`/`segurancaHttp.test.ts` incluem `X-Credencial-Acompanhamento` (necessário para a consulta GET da 266). Se o #237 também alterar essas linhas, manter a lista com os três cabeçalhos.
4. Depois do merge do #237: atualizar este branch com a `develop` (`git merge origin/develop`), rodar a suíte completa e a suíte PostgreSQL, e o diff deve ficar só com os arquivos da 264.

## Pontos abertos

- Política institucional para recuperar credencial perdida após a janela de 15 minutos.
- Lista oficial de versões do aviso de privacidade; confirmação da regra de data futura e dos limites de texto.
- Pontos do #237 tratados aqui de forma mínima (`emitida_em`, rollback da 263 no validador) e a ordem de validação da recuperação (a repetição daqui já confere a prova antes do 409); CORS da consulta GET.
- Integrações com SCRUM-271 (honeypot, cotas) e SCRUM-272 (matriz de perfis) pendentes dos respectivos merges.

## Testes

- `solicitacaoSvoExternaSchemas.test.ts` (regras de campos, `fora_area_cobertura`, versão do aviso, data sem tolerância), `solicitacaoSvoExternaRoutes.test.ts`
  (flag, sem cache, query string, JSON inválido e 413 com `no-store`, preflight CORS), `solicitacaoSvoExternaService.test.ts`
  (delegação à 266, prova antes do conflito, 401 uniforme, colisão de protocolo, falhas transacionais), `segurancaHttp.test.ts`.
- `solicitacaoSvoExternaPostgres.test.ts` (HTTP + PostgreSQL real, `ENDPOINT_PUBLICO_SVO_POSTGRES_TESTS=1`, **role restrita provada por `current_user`**, fixtures por conexão administrativa separada):
  sucesso e fila sem PII, S1 por destinatário, repetição, concorrência (6 chamadas = 1 chamado), prova errada x conteúdo divergente, rollback sem órfãos,
  resposta perdida recuperada, flag desligada, campos inválidos e 413, registro interno inalterado e, na integração real com a 266:
  criar → perder resposta → repetir → recuperar o mesmo comprovante → consultar o acompanhamento real, endpoint de recuperação da 266, janela expirada,
  credencial revogada, rotação de chaves e falha transacional.
- CI: `ENDPOINT_PUBLICO_SVO_POSTGRES_TESTS=1` no job de testes (já com `POSTGRES_APP_USER` restrito).

## Evidências

- SHA: preencher após o commit (`git rev-parse --short HEAD`) e confirmar o SHA remoto do push.
- Resultados da última execução local: preencher com a saída de `npm run typecheck`, `npm test -- --no-file-parallelism`,
  suíte PostgreSQL (`ENDPOINT_PUBLICO_SVO_POSTGRES_TESTS=1`), `npm run build`, `npm audit` e CodeQL do CI.
- Não executado: homologação física/manual, teste de carga, preflight em navegador real, validação com SCRUM-271/272 integradas.
