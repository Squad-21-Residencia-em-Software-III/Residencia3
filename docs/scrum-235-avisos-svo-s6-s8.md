# SCRUM-235 · Avisos SVO S6, S7 e S8

Publicados por `services/notificacaoSvoService.ts` **na transação da transição**, pela infraestrutura da SCRUM-229. Se a publicação falhar, a transição é desfeita. Se a transição falhar, nada é publicado. `NOTIFICACOES_ATIVAS` controla os avisos e vem desligado por padrão. Sem migration.

| Aviso | Quando | Quem recebe | Canal |
|---|---|---|---|
| **S6** `SVO_CHEGADA_LOCAL` | Ordem passa a `NO_LOCAL` (`PATCH /viagens/ordens-svo/:id/chegar-local`) | Administradores ativos e Gestores SVO ativos associados à unidade SVO | Só na central |
| **S7** `SVO_COLETA_CONCLUIDA` | A última ordem do deslocamento físico é finalizada (`PATCH /viagens/:id/finalizar`) | Os mesmos do S6 | Só na central |
| **S8** `EXCECAO_ODOMETRO_SOLICITADA` | Motorista SVO pede autorização sem foto (`POST /evidencias-odometro/excecoes`) | Gestores SVO ativos associados à unidade SVO | Push + central + contador |
| **S8** `EXCECAO_ODOMETRO_DECIDIDA` | Pedido SVO aprovado ou recusado (`PATCH /evidencias-odometro/excecoes/:id`) | O motorista SVO que pediu, se continua ativo e no perfil | Push + central + contador |

## Ocorrências e duplicidade

- **S6, uma por ordem:**
  - Cada coleta tem o próprio local, e a chegada é registrada uma vez por ordem.
  - A ocorrência fixa (`chegada-local`) impede repetição em reenvio. A nova chamada responde 409.
- **S7, uma por deslocamento físico:**
  - Várias ordens no mesmo veículo não geram um aviso cada. O aviso sai quando o deslocamento é concluído (`concluirOperacao`) e cita as ordens dele: até 10, depois "e mais N".
  - A ocorrência é `deslocamento:<id>`, e a referência é a ordem que encerrou o deslocamento.
  - Uma ordem antiga, sem deslocamento (anterior às fotos), gera o próprio aviso, com a ocorrência `ordem:<id>`.
- **S8, uma por pedido e por decisão:**
  - A ocorrência é `<fase>:<id do pedido>:<solicitada|aprovada|recusada>`.
  - O reenvio com o pedido aberto devolve o mesmo pedido e não avisa de novo. Uma decisão repetida responde 409.
  - Um novo pedido depois de uma recusa é uma nova ocorrência real e avisa de novo.
- **Sempre:** o autor da ação nunca é avisado, e inativos e repetidos são descartados (`publicarNotificacao`).

## Acesso (IDOR) e unidade

- **Referência:** é sempre `ORDEM_SVO` (operação SVO). A central confere o acesso a cada leitura (SCRUM-226) e a fila confere de novo antes do push (SCRUM-229):
  - Administrador e Gestor SVO associado: veem tudo.
  - Motorista SVO: só enquanto é o condutor da ordem.
  - Motorista realocado: vê que houve um aviso, mas sem o conteúdo (`acesso_revogado`).
- **Unidade:** um Gestor SVO sem associação à unidade SVO, o Gestor de Frota e os inativos não recebem.
- **Pedidos sem foto:** o S8 do pedido vai só aos Gestores SVO. O Administrador também pode decidir, mas não é avisado.
- **Agenda (SCRUM-166):** as transições continuam sob o lock da agenda SVO. A publicação usa a mesma transação.
- **Fotos e exceções (SCRUM-203):** a regra das fases compartilhadas continua igual. Uma fase já coberta responde 409 e não gera pedido nem aviso.

## LGPD

- **Push:** só texto fixo, a categoria `SVO` e a tag `svo-excecao-<id>`. Pedido: "Um pedido de autorização aguarda análise." Decisão: "Seu pedido foi aprovado." ou "Seu pedido foi recusado."
- **Central:** cita só o número da ordem e do pedido e a fase. Local da ocorrência, dados do solicitante, motivo e justificativa ficam fora dos avisos, inclusive na central. Quem tem acesso os consulta na tela do pedido.

## Testes

- `avisosSvoS6S8.test.ts`: formato, sem push no S6 e no S7, limite de ordens citadas, motorista inativo e interruptor desligado.
- `avisosSvoS6S8Postgres.test.ts`: de ponta a ponta, com HTTP autenticado, transições reais e fila real com o enviador simulado. Roda com `SCRUM235_POSTGRES_TESTS=1` em `127.0.0.1/frotas_teste`, depois de `npm run migrate`, e está ligado no CI. Cobre:
  - S6 e S7 sem push, nem na fila;
  - um S7 por deslocamento com duas ordens;
  - quem recebe e quem não recebe (autor, sem unidade, inativo, Gestor de Frota);
  - reenvios (chegada repetida, pedido aberto, decisão repetida);
  - rollback quando a publicação falha (chegada, finalização com o deslocamento, pedido);
  - finalização recusada sem aviso;
  - entrega do push e contador do S8;
  - IDOR: outro motorista não lê nem marca, e o motorista realocado perde o conteúdo;
  - ausência de dados sensíveis.
- `evidenciaOdometroPostgres.test.ts`: o fluxo de exceção SVO existente agora confere os avisos S8.
