# BL27 — Triagem, confirmação e recusa SVO

A API permite consultar solicitações SVO para análise e confirmar ou recusar o
atendimento. A confirmação gera a ordem de coleta na mesma transação; a recusa
exige justificativa e encerra a solicitação sem gerar ordens. Implementa RF20,
RF21 e RN09.

## Endpoints

Exigem token JWT e perfil `GESTOR_SVO` ou `ADMINISTRADOR`.

| Método | Rota | Resposta |
|---|---|---|
| GET | `/api/solicitacoes-svo` | `200`, `{ dados, paginacao }` |
| GET | `/api/solicitacoes-svo/:id` | `200`, campos da solicitação + `ordem` (ordem ativa ou `null`) |
| PATCH | `/api/solicitacoes-svo/:id/confirmar` | `201` na geração; `200` na repetição; `{ solicitacao, ordem }` |
| PATCH | `/api/solicitacoes-svo/:id/recusar` | `200`, `{ solicitacao }` com `status: "RECUSADA"` e `motivo_recusa` |

A listagem aceita `status`, `pagina` (padrão 1) e `limite` (padrão 20, máximo
100). O detalhe inclui dados do solicitante, local da ocorrência, indicador de
material sensível e `motivo_recusa` (quando recusada). A confirmação aceita
corpo ausente ou `{}` e rejeita campos adicionais.

## Recusa da solicitação (RF20)

- Endpoint `PATCH /api/solicitacoes-svo/:id/recusar` exige corpo JSON com
  `motivo_recusa` (ou `motivo`) não vazio após `trim()`, de 1 a 500 caracteres.
- Corpo ausente, vazio, apenas espaços, acima de 500 caracteres ou com campos
  extras retorna `400`.
- Somente solicitações em `EM_TRIAGEM` podem ser recusadas. Tentativas sobre
  solicitações já `RECUSADA`, `CONFIRMADA`, `EM_ANDAMENTO`, `CONCLUIDA` ou
  `CANCELADA` retornam `409`.
- Executa dentro de transação com `FOR UPDATE` (`buscarParaAtualizar`),
  serializando chamadas concorrentes entre si e com `PATCH /:id/confirmar`.
- Persiste `status = 'RECUSADA'` e `motivo_recusa` (coluna `TEXT` existente),
  sem gerar ou cancelar ordens de coleta.
- Registra auditoria no módulo `SOLICITACOES_SVO` com o autor (`usuario_id`),
  data/hora e motivo sanitizado.

## Confirmação e alocação

- A confirmação muda a solicitação de `EM_TRIAGEM` para `CONFIRMADA` e registra
  `confirmado_por`, `confirmado_em` e auditoria.
- A ordem nasce em `AGUARDANDO_ALOCACAO`, vinculada à solicitação, com capacidade
  utilizada 1 e sem veículo, motorista ou equipe.
- Confirmação, ordem e auditoria são persistidas na mesma transação.
- Repetir a confirmação retorna a ordem existente. Solicitação `CONFIRMADA`
  exige ordem aguardando alocação; `EM_ANDAMENTO` exige ordem alocada ou em
  deslocamento. Estados incompatíveis retornam `409`.
- Solicitações recusadas, canceladas ou concluídas não podem ser confirmadas.
- `POST /api/viagens` com `tipo_operacao: "SVO"` aloca a ordem existente e retorna
  `200`. Exige solicitação confirmada e ordem aguardando alocação; mantém as
  validações de recursos, CNH e capacidade. Viagens administrativas retornam `201`.
  **Atenção, front:** na alocação SVO o status de sucesso é `200`, não `201`,
  porque nenhuma ordem nova é criada.
- Ordens aguardando alocação são consultadas pelo detalhe SVO (campo `ordem`) e
  ficam fora da listagem de viagens.
- Em `/api/viagens`, o `inicio_previsto` das ordens SVO é o `data_hora_chamado`,
  preenchido quando a ordem é gerada, ou seja, no momento da confirmação.
- `PATCH /api/viagens/:id/cancelar` com `{ "tipo_operacao": "SVO" }` cancela a
  ordem **aguardando alocação** ou **alocada** (o `id` da ordem vem do detalhe
  SVO). Sem `cancelar_solicitacao`, a solicitação volta à triagem e
  `confirmado_por`/`confirmado_em` são limpos; com `cancelar_solicitacao: true`,
  a solicitação é cancelada e a confirmação fica registrada. A ordem aguardando
  alocação não tem veículo nem motorista, então não há recursos a liberar. A
  confirmação seguinte gera outra ordem, preservando a cancelada no histórico.
- A auditoria usa o módulo `SOLICITACOES_SVO`, o mesmo do registro (BL26).

Erros: `400` para dados inválidos, `401` sem autenticação, `403` sem permissão,
`404` para solicitação inexistente e `409` para conflito de estado. Seguem o
formato `{ erro }`; erros de validação também incluem `detalhes`.

## Banco de dados

Aplicar `npm run migrate` em `src/backend`. A migration
`20261112120000_bl27_confirmacao_e_ordem_svo.js` roda depois da
`20261111140211_ajustes_solicitacoes_svo.js` (que já criou a coluna
`motivo_recusa` e os status `CONFIRMADA` e `RECUSADA`) e adiciona
`confirmado_por`, `confirmado_em` (`timestamptz`), o estado
`AGUARDANDO_ALOCACAO` das ordens, um índice único de ordem ativa por solicitação
e restrições de recursos conforme o estado da ordem. A confirmação e a recusa
bloqueiam a solicitação com `FOR UPDATE`.

Solicitações legadas em triagem com ordens alocadas/em deslocamento passam a
`EM_ANDAMENTO`; suas ordens são preservadas, com autor/data de confirmação nulos.
Duplicatas ativas e ordens alocadas sem recursos fazem a migration falhar.
O rollback é bloqueado enquanto existirem ordens `AGUARDANDO_ALOCACAO`. A
constraint de status das solicitações (com `CONFIRMADA` e `RECUSADA`) pertence à
migration 20261111140211 e não é alterada no rollback; as colunas
`confirmado_por`/`confirmado_em` são removidas.

## Testes

Em `src/backend`: `npm run typecheck`, `npm test` e `npm run build`.
Os testes cobrem consulta, confirmação, repetição, recusa com justificativa
obrigatória, concorrência entre recusa e confirmação, estados incompatíveis,
validação de entrada, permissões, alocação sem geração de outra ordem e
cancelamento da ordem aguardando alocação. Listagem e paginação ficam em
`solicitacaoSvoRoutes.test.ts` (BL26).