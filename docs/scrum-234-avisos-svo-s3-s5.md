# SCRUM-234 · Avisos SVO S3, S4 e S5

Publicados por `services/notificacaoSvoService.ts` **na transação da operação**, pela infraestrutura da SCRUM-229. Se a publicação falhar, a operação é desfeita. Se a operação falhar, nada é publicado. `NOTIFICACOES_ATIVAS` controla os avisos e vem desligado por padrão: desligado, nenhuma consulta é feita a mais. Sem migration.

| Aviso | Quando | Quem recebe |
|---|---|---|
| **S3** `SVO_ORDEM_ATRIBUIDA` | Alocação (`POST /viagens`), e na reprogramação para quem entrou | Quem entrou |
| **S4** `SVO_ORDEM_REAGENDADA` | Reprogramação (`POST /viagens/ordens-svo/:id/reprogramar`) que muda horário ou veículo | Quem continua designado |
| **S5** `SVO_ORDEM_CANCELADA` | Cancelamento da ordem alocada (`PATCH /viagens/:id/cancelar`) | Quem estava designado no momento |

**Destinatários, sempre individuais:** o motorista da ordem (perfil Motorista SVO) e cada integrante com designação não revogada em `ordens_svo_integrantes`. **Nunca a equipe inteira:** um integrante da equipe que não foi designado não recebe. O autor (gestor) nunca é avisado.

**Canais:** push (categoria `SVO`), central e contador. **Links:** `/viagens` para o motorista e `/minhas-coletas` para o integrante. **Tag:** `ordem-svo-{id}` nos três avisos, de modo que o mais recente substitui o anterior no aparelho.

## Reprogramação

- **Quem entra recebe S3:**
  - O motorista novo.
  - O integrante com designação nova. Uma nova linha da mesma pessoa, por exemplo após uma troca de equipe, também conta como nova atribuição.
- **Quem continua recebe S4,** só se o horário previsto ou o veículo mudaram. Trocar apenas integrantes não é reagendamento para quem fica.
- **Quem sai não recebe aviso.** A designação é revogada e, pela regra da central (SCRUM-226), os avisos anteriores dessa pessoa ficam sem conteúdo (`acesso_revogado`). O mesmo vale para o motorista substituído.

## Duplicidade e concorrência

| Aviso | Ocorrência |
|---|---|
| S3 (integrante) | `designacao:<id da designação>` |
| S3 (motorista) | `motorista:<versão da agenda>` |
| S4 | `<início>-<fim>-v<veículo>`, a versão da agenda |
| S5 | `cancelamento` |

- Repetir a mesma reprogramação não avisa de novo. Um novo horário avisa.
- Alocação, reprogramação e cancelamento continuam sob o lock da agenda SVO (SCRUM-166) e são serializados.
- Em dois cancelamentos simultâneos, um vence e o outro responde 400. Cada pessoa recebe um aviso só.

## Acesso no clique

O aviso não concede acesso. A central confere o vínculo atual a cada leitura, e a fila confere de novo antes do push (`ACESSO_REVOGADO`):
- **Motorista:** enquanto é o condutor da ordem.
- **Integrante:** enquanto a designação não foi revogada.

Revogar a designação, ou trocar o motorista, tira o conteúdo dos avisos já recebidos e cancela os pushes ainda não enviados. A rota de destino confere a permissão de novo.

**Histórico de participação:** o cancelamento não revoga designações. Quem estava designado continua vendo os avisos da ordem, inclusive o S5.

## LGPD

- **Push:** só texto fixo.
  - Atribuição: "Confira a coleta e o horário previsto."
  - Reagendamento: "O horário ou o veículo da coleta mudou."
  - Cancelamento: "Uma coleta designada a você foi cancelada."
- **Central:** o número da ordem e o horário previsto (America/Maceio). O local da ocorrência e os dados do solicitante nunca entram.

## Testes

- `avisosSvoS3S5.test.ts`: quem recebe S3 e S4 em cada mudança, links, tag, ocorrências, S5 e interruptor desligado.
- `avisosSvoS3S5Postgres.test.ts`: de ponta a ponta, com HTTP autenticado, operações reais, central e fila. Roda com `SCRUM234_POSTGRES_TESTS=1` em `127.0.0.1/frotas_teste`, depois de `npm run migrate`, e está ligado no CI. Cobre:
  - pessoa da equipe não designada;
  - designação removida (sem S4 e sem conteúdo);
  - troca de motorista;
  - revogação antes do envio (push não sai);
  - histórico após o cancelamento;
  - reprogramações e cancelamentos concorrentes;
  - dedup;
  - rollback das três operações;
  - push entregue com link e tag;
  - contador;
  - ausência de dados sensíveis.
