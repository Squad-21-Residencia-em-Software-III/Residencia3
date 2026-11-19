# Dicionário de Dados - Gestão de Frotas

## 1. Tabela: `fornecedores`
Armazena os dados das entidades que prestam serviços de manutenção ou fornecem combustível.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do fornecedor. |
| `nome` | Varchar(255) | NOT NULL | Nome da empresa ou fornecedor. |
| `cnpj` | Varchar(20) | NOT NULL, UNIQUE | CNPJ do fornecedor. |
| `tipo_servico` | Varchar(100) | NULLABLE | Categoria do serviço prestado. |
| `contrato` | Varchar(100) | NULLABLE | Número ou referência do contrato. |

## 2. Tabela: `usuarios`
Armazena os utilizadores com acesso ao sistema e as respetivas credenciais e perfis.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do utilizador. |
| `nome` | Varchar(255) | NOT NULL | Nome completo. |
| `email` | Varchar(255) | NOT NULL, UNIQUE | Correio eletrónico (índice único em minúsculas). |
| `senha` | Varchar(255) | NOT NULL | Palavra-passe encriptada. |
| `tipo_usuario` | Varchar(50) | NOT NULL | Categoria base (Validação: se o perfil for MOTORISTA_*, o tipo é 'MOTORISTA'; para `INTEGRANTE_SVO` e demais perfis, coincide com `perfil`). |
| `perfil` | Varchar(50) | NOT NULL | CHECK: `ADMINISTRADOR`, `SOLICITANTE`, `GESTOR_FROTA`, `GESTOR_SVO`, `MOTORISTA_FROTA`, `MOTORISTA_SVO`, `INTEGRANTE_SVO`. |
| `ativo` | Boolean | NOT NULL, DEFAULT true | Indica se a conta tem permissão de acesso. |
| `versao_sessao` | Integer | NOT NULL, DEFAULT 1 | Versão da sessão ativa (CHECK: `>= 1`), incrementada na troca ou redefinição de senha para invalidar tokens anteriores. |

## 3. Tabela: `veiculos`
Registo dos veículos pertencentes à frota geral e ao Serviço de Verificação de Óbitos (SVO).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do veículo. |
| `placa` | Varchar(10) | NOT NULL, UNIQUE | Matrícula do veículo. |
| `modelo` | Varchar(100) | NOT NULL | Marca e modelo. |
| `tipo_frota` | Varchar(20) | NOT NULL | CHECK: `ADMINISTRATIVA`, `SVO`. |
| `capacidade_maxima` | Integer | NOT NULL | Lotação de passageiros (frota administrativa) ou capacidade de corpos (SVO, 1 a 4) (CHECK: `>= 0`). |
| `lotacao_cabine` | Integer | NULLABLE | Lotação de pessoas na cabine para veículos SVO, incluindo motorista (CHECK: `IS NULL OR >= 1`). |
| `km_atual` | Integer | NOT NULL, DEFAULT 0 | Quilometragem atual do veículo (CHECK: `>= 0`). |
| `status` | Varchar(30) | NOT NULL, DEFAULT 'DISPONIVEL' | CHECK: `DISPONIVEL`, `RESERVADO`, `EM_USO`, `MANUTENCAO`. |

## 4. Tabela: `equipes_svo`
Registo das equipas alocadas ao serviço SVO.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador da equipa. |
| `nome_equipe` | Varchar(100) | NOT NULL, CHECK: `length(btrim(nome_equipe)) > 0` | Nome ou identificação da equipa de SVO (índice único funcional `uq_equipes_svo_nome_normalizado` em `lower(btrim(nome_equipe))`). |

## 5. Tabela: `auditorias`
Registo de ações realizadas no sistema (logs de segurança).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do log. |
| `usuario_id` | Integer | FOREIGN KEY | Ligação à tabela `usuarios` (RESTRICT). |
| `acao` | Varchar(255) | NOT NULL | Descrição da ação executada. |
| `modulo` | Varchar(100) | NOT NULL | Módulo afetado pela ação. |
| `data_hora` | Timestamptz | DEFAULT now() | Data e hora exatas da operação (com fuso horário). |

## 6. Tabela: `motoristas`
Registo detalhado das habilitações dos utilizadores com perfil de condução.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do motorista. |
| `usuario_id` | Integer | FOREIGN KEY | Ligação à conta na tabela `usuarios` (RESTRICT). |
| `numero_cnh` | Varchar(20) | NOT NULL, UNIQUE | Número da carta de condução. |
| `categoria_cnh` | Varchar(5) | NOT NULL | Categoria da carta (Ex: B, C, D). |
| `validade_cnh` | Date | NOT NULL | Data de validade do documento. |
| `tipo_motorista` | Varchar(20) | NOT NULL | CHECK: `FROTA`, `SVO`. |
| `status` | Varchar(30) | NOT NULL, DEFAULT 'DISPONIVEL' | CHECK: `DISPONIVEL`, `DESIGNADO`, `EM_VIAGEM`, `INATIVO`, `AFASTADO`. |

## 7. Tabela: `manutencoes`
Histórico de manutenções preventivas e corretivas da frota.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador da intervenção. |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo intervencionado (RESTRICT). |
| `fornecedor_id` | Integer | FOREIGN KEY | Oficina responsável (RESTRICT). |
| `tipo_manutencao` | Varchar(50) | NOT NULL | CHECK: `PREVENTIVA`, `CORRETIVA`. |
| `data_manutencao` | Date | NOT NULL | Data da intervenção. |
| `descricao` | Text | NOT NULL | Detalhamento do serviço. |
| `custo` | Decimal(10,2) | NOT NULL | CHECK: `>= 0`. |
| `status` | Varchar(30) | NOT NULL, DEFAULT 'AGENDADA' | CHECK: `AGENDADA`, `EM_ANDAMENTO`, `CONCLUIDA`. |

## 8. Tabela: `documentos_veiculo`
Controlo de documentação legal e seguros dos veículos.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do documento. |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo associado (RESTRICT). |
| `tipo` | Varchar(100) | NOT NULL | Natureza do documento (Ex: Seguro, Inspeção). |
| `data_vencimento` | Date | NOT NULL | Data limite de validade legal. |

## 9. Tabela: `solicitacoes_viagem`
Pedidos de deslocação da frota administrativa.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do pedido. |
| `solicitante_id` | Integer | FOREIGN KEY | Utilizador que realizou o pedido (RESTRICT). |
| `unidade_id` | Integer | FOREIGN KEY, NULLABLE | Unidade da FSPH vinculada ao pedido (`unidades.id`, RESTRICT). |
| `origem` | Varchar(255) | NOT NULL | Ponto de partida. |
| `destino` | Varchar(255) | NOT NULL | Local de chegada. |
| `finalidade` | Text | NOT NULL | Motivo da deslocação. |
| `material_sensivel` | Boolean | NOT NULL, DEFAULT false | Indica se o deslocamento envolve transporte de material sensível (ex.: amostras biológicas/hemocomponentes). |
| `data_saida_desejada` | Timestamptz | NOT NULL | Início planeado (com fuso horário). |
| `data_chegada_desejada`| Timestamptz | NULLABLE, CHECK: `>= data_saida_desejada` | Fim planeado da viagem (com fuso horário). |
| `status` | Varchar(30) | NOT NULL, DEFAULT 'PENDENTE_APROVACAO' | CHECK: `PENDENTE_APROVACAO`, `APROVADA`, `AGENDADA`, `CONCLUIDA`, `RECUSADA`, `CANCELADA`. |
| `motivo_recusa` | Text | NULLABLE | Justificativa gravada na recusa da solicitação (migration 20261104133113). |

## 10. Tabela: `solicitacoes_svo`

Triagem de pedidos para o Serviço de Verificação de Óbitos.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do pedido de SVO. |
| `registrante_id` | Integer | FOREIGN KEY, NOT NULL | Utilizador que registou a ocorrência (RESTRICT). |
| `dados_solicitante` | Text | NOT NULL | Informação de quem contactou a instituição. |
| `local_ocorrencia` | Varchar(255) | NOT NULL | Morada do incidente. |
| `observacoes` | Text | NULLABLE | Dados complementares da ocorrência e causa/contexto do óbito para triagem (RF20). |
| `material_sensivel` | Boolean | NOT NULL, DEFAULT false | Exige protocolos específicos de transporte. |
| `status` | Varchar(30) | NOT NULL, DEFAULT 'EM_TRIAGEM' | CHECK: `EM_TRIAGEM`, `CONFIRMADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `RECUSADA`, `CANCELADA`. |
| `motivo_recusa` | Text | NULLABLE | Justificativa quando a solicitação é recusada na triagem (ex.: encaminhamento ao IML). |
| `criado_em` | Timestamptz | NOT NULL, DEFAULT now() | Data e hora do registo do chamado para ordenação da fila e cálculo de SLA. |
| `confirmado_por` | Integer | NULLABLE, FOREIGN KEY | Usuário que realizou a última confirmação (RESTRICT). Nulo em dados legados e limpo quando a solicitação volta à triagem. |
| `confirmado_em` | Timestamptz | NULLABLE | Horário da última confirmação, definido pelo banco. Nulo em dados legados e limpo quando a solicitação volta à triagem. |

Veja o [contrato BL27](bl27-triagem-confirmacao-svo.md) para confirmação e geração automática da ordem.

## 11. Tabela: `escalas_svo`
Planeamento de horários das equipas SVO.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do turno. |
| `equipe_id` | Integer | FOREIGN KEY | Equipa escalada (RESTRICT). |
| `data_inicio` | Timestamptz | NOT NULL | Início do turno (com fuso horário). |
| `data_fim` | Timestamptz | NOT NULL, CHECK: `>= data_inicio` | Fim do turno (com fuso horário). |

## 12. Tabela: `multas`
Armazena o registo de infrações de trânsito vinculadas aos veículos e motoristas.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único da multa. |
| `veiculo_id` | Integer | FOREIGN KEY | Vínculo com a tabela `veiculos` (RESTRICT). |
| `motorista_id` | Integer | FOREIGN KEY | Vínculo com a tabela `motoristas` (RESTRICT). |
| `id_infracao` | Varchar(255) | NULLABLE | Código da infração registado pelo Detran. |
| `orgao_autuador` | Varchar(255) | NULLABLE | Entidade responsável pela autuação (Ex: PRF, SMTT). |
| `data_infracao` | Timestamptz | NOT NULL | Data e hora exatas da ocorrência da infração (com fuso horário). |
| `data_vencimento`| Date | NULLABLE | Data limite para pagamento com desconto. |
| `status_pagamento`| Varchar(255) | NOT NULL, DEFAULT 'PENDENTE' | CHECK: `PENDENTE`, `PAGO`, `CANCELADO`. |
| `valor` | Decimal(10,2) | NOT NULL | CHECK: `> 0`. |
| `descricao` | Text | NULLABLE | Detalhes adicionais. |
| `pontos` | Integer | NOT NULL | CHECK: `>= 0`. |

## 13. Tabela: `abastecimentos`
Controlo de consumo de combustível da frota.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do abastecimento. |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo abastecido (RESTRICT). |
| `motorista_id` | Integer | FOREIGN KEY | Motorista que conduzia (RESTRICT). |
| `fornecedor_id` | Integer | FOREIGN KEY | Empresa que forneceu o combustível (RESTRICT). |
| `data_abastecimento`| Date | NOT NULL | Data do evento. |
| `quilometragem` | Integer | NOT NULL | CHECK: `>= 0`. |
| `litros` | Decimal(10,2) | NOT NULL | CHECK: `> 0`. |
| `valor_total` | Decimal(10,2) | NOT NULL | CHECK: `> 0`. |
| `posto_combustivel` | Varchar(150) | NULLABLE | Nome comercial da estação de serviço. |

## 14. Tabela: `viagens_frota`
Execução efetiva das deslocações administrativas aprovadas.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador da viagem. |
| `solicitacao_id` | Integer | FOREIGN KEY | Pedido de origem (RESTRICT). |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo utilizado (RESTRICT). |
| `motorista_id` | Integer | FOREIGN KEY | Motorista encarregue (RESTRICT). |
| `km_inicial` | Integer | NULLABLE | CHECK: `>= 0`. |
| `km_final` | Integer | NULLABLE | CHECK: `>= km_inicial`. |
| `data_hora_efetiva_saida` | Timestamptz | NULLABLE | Hora de início real (com fuso horário). |
| `data_hora_efetiva_chegada`| Timestamptz | NULLABLE | Hora de conclusão real (com fuso horário). |
| `status` | Varchar(30) | NOT NULL, DEFAULT 'AGENDADA' | CHECK: `AGENDADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`. |

## 15. Tabela: `ordens_svo`
Geração, alocação e execução de chamadas do Serviço de Verificação de Óbitos.
Só pode existir uma ordem ativa (`AGUARDANDO_ALOCACAO`, `ALOCADA` ou
`EM_DESLOCAMENTO`) por solicitação. Ordens aguardando alocação não possuem
veículo, motorista ou equipe; alocadas/em deslocamento exigem veículo e motorista.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador da ordem. |
| `solicitacao_id` | Integer | FOREIGN KEY | Triagem vinculada (RESTRICT). |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo de transporte alocado (RESTRICT). |
| `motorista_id` | Integer | FOREIGN KEY | Condutor do SVO (RESTRICT). |
| `equipe_id` | Integer | FOREIGN KEY | Profissionais alocados (RESTRICT). |
| `capacidade_utilizada`| Integer | NOT NULL, DEFAULT 1 | CHECK: `> 0`. |
| `data_hora_chamado` | Timestamptz | DEFAULT now() | Momento de geração da ordem (com fuso horário). |
| `inicio_previsto` | Timestamptz | NULLABLE | Início previsto do agendamento da coleta SVO (SCRUM-176, com fuso horário). |
| `fim_previsto` | Timestamptz | NULLABLE, CHECK: `> inicio_previsto` | Término previsto do agendamento da coleta SVO (SCRUM-176, com fuso horário). |
| `liberada_em` | Timestamptz | NULLABLE, DEFAULT NULL | Instante em que a fila SVO liberou a ordem para início (SCRUM-183). Não equivale à saída efetiva nem altera status/km. |
| `data_hora_saida` | Timestamptz | NULLABLE | Momento de início do deslocamento (com fuso horário). |
| `data_hora_conclusao`| Timestamptz | NULLABLE, CHECK: `>= data_hora_saida` | Regresso e término da operação (com fuso horário). |
| `km_inicial` | Integer | NULLABLE | CHECK: `>= 0`. |
| `km_final` | Integer | NULLABLE | CHECK: `>= km_inicial`. |
| `status` | Varchar(30) | NOT NULL, DEFAULT 'AGUARDANDO_ALOCACAO' | CHECK: `AGUARDANDO_ALOCACAO`, `ALOCADA`, `EM_DESLOCAMENTO`, `CONCLUIDA`, `CANCELADA`. |

## 16. Tabela: `unidades`
Unidades da FSPH disponíveis para encaminhamento e gestão de solicitações (BL15).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único da unidade. |
| `nome` | Varchar(50) | NOT NULL, UNIQUE | CHECK: `SVO`, `HEMOSE`, `LACEN`. |
| `tipo` | Varchar(30) | NOT NULL | CHECK: `SVO`, `ADMINISTRATIVA`. |

## 17. Tabela: `gestores_unidades`
Relação associativa (N:N) entre gestores e unidades da FSPH (BL15).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `unidade_id` | Integer | PRIMARY KEY, FOREIGN KEY | Unidade gerida (`unidades.id`, CASCADE). |
| `usuario_id` | Integer | PRIMARY KEY, FOREIGN KEY | Utilizador gestor associado (`usuarios.id`, CASCADE, indexado). |


## 18. Tabela: `alertas_atraso_svo`
Registo de alertas gerados automaticamente quando uma coleta SVO em andamento (`EM_DESLOCAMENTO`) ultrapassa o seu `fim_previsto` e retém recursos (veículo, motorista ou equipa) alocados para outra ordem agendada (`ALOCADA`) cujo `inicio_previsto` já foi atingido (SCRUM-183).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer (Identity) | PRIMARY KEY | Identificador único do alerta (`GENERATED BY DEFAULT AS IDENTITY`). |
| `ordem_em_atraso_id` | Integer | NOT NULL, FOREIGN KEY | Ordem em deslocamento que reteve o recurso (`ordens_svo.id`, `ON DELETE RESTRICT`, `fk_alertas_atraso_svo_atrasada`). |
| `ordem_afetada_id` | Integer | NOT NULL, FOREIGN KEY | Ordem agendada impactada pelo atraso (`ordens_svo.id`, `ON DELETE RESTRICT`, `fk_alertas_atraso_svo_afetada`). |
| `criado_em` | Timestamptz | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Instante de abertura (ou última reabertura) do alerta. |
| `resolvido_em` | Timestamptz | NULLABLE, DEFAULT NULL | Instante em que o alerta foi resolvido (por conclusão da coleta em atraso, reprogramação ou cancelamento da ordem afetada). |

Restrições e índices adicionais:
- `uq_alertas_atraso_svo_ordens`: `UNIQUE (ordem_em_atraso_id, ordem_afetada_id)` (permite reabrir o mesmo alerta limpando `resolvido_em`).
- `chk_alertas_atraso_svo_ordens_distintas`: `CHECK (ordem_em_atraso_id <> ordem_afetada_id)`.
- `idx_alertas_atraso_svo_abertos`: índice parcial em `(ordem_afetada_id) WHERE resolvido_em IS NULL`.

## 19. Tabela: `equipes_svo_integrantes`
Registo de vínculos (atuais e históricos) de integrantes (`INTEGRANTE_SVO`) às equipas do SVO (SCRUM-198). Permite que o mesmo integrante pertença simultaneamente a múltiplas equipas distintas, preservando o histórico após desvinculação lógica (`desvinculado_em`).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer (Identity) | PRIMARY KEY | Identificador único do vínculo (`GENERATED BY DEFAULT AS IDENTITY`). |
| `equipe_id` | Integer | NOT NULL, FOREIGN KEY | Equipa SVO associada (`equipes_svo.id`, `ON DELETE RESTRICT`, `fk_equipes_svo_integrantes_equipe`). |
| `usuario_id` | Integer | NOT NULL, FOREIGN KEY | Utilizador integrante (`usuarios.id`, `ON DELETE RESTRICT`, `fk_equipes_svo_integrantes_usuario`). |
| `vinculado_em` | Timestamptz | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Instante de início do vínculo com a equipa. |
| `desvinculado_em` | Timestamptz | NULLABLE, DEFAULT NULL | Instante de encerramento do vínculo (`NULL` significa vínculo ativo). |

Restrições e índices adicionais:
- `chk_equipes_svo_integrantes_periodo`: `CHECK (desvinculado_em IS NULL OR desvinculado_em >= vinculado_em)`.
- `uq_equipes_svo_integrantes_ativo`: índice único parcial em `(equipe_id, usuario_id) WHERE desvinculado_em IS NULL`.
- `idx_equipes_svo_integrantes_usuario_ativo`: índice parcial em `(usuario_id, equipe_id) WHERE desvinculado_em IS NULL`.
- `idx_equipes_svo_integrantes_equipe`: índice em `(equipe_id)`.

## 20. Tabela: `ordens_svo_integrantes`
Registo de designações nominais individuais de integrantes para cada ordem de coleta SVO, incluindo auditoria de autoria e revogação lógica pré-início (SCRUM-198).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer (Identity) | PRIMARY KEY | Identificador único da designação (`GENERATED BY DEFAULT AS IDENTITY`). |
| `ordem_id` | Integer | NOT NULL, FOREIGN KEY | Ordem de coleta SVO (`ordens_svo.id`, `ON DELETE RESTRICT`, `fk_ordens_svo_integrantes_ordem`). |
| `equipe_id` | Integer | NOT NULL, FOREIGN KEY | Equipa SVO pela qual o integrante foi designado (`equipes_svo.id`, `ON DELETE RESTRICT`, `fk_ordens_svo_integrantes_equipe`). |
| `usuario_id` | Integer | NOT NULL, FOREIGN KEY | Integrante designado (`usuarios.id`, `ON DELETE RESTRICT`, `fk_ordens_svo_integrantes_usuario`). |
| `designado_em` | Timestamptz | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Instante da designação. |
| `designado_por` | Integer | NOT NULL, FOREIGN KEY | Utilizador que efetuou a designação (`usuarios.id`, `ON DELETE RESTRICT`, `fk_ordens_svo_integrantes_designado_por`). |
| `revogado_em` | Timestamptz | NULLABLE, DEFAULT NULL | Instante da revogação lógica (`NULL` significa designação ativa). |
| `revogado_por` | Integer | NULLABLE, DEFAULT NULL, FOREIGN KEY | Utilizador que revogou a designação (`usuarios.id`, `ON DELETE RESTRICT`, `fk_ordens_svo_integrantes_revogado_por`). |

Restrições e índices adicionais:
- `chk_ordens_svo_integrantes_revogacao`: `CHECK ((revogado_em IS NULL AND revogado_por IS NULL) OR (revogado_em IS NOT NULL AND revogado_por IS NOT NULL AND revogado_em >= designado_em))`.
- `uq_ordens_svo_integrantes_ativo`: índice único parcial em `(ordem_id, usuario_id) WHERE revogado_em IS NULL`.
- `idx_ordens_svo_integrantes_usuario_ativo`: índice parcial em `(usuario_id, ordem_id) WHERE revogado_em IS NULL` (atende conflito individual e consulta pessoal `Minhas Coletas`).
- `idx_ordens_svo_integrantes_equipe_usuario_ativo`: índice parcial em `(equipe_id, usuario_id, ordem_id) WHERE revogado_em IS NULL` (atende verificação de designações futuras na desvinculação).
- `idx_ordens_svo_integrantes_ordem`: índice em `(ordem_id)`.

## 21. Tabela: `deslocamentos_svo`
Identidade estável do deslocamento físico real de um veículo SVO, permitindo agrupar uma ou mais ordens de coleta (`ordens_svo`) atendidas na mesma saída física para compartilhar o mesmo par de evidências de odômetro (`SAIDA` e `CHEGADA`) sem duplicar arquivos nem quilometragem (SCRUM-210).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer (Identity) | PRIMARY KEY | Identificador único do deslocamento físico (`GENERATED BY DEFAULT AS IDENTITY`). |
| `veiculo_id` | Integer | NOT NULL, FOREIGN KEY | Veículo SVO utilizado (`veiculos.id`, `ON DELETE RESTRICT`, `fk_deslocamentos_svo_veiculo`). |
| `motorista_id` | Integer | NOT NULL, FOREIGN KEY | Motorista SVO responsável (`motoristas.id`, `ON DELETE RESTRICT`, `fk_deslocamentos_svo_motorista`). |
| `iniciado_por` | Integer | NOT NULL, FOREIGN KEY | Utilizador que registrou a saída (`usuarios.id`, `ON DELETE RESTRICT`, `fk_deslocamentos_svo_iniciado_por`). |
| `finalizado_por` | Integer | NULLABLE, FOREIGN KEY | Utilizador que registrou a chegada (`usuarios.id`, `ON DELETE RESTRICT`, `fk_deslocamentos_svo_finalizado_por`). |
| `km_inicial` | Integer | NOT NULL | CHECK: `>= 0` (`chk_deslocamentos_svo_km_inicial`). |
| `km_final` | Integer | NULLABLE | CHECK: `IS NULL OR >= km_inicial` (`chk_deslocamentos_svo_km_coerente`). |
| `data_hora_saida` | Timestamptz | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Instante real da saída do deslocamento físico. |
| `data_hora_conclusao` | Timestamptz | NULLABLE, DEFAULT NULL | Instante real da conclusão do deslocamento físico (`>= data_hora_saida` quando `CONCLUIDO`). |
| `status` | Varchar(30) | NOT NULL, DEFAULT 'EM_CURSO' | CHECK: `EM_CURSO`, `CONCLUIDO`, `CANCELADO` (`chk_deslocamentos_svo_status` e `chk_deslocamentos_svo_conclusao`). |

Restrições e índices adicionais:
- `uq_deslocamentos_svo_veiculo_em_curso`: índice único parcial em `(veiculo_id) WHERE status = 'EM_CURSO'`.
- `uq_deslocamentos_svo_motorista_em_curso`: índice único parcial em `(motorista_id) WHERE status = 'EM_CURSO'`.
- `idx_deslocamentos_svo_status_conclusao`: índice em `(status, data_hora_conclusao)`.

## 22. Tabela: `deslocamentos_svo_ordens`
Relação associativa que vincula as ordens de coleta (`ordens_svo`) ao deslocamento físico compartilhado (`deslocamentos_svo`), impedindo que uma mesma ordem seja associada a dois deslocamentos distintos (SCRUM-210).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer (Identity) | PRIMARY KEY | Identificador único do vínculo (`GENERATED BY DEFAULT AS IDENTITY`). |
| `deslocamento_svo_id` | Integer | NOT NULL, FOREIGN KEY | Deslocamento físico SVO (`deslocamentos_svo.id`, `ON DELETE RESTRICT`, `fk_deslocamentos_svo_ordens_deslocamento`). |
| `ordem_svo_id` | Integer | NOT NULL, FOREIGN KEY, UNIQUE | Ordem de coleta SVO (`ordens_svo.id`, `ON DELETE RESTRICT`, `uq_deslocamentos_svo_ordens_ordem`). |
| `vinculado_em` | Timestamptz | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Instante em que a ordem foi associada ao deslocamento físico. |
| `vinculado_por` | Integer | NOT NULL, FOREIGN KEY | Utilizador que efetuou o vínculo (`usuarios.id`, `ON DELETE RESTRICT`, `fk_deslocamentos_svo_ordens_usuario`). |

## 23. Tabela: `evidencias_odometro`
Registo imutável dos metadados das evidências fotográficas de odômetro (ou exceções formais autorizadas pelo gestor) na saída e chegada de viagens administrativas e deslocamentos SVO, com controle de retenção de 12 meses contados da conclusão efetiva e suporte a preservação legal (SCRUM-210).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer (Identity) | PRIMARY KEY | Identificador único da evidência (`GENERATED BY DEFAULT AS IDENTITY`). |
| `tipo_operacao` | Varchar(20) | NOT NULL | CHECK: `ADMINISTRATIVA`, `SVO` (`chk_evidencias_odometro_tipo_operacao`). |
| `fase` | Varchar(20) | NOT NULL | CHECK: `SAIDA`, `CHEGADA` (`chk_evidencias_odometro_fase`). |
| `viagem_frota_id` | Integer | NULLABLE, FOREIGN KEY | Viagem administrativa (`viagens_frota.id`, `ON DELETE RESTRICT`; obrigatório quando `ADMINISTRATIVA`, nulo quando `SVO`). |
| `deslocamento_svo_id` | Integer | NULLABLE, FOREIGN KEY | Deslocamento físico SVO (`deslocamentos_svo.id`, `ON DELETE RESTRICT`; obrigatório em `SVO` quando `ATIVA`/`SUBSTITUIDA`/`EXPURGADA_RETENCAO`/`EXCECAO_GESTOR`; pode ser nulo apenas em foto provisória `STAGING`/`REJEITADA` vinculada a `ordem_svo_id` antes do início da coleta). |
| `ordem_svo_id` | Integer | NULLABLE, FOREIGN KEY | Ordem SVO de referência (`ordens_svo.id`, `ON DELETE RESTRICT`; obrigatório em foto provisória `SVO` sem deslocamento; nulo quando `ADMINISTRATIVA`). |
| `veiculo_id` | Integer | NOT NULL, FOREIGN KEY | Veículo da operação (`veiculos.id`, `ON DELETE RESTRICT`). |
| `motorista_id` | Integer | NOT NULL, FOREIGN KEY | Motorista da operação (`motoristas.id`, `ON DELETE RESTRICT`). |
| `motorista_usuario_id` | Integer | NOT NULL, FOREIGN KEY | Conta de utilizador do motorista (`usuarios.id`, `ON DELETE RESTRICT`). |
| `km_registrado` | Integer | NOT NULL | Quilometragem comprovada na fase (`CHECK: >= 0`). |
| `modalidade` | Varchar(20) | NOT NULL, DEFAULT 'FOTO' | CHECK: `FOTO`, `EXCECAO_GESTOR` (`chk_evidencias_odometro_modalidade`). |
| `status` | Varchar(30) | NOT NULL, DEFAULT 'ATIVA' | CHECK: `STAGING`, `ATIVA`, `SUBSTITUIDA`, `REJEITADA`, `EXPURGADA_RETENCAO`. |
| `storage_key` | Varchar(512) | NULLABLE | Chave do objeto no storage privado (proíbe `..`, `data:`, `http:`/`https:`; fica `NULL` após expurgo de retenção ou em `EXCECAO_GESTOR`). |
| `mime_type` | Varchar(100) | NULLABLE | CHECK: `image/jpeg`, `image/png`, `image/webp` (`chk_evidencias_odometro_mime`). |
| `tamanho_bytes` | Integer | NULLABLE | Tamanho do arquivo em bytes (`CHECK: > 0 AND <= 15728640`). |
| `sha256` | Char(64) | NULLABLE | Hash SHA-256 hexadecimal em minúsculas (`^[0-9a-f]{64}$`), preservado mesmo após expurgo do arquivo. |
| `excecao_aprovada_por` | Integer | NULLABLE, FOREIGN KEY | Gestor que autorizou a transição sem foto (`usuarios.id`, `ON DELETE RESTRICT`, obrigatoriamente `<> motorista_usuario_id`). |
| `excecao_aprovada_em` | Timestamptz | NULLABLE | Instante da autorização formal pelo gestor. |
| `excecao_justificativa` | Text | NULLABLE | Justificativa obrigatória quando `modalidade = 'EXCECAO_GESTOR'` (`length(btrim(...)) >= 10`). |
| `conclusao_operacao_em` | Timestamptz | NULLABLE | Marco inicial aprovado da retenção: conclusão efetiva da viagem administrativa ou do deslocamento físico SVO. |
| `retencao_ate` | Timestamptz | NULLABLE | Data mínima de retenção do arquivo (`>= conclusao_operacao_em + interval '12 months'`). |
| `preservacao_legal` | Boolean | NOT NULL, DEFAULT false | Indica bloqueio de expurgo por exigência legal ou auditoria formal. |
| `preservacao_motivo` | Text | NULLABLE | Motivo da preservação legal, quando aplicável. |
| `expurgado_em` | Timestamptz | NULLABLE | Instante do descarte seguro do arquivo no storage após o prazo de 12 meses (`>= retencao_ate`). |
| `expurgado_por` | Integer | NULLABLE, FOREIGN KEY | Utilizador/processo que registrou o expurgo (`usuarios.id`, `ON DELETE RESTRICT`). |
| `expurgo_motivo` | Varchar(100) | NULLABLE | Identificação da política/motivo do descarte rastreável. |
| `registrado_por` | Integer | NOT NULL, FOREIGN KEY | Utilizador que registrou a evidência (`usuarios.id`, `ON DELETE RESTRICT`). |
| `auditoria_id` | Integer | NULLABLE, FOREIGN KEY | Registo de auditoria associado (`auditorias.id`, `ON DELETE RESTRICT`). |
| `criado_em` | Timestamptz | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Instante de criação do registo de metadados. |

Restrições e índices adicionais:
- `uq_evidencias_odometro_viagem_frota_fase_ativa`: `UNIQUE (viagem_frota_id, fase) WHERE tipo_operacao = 'ADMINISTRATIVA' AND status IN ('ATIVA', 'EXPURGADA_RETENCAO')`.
- `uq_evidencias_odometro_deslocamento_svo_fase_ativa`: `UNIQUE (deslocamento_svo_id, fase) WHERE tipo_operacao = 'SVO' AND status IN ('ATIVA', 'EXPURGADA_RETENCAO')`.
- `uq_evidencias_odometro_storage_key`: `UNIQUE (storage_key) WHERE storage_key IS NOT NULL`.
- `idx_evidencias_odometro_retencao_pendente`: índice parcial em `(retencao_ate) WHERE modalidade = 'FOTO' AND status = 'ATIVA' AND preservacao_legal = false AND retencao_ate IS NOT NULL`.
- `idx_evidencias_odometro_operacao_criado`: índice em `(tipo_operacao, criado_em DESC, id DESC)`.


