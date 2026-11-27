# SCRUM-196 — contrato de persistência

A SCRUM-198 foi integrada à develop pelo PR #169. A migration 20261118113000_scrum_198_equipes_integrantes_designacoes_svo.js implementa as estruturas descritas aqui. A validação do PR #162 foi feita por inspeção do código e testes com mocks. O estado da migration no Neon não foi verificado neste trabalho. Consulte o [relatório da SCRUM-198](validacao-banco-scrum-198.md).

## Estruturas existentes

- `usuarios`: ampliar `chk_usuarios_perfil` para aceitar `INTEGRANTE_SVO`, preservando os perfis atuais. A regra `chk_usuarios_tipo_usuario` deve continuar coerente: para esse perfil, `tipo_usuario` deve ser `INTEGRANTE_SVO`.
- `equipes_svo`: preservar `id` e `nome_equipe`, com identificador gerado pelo banco. Definir unicidade para nomes normalizados (por exemplo, `lower(btrim(nome_equipe))`), tratando duplicidades legadas antes de criar índice único; não mesclar nem apagar registros automaticamente.
- `veiculos.lotacao_cabine`: utilizar como número de lugares incluindo o motorista; é nullable no schema atual. Ausência de lotação deve impedir designação com equipe até regularização, sem valor presumido. Não confundir com `capacidade_maxima` para corpos.
- `ordens_svo`: `inicio_previsto` e `fim_previsto` representam reservas; `data_hora_saida` e `data_hora_conclusao` representam início e término reais. Preservar registros antigos e `escalas_svo`.

## Vínculos de equipe

Tabela `equipes_svo_integrantes`: chave primária gerada `id`; `equipe_id` e `usuario_id` obrigatórios com FKs para `equipes_svo` e `usuarios`, exclusão restrita; `vinculado_em` obrigatório com fuso, `desvinculado_em` anulável com verificação de ordem temporal. As operações registram autor e ação em `auditorias`. Índice único parcial por `(equipe_id, usuario_id)` para vínculo ativo e índices de pesquisa por usuário e equipe. O mesmo usuário pode ter vínculos simultâneos com equipes distintas. Evitar exclusão física de vínculos históricos.

## Designações

Tabela `ordens_svo_integrantes`: chave primária gerada; `ordem_id`, `equipe_id`, `usuario_id`, `designado_em`, `designado_por` obrigatórios; campos anuláveis `revogado_em`, `revogado_por` para preservar alterações; referências com exclusão restrita a ordem, equipe e usuários. Restrição temporal de revogação posterior à designação; índice único parcial por `(ordem_id, usuario_id)` para designação ativa; índices por `(usuario_id, ordem_id)` e por ordem para conflito e consulta pessoal. Revisar a integridade da equipe da ordem e do vínculo ativo na mesma transação, inclusive em reprogramações; FKs isoladas não garantem essas regras temporais.

As designações válidas no início real constituem histórico de participação e não podem ser apagadas nem alteradas pelo fluxo comum. O histórico concluído é consultável pela designação, mesmo depois do desligamento da equipe. Para desvincular uma pessoa com designações futuras não iniciadas, bloquear a desvinculação até regularização pelo gestor, sem apagar história.

## Concorrência e integração

O backend deverá executar designação, reprogramação, alteração de veículo e desvinculação relevantes sob o mesmo `pg_advisory_xact_lock(166, 182)` já usado na agenda, com transação e bloqueios de linha na ordem consistente. Validar usuário ativo e perfil, vínculo ativo com equipe, intervalo e lotação antes de persistir. Uma ordem em deslocamento ocupa seus integrantes até `data_hora_conclusao`, mesmo após o fim previsto. A reavaliação da fila deverá reconhecer disputas entre equipes diferentes pelo mesmo integrante. Verificar também permissões de aplicação, migrations reversíveis sem apagar histórico e testes de concorrência em PostgreSQL isolado, antes de disponibilizar a funcionalidade.

A migration define a unicidade do nome normalizado da equipe, índices parciais de vínculos e designações ativos, FKs com exclusão restrita e consistência temporal das revogações. O PR #162 utiliza essas estruturas e mantém a verificação de vínculo ativo, disponibilidade e cabine na transação da aplicação. Gabriel Arruda deve confirmar a versão do esquema no ambiente de homologação antes dos testes de concorrência e rollback.

## Integração após revisão de QA

A disponibilidade e a consulta de designações ativas usam os índices documentados na SCRUM-198. A role de aplicação tem SELECT, INSERT e UPDATE nas tabelas históricas e acesso às sequências necessárias. O reagendamento com a mesma equipe preserva as designações ativas quando integrantes_ids é omitido. Uma substituição explícita revoga os vínculos da ordem que deixaram de valer e registra as novas designações na mesma transação.


## Ordens anteriores à designação individual

A fila continua avaliando ordens legadas com equipe pelos recursos efetivamente registrados: equipe, veículo e motorista. Uma ordem sem designações não oferece evidência de quais pessoas estiveram ocupadas e não aparece em Minhas coletas de um integrante apenas por ele pertencer à equipe. A consulta de designações devolve a equipe e uma lista vazia. Uma ordem já iniciada pode ser concluída pelo condutor vinculado. Uma ordem legada ainda agendada pode seguir a operação prevista ou ser reprogramada observando a regra atual: registrar integrantes elegíveis se a equipe for mantida, ou remover a equipe explicitamente.

Na SCRUM-198, inventariar no ambiente isolado a quantidade de ordens com equipe e sem designação por estado, antes e depois da migration. Preservar os IDs, a equipe, os estados e os horários legados. Não fazer backfill de participantes por vínculo atual, nem impor uma regra que exija participantes de ordens históricas sem evidência. Se a migration precisar distinguir registros anteriores ao corte, combinar o critério com a área de produto e validar a compatibilidade com a fila e os endpoints. Em ordens pendentes, a regularização cabe ao gestor antes de persistir nova programação. Testar conclusão de ordem legada sem criar designação, manutenção da consulta por equipe e ausência de concessão de acesso pessoal indevido.


## Compatibilidade com BL31 e fila SVO

A BL31 ([PR #164](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/164)) acrescenta `NO_LOCAL` às constraints e aos índices de ordens ativas. O endpoint de chegada, `PATCH /api/viagens/ordens-svo/:id/chegar-local`, usa a mesma trava de agenda e muda o estado de `EM_DESLOCAMENTO` para `NO_LOCAL`. A chegada não altera designações nem equivale à conclusão. As relações da SCRUM-198 continuam referenciando a ordem pelo ID. O status e os horários pertencem à ordem. Os índices de designações ativas continuam condicionados a `revogado_em IS NULL`. Conferir no esquema combinado se consultas e constraints que distinguem ordem ativa reconhecem `NO_LOCAL`.

O [PR #157](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/157) fornece `ordens_svo.liberada_em` e `alertas_atraso_svo`, incluindo unicidade por par de ordens e resolução com `resolvido_em`. O contrato da fila usa esses campos também quando a ordem retém recursos em `NO_LOCAL`. A conclusão real resolve alertas e pode liberar a próxima reserva sem gravar saída, km ou mudar seu status. A coluna `solicitacoes_viagem.material_sensivel` do #157 é da frota administrativa e não fornece dados para Minhas coletas.

Para validar em ambiente isolado, conferir a composição do backend com #164 antes de ativar a suíte BL31. Aplicar o esquema revisado da SCRUM-198 e as dependências #157 e #164 nesse ambiente conforme orientação da frente DB. A suíte de agenda usa `AGENDA_SVO_POSTGRES_TESTS=1` e exige o banco local descartável `fsph_agenda_svo_teste` em `127.0.0.1:55432`. A suíte de chegada exige também `CHEGADA_AGENDA_SVO_POSTGRES_TESTS=1` e o endpoint da BL31 disponível. Revisar nomes, constraints, permissões e fixtures contra a migration definitiva antes da execução. O #162 não transporta migrations desses PRs.
Ao reconciliar os trechos de serviço comuns ao #162 e ao #164, preservar a transição de chegada da BL31 e usar a mesma classificação de ordens em curso na agenda, na fila e na sincronização dos recursos. O #164 também cobre disponibilidade e capacidade de veículos, manutenção e ordens ativas da solicitação.
