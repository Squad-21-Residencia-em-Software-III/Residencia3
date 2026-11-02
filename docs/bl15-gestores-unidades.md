# BL15 — Associação de gestores às unidades (SCRUM-142, frente FE)

Status: **estrutura entregue com contrato PROVISÓRIO**. A regra (SCRUM-81) e a API (SCRUM-82) ainda não foram confirmadas.

## O que existe
- `src/frontend/src/types/unidade.ts` — tipos `Unidade`, `GestorAssociado`.
- `src/frontend/src/services/api/unidadesApi.ts` — **único arquivo com o contrato** (rotas/campos supostos) e a lista de perfis candidatos a gestor.
- `src/frontend/src/pages/usuarios/GestoresUnidadesSecao.tsx` — seção "Gestores por unidade" (listar, associar, remover; estados de carregando/erro/vazio/sem gestor).
- `UsuariosPage.tsx` — renderiza a seção (somente ADMINISTRADOR, pela rota `/usuarios`).

## Contrato suposto (ajustar quando a SCRUM-82 existir)
- `GET /unidades` → `Unidade[]` com `gestores`
- `POST /unidades/:id/gestores` `{ gestorId }`
- `DELETE /unidades/:id/gestores/:gestorId`
- Candidatos: `GET /usuarios?perfil=&ativo=true` (rota já existente)

## Não presumido (aguardando SCRUM-81)
Lista final de unidades · um ou vários gestores por unidade · perfis elegíveis · relação com a RN02 · comportamento sem gestor · quem define a unidade da solicitação.

## Sem dado simulado
A tela não guarda associação local: sempre recarrega da API após cada ação. Enquanto a API não existir, a seção mostra a mensagem de erro com "Tentar novamente".
