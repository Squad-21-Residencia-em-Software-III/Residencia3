# SCRUM-264 — Endpoint público SVO e emissão transacional de protocolo

Pai: SCRUM-249 (Sprint DEV 7). Depende do modelo de dados da SCRUM-263 (já na `develop`).

## Contrato

`POST /api/solicitacoes-svo/externas` (público, sem autenticação)

Cabeçalhos obrigatórios:

| Cabeçalho | Formato | Função |
|---|---|---|
| `Idempotency-Key` | `^[A-Za-z0-9._:-]{8,120}$` | Identifica a intenção de criação |
| `X-Prova-Tentativa` | `^[A-Za-z0-9_-]{32,128}$` | Prova de posse da tentativa (gerada pelo cliente) |

Corpo: JSON estrito (campos desconhecidos são rejeitados), limite de 100 KB (413 acima disso).
Campos: `tipo_solicitante` (PESSOA_FISICA | INSTITUICAO), `nome_instituicao`, `nome_solicitante`,
`telefone_solicitante`, `email_solicitante`, `cpf_solicitante` (só formato e dígitos verificadores, normalizado
para 11 dígitos), `nome_falecido`, `documento_falecido`, `local_ocorrencia`, `numero_imovel`,
`sem_numero_imovel`, `complemento_ocorrencia`, `ponto_referencia`, `latitude_ocorrencia`/`longitude_ocorrencia`
(sempre em par), `fora_area_cobertura`, `descricao_ocorrencia`, `data_hora_ocorrencia` (ISO com fuso, não futura),
`informacoes_medicas`, `ciencia_aviso_privacidade` (deve ser `true`), `versao_aviso_privacidade`.

Resposta (sempre `Cache-Control: private, no-store`):

- `201` primeira criação; `200` repetição da mesma intenção (mesmo corpo).
- Corpo mínimo: `protocolo`, `credencial`, `status` (`RECEBIDA`), `status_label`, `registrada_em`.
- `409 IDEMPOTENCIA_CONFLITO`: mesma chave com conteúdo ou prova diferentes. Sem efeitos e sem devolver credencial.
- `410 CREDENCIAL_INDISPONIVEL`: credencial da chave já revogada.
- `404 RECURSO_DESATIVADO`: flag `PORTAL_SVO_ATIVO` desligada (padrão).
- `400` validação (mensagens nunca ecoam valores enviados), `413` corpo acima de 100 KB.

## Decisões

- Canal `EXTERNA` e `registrante_id = null` definidos no servidor; o cliente não consegue enviá-los.
- Tudo em uma transação: chamado, dados protegidos, credencial, auditoria (usuário nulo) e alertas S1 na outbox.
  Falha em qualquer etapa desfaz tudo. Não há S2 nem confirmação automática.
- Protocolo imprevisível (`SVO-AAAAMMDD-XXXXXXXXXXXX`), com até 3 tentativas em colisão (savepoint).
- Idempotência persistente: `pg_advisory_xact_lock` por chave + coluna única `chave_idempotencia_criacao`.
- Credencial **derivada por HMAC-SHA-256** de (chave + prova) com segredo do servidor. O banco guarda apenas
  digests (`segredo_digest`, `payload_criacao_digest`, `prova_tentativa_digest`), nunca a credencial nem a prova.
  Por isso a primeira resposta perdida é recuperável repetindo a mesma requisição.
- S1 (`SVO_SOLICITACAO_CRIADA`) reutiliza `notificacaoSvoService.publicarAlertasRegistroSolicitacao` (autor nulo):
  administradores ativos e gestores SVO associados à unidade SVO, um aviso por destinatário, texto sem dados pessoais.
- Rota montada antes de `/solicitacoes-svo` para não conflitar com `/:id`; roteador interno e seus guards intactos.

## Pontos para os líderes decidirem

1. **Derivação de credencial vs. envelope de recuperação**: a SCRUM-263 removeu `envelope_recuperacao`; adotei
   derivação HMAC (sem migration nova). Precisa de validação.
2. **Ordem de merge com SCRUM-266 e SCRUM-271**: ambas tocam rotas/`app.ts`; pode haver conflito simples de merge.
   A 266 define o formato do protocolo e a verificação da credencial; a 271 monta flag, cota, no-store e honeypot
   (`website_hp`) para este mesmo POST. Este PR já usa o mesmo formato de protocolo e algoritmo da 266.
3. **Privilégios da role `frotas_app`**: a 266 insere `emitida_em`/`versao_credencial`, colunas que a role não
   pode inserir pelas regras da 263; alinhar na integração.
4. **Data da ocorrência**: o card não define tolerância nem limite inferior; hoje só rejeitamos datas futuras (+5 min).
5. Erros de parse/413 ocorrem antes da rota e podem não carregar `no-store`.

## Testes

- `solicitacaoSvoExternaSchemas.test.ts` (25), `solicitacaoSvoExternaRoutes.test.ts` (20), `solicitacaoSvoExternaService.test.ts`.
- `solicitacaoSvoExternaPostgres.test.ts` (10, HTTP + PostgreSQL real, `ENDPOINT_PUBLICO_SVO_POSTGRES_TESTS=1`): sucesso e fila sem PII,
  S1 por destinatário, repetição, concorrência (6 chamadas = 1 chamado), conflito sem efeitos, rollback sem órfãos,
  resposta perdida recuperada, flag desligada, campos inválidos e 413, registro interno inalterado.
- CI: variável `ENDPOINT_PUBLICO_SVO_POSTGRES_TESTS` adicionada ao job de testes.

## Evidências

- Ambiente: Windows local, Node/npm do projeto, PostgreSQL em Docker, banco descartável `frotas_teste`
  com as 34 migrations e `db:provisionar-app-user` (role restrita).
- Resultado local: `npm run typecheck` limpo; `npm test -- --no-file-parallelism`: 91 arquivos passaram, 17 pulados
  (suítes PG), 2090 testes passaram; suíte PG do SCRUM-264: 10/10 passaram.
- SHA: preencher após o commit (`git rev-parse --short HEAD`).
- Não executado: homologação física/manual, teste de carga, validação contra as branches 266/271 integradas.
