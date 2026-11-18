# BL28 — Alocação de veículo SVO à ordem de coleta

Escopo: subtarefa **[BE] Implementar alocação de veículo na ordem** da história BL28 (RF22, RN10, RN11 e RN12).
A consulta de veículos disponíveis (`GET /api/veiculos/svo/disponiveis`) é de outra subtarefa, já entregue.

## Como a alocação funciona

A ordem de coleta nasce na confirmação da solicitação (BL27), em `AGUARDANDO_ALOCACAO`, sem recursos.
O veículo é vinculado à ordem pelo endpoint que já existia, `POST /api/viagens` com `tipo_operacao: "SVO"`:

| Campo | Obrigatório | Observação |
|---|---|---|
| `tipo_operacao` | sim | `SVO` |
| `solicitacao_id` | sim | solicitação `CONFIRMADA`, com ordem aguardando alocação |
| `veiculo_id` | sim | veículo da frota SVO |
| `motorista_id` | sim | o banco exige veículo **e** motorista em ordem alocada |
| `equipe_id` | não | a disponibilidade de equipes é tratada na BL29 |
| `capacidade_utilizada` | não | de 1 a 4 óbitos; padrão 1 |

Resposta `200` com a ordem alocada (mesmo identificador gerado na confirmação). Acesso: Gestor SVO e Administrador.

## O que esta entrega faz

As regras de elegibilidade do veículo ficaram em um módulo único e testável sem banco (`services/alocacaoVeiculoSvo.ts`), usado pela alocação, com duas correções para cumprir os critérios da história:

1. **Disponibilidade igual à da consulta (RN10).** A consulta de disponíveis só lista veículos `DISPONIVEL` ou `RESERVADO`, mas a alocação só bloqueava `MANUTENCAO`. Agora um veículo `EM_USO` (ou com qualquer outra situação) também é recusado.
2. **Teto de 4 óbitos na alocação (RN11).** O limite só era validado no cadastro do veículo. Agora vale na entrada (`capacidade_utilizada` de 1 a 4), e a capacidade do veículo usada na conta nunca passa de 4, mesmo que o cadastro tenha um valor maior.

Um teste (`veiculoModel.test.ts`) impede que a consulta de disponíveis e a alocação passem a falar de coisas diferentes: se os status de uma delas mudarem, ele falha.

## Critérios de aceite

| Critério da história | Como é garantido | Resposta |
|---|---|---|
| Só aloca veículo disponível | Veículo precisa ser SVO, estar `DISPONIVEL` ou `RESERVADO`, não estar em deslocamento nem com outro motorista | `400` (frota, manutenção) ou `409` |
| Respeita a capacidade do veículo SVO | Soma das ordens `ALOCADA` e `EM_DESLOCAMENTO` mais o pedido não pode passar de 4 (nem da capacidade do veículo) | `409` com as vagas restantes |
| Impede alocação em veículo lotado (RN12) | Vagas zeradas recusam qualquer pedido | `409` |
| Não depende do frontend | Regras aplicadas no serviço, dentro da transação, com o veículo bloqueado (`FOR UPDATE`) | — |

Ordem de verificação (define a mensagem quando há mais de um impedimento): capacidade pedida acima de 4, frota do veículo, manutenção, em deslocamento, situação do veículo, outro motorista, vagas.

| Situação | Status | Mensagem |
|---|---|---|
| Pedido acima de 4 óbitos | `400` | A capacidade utilizada não pode passar de 4 óbitos por veículo |
| Veículo fora da frota SVO | `400` | O veículo não pertence à frota SVO |
| Veículo em manutenção | `400` | O veículo está em manutenção |
| Veículo com ordem em deslocamento | `409` | O veículo está em deslocamento |
| Veículo `EM_USO` ou outra situação | `409` | O veículo não está disponível para alocação (situação atual: …) |
| Veículo com ordem de outro motorista | `409` | O veículo já está alocado a outro motorista |
| Sem vagas suficientes | `409` | O veículo não tem capacidade suficiente (vagas disponíveis: N) |

Sem migration, sem dependência nova e sem novo endpoint.

## Decisões e pontos em aberto (pendentes de confirmação da equipe)

1. **Alocar só o veículo, sem motorista.** O dicionário de dados e o banco exigem veículo e motorista em ordem `ALOCADA` ou `EM_DESLOCAMENTO`. Uma alocação só do veículo exigiria um estado intermediário e uma migration, que deve ser definida com o responsável pelo banco. Esta entrega mantém o modelo atual.
2. **Limite de 4 óbitos no banco.** Hoje o limite é garantido pela API. Uma restrição no banco (capacidade máxima até 4 para veículos SVO) é recomendada, a encaminhar ao responsável pelo banco.
3. **Período de disponibilidade (SCRUM-166).** A disponibilidade hoje considera a capacidade e a situação atuais do veículo, sem período. Quando a SCRUM-166 permitir agendar ordens com início e término previstos, a regra de sobreposição deve entrar em `alocacaoVeiculoSvo.ts`.
4. **Disponibilidade de equipes (BL29).** A alocação só confere se a equipe existe; a verificação de equipe disponível pertence à BL29.
5. **Troca de veículo em ordem já alocada.** Não faz parte desta subtarefa; hoje exige cancelar a ordem e confirmar a solicitação de novo.

Um veículo que ficou `EM_USO` sem ordem em deslocamento (dado inconsistente) deixa de aceitar alocação, como já não aparecia na consulta de disponíveis; o status deve ser corrigido no cadastro.

## Como verificar

```bash
cd src/backend
npm install
npm run typecheck
npm run build
JWT_SECRET=ci-test-only-secret-not-for-production npm test
```

Testes desta entrega: `alocacaoVeiculoSvo.test.ts` (regras, sem banco), cenários novos em `viagemService.test.ts`, `viagemRoutes.test.ts` e `veiculoModel.test.ts`.

## Validação em ambiente de teste com PostgreSQL (QA)

Os testes usam banco simulado. Roteiro, com `npm run migrate` e `npm run seed` aplicados, um token de Gestor SVO e uma solicitação SVO confirmada por cenário:

| # | Cenário | Esperado | Resultado / evidência |
|---|---|---|---|
| 1 | Alocar veículo SVO `DISPONIVEL` com 1 óbito | `200`; ordem `ALOCADA`; veículo `RESERVADO` | |
| 2 | Alocar uma segunda ordem, mesmo motorista, no veículo `RESERVADO` | `200`; vagas diminuem | |
| 3 | Ocupar a última vaga e tentar mais uma | última `200`; seguinte `409` (lotado) | |
| 4 | Pedir 5 óbitos | `400` | |
| 5 | Veículo em manutenção | `400` | |
| 6 | Veículo com ordem em deslocamento | `409` | |
| 7 | Veículo `EM_USO` sem ordem em deslocamento | `409` | |
| 8 | Veículo com ordem de outro motorista | `409` | |
| 9 | Veículo da frota administrativa | `400` | |
| 10 | Duas alocações simultâneas disputando a última vaga (duas conexões) | só uma `200`; a outra `409` | |
| 11 | Perfis sem acesso (Gestor de Frota, motoristas, Solicitante) e sem token | `403` e `401` | |
| 12 | Consulta `GET /api/veiculos/svo/disponiveis` após cada alocação | só veículos que ainda aceitam alocação, com as vagas corretas | |
