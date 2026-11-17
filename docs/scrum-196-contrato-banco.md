# SCRUM-196: contrato proposto para persistência

Proposta para revisão de Gabriel Arruda na SCRUM-198. Este documento não representa uma migration aplicada. O backend desta branch utiliza os nomes abaixo; a nomenclatura e os detalhes devem ser confirmados com a frente de banco antes da integração. Não alterar o banco compartilhado por este PR.

## Estruturas existentes

- `usuarios`: ampliar `chk_usuarios_perfil` para aceitar `INTEGRANTE_SVO`, preservando os perfis atuais. A regra `chk_usuarios_tipo_usuario` deve continuar coerente: para esse perfil, `tipo_usuario` deve ser `INTEGRANTE_SVO`.
- `equipes_svo`: preservar `id` e `nome_equipe`, com identificador gerado pelo banco. Definir unicidade para nomes normalizados (por exemplo, `lower(btrim(nome_equipe))`), tratando duplicidades legadas antes de criar índice único; não mesclar nem apagar registros automaticamente.
- `veiculos.lotacao_cabine`: utilizar como número de lugares incluindo o motorista; é nullable no schema atual. Ausência de lotação deve impedir designação com equipe até regularização, sem valor presumido. Não confundir com `capacidade_maxima` para corpos.
- `ordens_svo`: `inicio_previsto` e `fim_previsto` representam reservas; `data_hora_saida` e `data_hora_conclusao` representam início e término reais. Preservar registros antigos e `escalas_svo`.

## Vínculos de equipe (proposta)

Tabela `equipes_svo_integrantes`: chave primária gerada `id`; `equipe_id` e `usuario_id` obrigatórios com FKs para `equipes_svo` e `usuarios`, exclusão restrita; `vinculado_em` obrigatório com fuso, `desvinculado_em` anulável com verificação de ordem temporal. As operações registram autor e ação em `auditorias`. Índice único parcial por `(equipe_id, usuario_id)` para vínculo ativo e índices de pesquisa por usuário e equipe. O mesmo usuário pode ter vínculos simultâneos com equipes distintas. Evitar exclusão física de vínculos históricos.

## Designações (proposta)

Tabela `ordens_svo_integrantes`: chave primária gerada; `ordem_id`, `equipe_id`, `usuario_id`, `designado_em`, `designado_por` obrigatórios; campos anuláveis `revogado_em`, `revogado_por` para preservar alterações; referências com exclusão restrita a ordem, equipe e usuários. Restrição temporal de revogação posterior à designação; índice único parcial por `(ordem_id, usuario_id)` para designação ativa; índices por `(usuario_id, ordem_id)` e por ordem para conflito e consulta pessoal. Revisar a integridade da equipe da ordem e do vínculo ativo na mesma transação, inclusive em reprogramações; FKs isoladas não garantem essas regras temporais.

As designações válidas no início real constituem histórico de participação e não podem ser apagadas nem alteradas pelo fluxo comum. O histórico concluído é consultável pela designação, mesmo depois do desligamento da equipe. Para desvincular uma pessoa com designações futuras não iniciadas, bloquear a desvinculação até regularização pelo gestor, sem apagar história.

## Concorrência e integração

O backend deverá executar designação, reprogramação, alteração de veículo e desvinculação relevantes sob o mesmo `pg_advisory_xact_lock(166, 182)` já usado na agenda, com transação e bloqueios de linha na ordem consistente. Validar usuário ativo e perfil, vínculo ativo com equipe, intervalo e lotação antes de persistir. Uma ordem em deslocamento ocupa seus integrantes até `data_hora_conclusao`, mesmo após o fim previsto. A reavaliação da fila deverá reconhecer disputas entre equipes diferentes pelo mesmo integrante. Verificar também permissões de aplicação, migrations reversíveis sem apagar histórico e testes de concorrência em PostgreSQL isolado, antes de disponibilizar a funcionalidade.

A aplicação da branch consome os campos descritos, mas a compatibilidade real ainda não foi validada em PostgreSQL. Devem ser combinados nomes definitivos, regras de compatibilidade, tratamento de dados legados, privilégios e sequência de deploy antes de integrar. Nenhum DDL, seed ou dado foi alterado neste trabalho.
