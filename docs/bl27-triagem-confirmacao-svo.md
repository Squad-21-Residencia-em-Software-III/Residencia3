# BL27 — Triagem e confirmação SVO

A API permite consultar solicitações SVO para análise e confirmar o atendimento,
gerando a ordem de coleta na mesma transação. Implementa RF20, RF21 e RN09.

## Endpoints

Exigem token JWT e perfil `GESTOR_SVO` ou `ADMINISTRADOR`.

| Método | Rota | Resposta |
|---|---|---|
| GET | `/api/solicitacoes-svo` | `200`, `{ dados, paginacao }` |
| GET | `/api/solicitacoes-svo/:id` | `200`, `{ solicitacao, ordem }`; ordem ativa ou `null` |
| PATCH | `/api/solicitacoes-svo/:id/confirmar` | `201` na geração; `200` na repetição; `{ solicitacao, ordem }` |

A listagem aceita `status`, `pagina` (padrão 1) e `limite` (padrão 20, máximo
100). O detalhe inclui dados do solicitante, local da ocorrência e indicador
de material sensível. A confirmação aceita corpo ausente ou `{}` e rejeita
campos adicionais.

## Confirmação e alocação

- A confirmação muda a solicitação de `EM_TRIAGEM` para `CONFIRMADA` e registra
  `confirmado_por`, `confirmado_em` e auditoria.
- A ordem nasce em `AGUARDANDO_ALOCACAO`, vinculada à solicitação, com capacidade
  utilizada 1 e sem veículo, motorista ou equipe.
- Confirmação, ordem e auditoria são persistidas na mesma transação.
- Repetir a confirmação retorna a ordem existente. Solicitação `CONFIRMADA`
  exige ordem aguardando alocação; `EM_ANDAMENTO` exige ordem alocada ou em
  deslocamento. Estados incompatíveis retornam `409`.
- Solicitações canceladas ou concluídas não podem ser confirmadas.
- `POST /api/viagens` com `tipo_operacao: "SVO"` aloca a ordem existente e retorna
  `200`. Exige solicitação confirmada e ordem aguardando alocação; mantém as
  validações de recursos, CNH e capacidade. Viagens administrativas retornam `201`.
- Ordens aguardando alocação são consultadas pelo detalhe SVO e ficam fora da
  listagem de viagens.
- Cancelar uma ordem alocada sem cancelar a solicitação devolve esta à triagem.
  A confirmação seguinte gera outra ordem, preservando a cancelada no histórico.

Erros: `400` para dados inválidos, `401` sem autenticação, `403` sem permissão,
`404` para solicitação inexistente e `409` para conflito de estado. Seguem o
formato `{ erro }`; erros de validação também incluem `detalhes`.

## Banco de dados

Aplicar `npm run migrate` em `src/backend`. A migration
`20261110120000_bl27_confirmacao_e_ordem_svo.js` adiciona os estados e campos
de confirmação, um índice único de ordem ativa por solicitação e restrições
de recursos conforme o estado da ordem. A confirmação bloqueia a solicitação
com `FOR UPDATE`.

Solicitações legadas em triagem com ordens alocadas/em deslocamento passam a
`EM_ANDAMENTO`; suas ordens são preservadas, com autor/data de confirmação nulos.
Duplicatas ativas e ordens alocadas sem recursos fazem a migration falhar.
O rollback é bloqueado enquanto existirem solicitações `CONFIRMADA` ou ordens
`AGUARDANDO_ALOCACAO`.

## Testes

Em `src/backend`: `npm run typecheck`, `npm test` e `npm run build`.
Os testes cobrem consulta, confirmação, repetição, estados incompatíveis,
validação de entrada, permissões e alocação sem geração de outra ordem.

O script `scripts/validar-bl27.cjs` verifica migrations, dados legados, constraints,
rollback em falhas de ordem/auditoria, execução da viagem e reconfirmação após
cancelamento com PostgreSQL WASM em memória. Para executar em PowerShell:

```powershell
npm install --prefix "$env:TEMP/residencia3-bl27-validation" --no-package-lock --no-save @electric-sql/pglite@0.5.16
npm run build
node scripts/validar-bl27.cjs "$env:TEMP/residencia3-bl27-validation/node_modules/@electric-sql/pglite"
```

O script usa banco isolado e uma conexão; não testa contenção de locks entre
conexões de um servidor PostgreSQL.
