 Dicionário de Dados - Gestão de Frotas

 1. Tabela: `fornecedores`
Armazena os dados das entidades que prestam serviços de manutenção ou fornecem combustível.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do fornecedor. |
| `nome` | Varchar(255) | NOT NULL | Nome da empresa ou fornecedor. |
| `cnpj` | Varchar(20) | NOT NULL, UNIQUE | CNPJ do fornecedor. |
| `tipo_servico` | Varchar(100) | NULLABLE | Categoria do serviço prestado. |
| `contrato` | Varchar(100) | NULLABLE | Número ou referência do contrato. |

 2. Tabela: `usuarios`
Armazena os utilizadores com acesso ao sistema e as respetivas credenciais e perfis.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do utilizador. |
| `nome` | Varchar(255) | NOT NULL | Nome completo. |
| `email` | Varchar(255) | NOT NULL, UNIQUE | Correio eletrónico (índice único em minúsculas). |
| `senha` | Varchar(255) | NOT NULL | Palavra-passe encriptada. |
| `tipo_usuario` | Varchar(50) | NOT NULL | Categoria base (Validação: se o perfil for MOTORISTA_*, o tipo é 'MOTORISTA'). |
| `perfil` | Varchar(50) | NOT NULL | CHECK: `ADMINISTRADOR`, `SOLICITANTE`, `GESTOR_FROTA`, `GESTOR_SVO`, `MOTORISTA_FROTA`, `MOTORISTA_SVO`. |
| `ativo` | Boolean | NOT NULL, DEFAULT true | Indica se a conta tem permissão de acesso. |

 3. Tabela: `veiculos`
Registo dos veículos pertencentes à frota geral e ao Serviço de Verificação de Óbitos (SVO).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do veículo. |
| `placa` | Varchar(10) | NOT NULL, UNIQUE | Matrícula do veículo. |
| `modelo` | Varchar(100) | NOT NULL | Marca e modelo. |
| `tipo_frota` | Varchar(20) | NOT NULL | CHECK: `ADMINISTRATIVA`, `SVO`. |
| `capacidade_maxima` | Integer | NOT NULL | Lotação (CHECK: `>= 0`). |
| `status` | Varchar(30) | NOT NULL, DEFAULT 'DISPONIVEL' | CHECK: `DISPONIVEL`, `EM_USO`, `MANUTENCAO`. |

 4. Tabela: `equipes_svo`
Registo das equipas alocadas ao serviço SVO.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador da equipa. |
| `nome_equipe` | Varchar(100) | NOT NULL | Nome ou identificação da equipa de SVO. |

 5. Tabela: `auditorias`
Registo de ações realizadas no sistema (logs de segurança).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do log. |
| `usuario_id` | Integer | FOREIGN KEY | Ligação à tabela `usuarios` (RESTRICT). |
| `acao` | Varchar(255) | NOT NULL | Descrição da ação executada. |
| `modulo` | Varchar(100) | NOT NULL | Módulo afetado pela ação. |
| `data_hora` | Timestamp | DEFAULT now() | Data e hora exatas da operação. |

 6. Tabela: `motoristas`
Registo detalhado das habilitações dos utilizadores com perfil de condução.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do motorista. |
| `usuario_id` | Integer | FOREIGN KEY | Ligação à conta na tabela `usuarios` (RESTRICT). |
| `numero_cnh` | Varchar(20) | NOT NULL, UNIQUE | Número da carta de condução. |
| `categoria_cnh` | Varchar(5) | NOT NULL | Categoria da carta (Ex: B, C, D). |
| `validade_cnh` | Date | NOT NULL | Data de validade do documento. |
| `tipo_motorista` | Varchar(20) | NOT NULL | Categoria de alocação do condutor. |
| `status` | Varchar(30) | DEFAULT 'DISPONIVEL' | Estado de disponibilidade operacional. |

 7. Tabela: `manutencoes`
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

 8. Tabela: `documentos_veiculo`
Controlo de documentação legal e seguros dos veículos.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do documento. |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo associado (RESTRICT). |
| `tipo` | Varchar(100) | NOT NULL | Natureza do documento (Ex: Seguro, Inspeção). |
| `data_vencimento` | Date | NOT NULL | Data limite de validade legal. |

 9. Tabela: `solicitacoes_viagem`
Pedidos de deslocação da frota administrativa.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do pedido. |
| `solicitante_id` | Integer | FOREIGN KEY | Utilizador que realizou o pedido (RESTRICT). |
| `origem` | Varchar(255) | NOT NULL | Ponto de partida. |
| `destino` | Varchar(255) | NOT NULL | Local de chegada. |
| `finalidade` | Text | NOT NULL | Motivo da deslocação. |
| `data_saida_desejada` | Timestamp | NOT NULL | Início planeado. |
| `data_chegada_desejada`| Timestamp | NULLABLE | Fim planeado da viagem. |
| `status` | Varchar(30) | DEFAULT 'PENDENTE_APROVACAO' | Estado da aprovação da viagem. |

 10. Tabela: `solicitacoes_svo`
Triagem de pedidos para o Serviço de Verificação de Óbitos.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do pedido de SVO. |
| `registrante_id` | Integer | FOREIGN KEY | Utilizador que registou a ocorrência (RESTRICT). |
| `dados_solicitante` | Text | NOT NULL | Informação de quem contactou a instituição. |
| `local_ocorrencia` | Varchar(255) | NOT NULL | Morada do incidente. |
| `material_sensivel` | Boolean | DEFAULT false | Exige protocolos específicos de transporte. |
| `status` | Varchar(30) | DEFAULT 'EM_TRIAGEM' | Estado de processamento operacional. |

 11. Tabela: `escalas_svo`
Planeamento de horários das equipas SVO.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do turno. |
| `equipe_id` | Integer | FOREIGN KEY | Equipa escalada (RESTRICT). |
| `data_inicio` | Timestamp | NOT NULL | Início do turno. |
| `data_fim` | Timestamp | NOT NULL | Fim do turno. |

 12. Tabela: `multas`
Armazena o registo de infrações de trânsito vinculadas aos veículos e motoristas.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único da multa. |
| `veiculo_id` | Integer | FOREIGN KEY | Vínculo com a tabela `veiculos` (RESTRICT). |
| `motorista_id` | Integer | FOREIGN KEY | Vínculo com a tabela `motoristas` (RESTRICT). |
| `id_infracao` | Varchar(255) | NULLABLE | Código da infração registado pelo Detran. |
| `orgao_autuador` | Varchar(255) | NULLABLE | Entidade responsável pela autuação (Ex: PRF, SMTT). |
| `data_infracao` | Timestamp | NOT NULL | Data e hora exatas da ocorrência da infração. |
| `data_vencimento`| Date | NULLABLE | Data limite para pagamento com desconto. |
| `status_pagamento`| Varchar(255) | NOT NULL, DEFAULT 'PENDENTE' | CHECK: `PENDENTE`, `PAGO`, `CANCELADO`. |
| `valor` | Decimal(10,2) | NOT NULL | Valor original da autuação. |
| `descricao` | Text | NULLABLE | Detalhes adicionais. |
| `pontos` | Integer | NOT NULL | Pontuação deduzida na carta de condução. |

 13. Tabela: `abastecimentos`
Controlo de consumo de combustível da frota.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do abastecimento. |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo abastecido (RESTRICT). |
| `motorista_id` | Integer | FOREIGN KEY | Motorista que conduzia (RESTRICT). |
| `fornecedor_id` | Integer | FOREIGN KEY | Empresa que forneceu o combustível (RESTRICT). |
| `data_abastecimento`| Date | NOT NULL | Data do evento. |
| `quilometragem` | Integer | NOT NULL | Valor do conta-quilómetros no momento. |
| `litros` | Decimal(10,2) | NOT NULL | Volume abastecido. |
| `valor_total` | Decimal(10,2) | NOT NULL | Custo pago. |
| `posto_combustivel` | Varchar(150) | NULLABLE | Nome comercial da estação de serviço. |

 14. Tabela: `viagens_frota`
Execução efetiva das deslocações administrativas aprovadas.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador da viagem. |
| `solicitacao_id` | Integer | FOREIGN KEY | Pedido de origem (RESTRICT). |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo utilizado (RESTRICT). |
| `motorista_id` | Integer | FOREIGN KEY | Motorista encarregue (RESTRICT). |
| `km_inicial` | Integer | NULLABLE | Conta-quilómetros à partida. |
| `km_final` | Integer | NULLABLE | Conta-quilómetros à chegada. |
| `data_hora_efetiva_saida` | Timestamp | NULLABLE | Hora de início real. |
| `data_hora_efetiva_chegada`| Timestamp | NULLABLE | Hora de conclusão real. |
| `status` | Varchar(30) | DEFAULT 'AGENDADA' | Estado operacional da deslocação. |

 15. Tabela: `ordens_svo`
Alocação e execução de chamadas do Serviço de Verificação de Óbitos.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador da ordem. |
| `solicitacao_id` | Integer | FOREIGN KEY | Triagem vinculada (RESTRICT). |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo de transporte alocado (RESTRICT). |
| `motorista_id` | Integer | FOREIGN KEY | Condutor do SVO (RESTRICT). |
| `equipe_id` | Integer | FOREIGN KEY | Profissionais alocados (RESTRICT). |
| `capacidade_utilizada`| Integer | DEFAULT 1 | Espaço ocupado no transporte. |
| `data_hora_chamado` | Timestamp | DEFAULT now() | Momento da ativação da equipa. |
| `data_hora_conclusao`| Timestamp | NULLABLE | Regresso e término da operação. |
| `km_inicial` | Integer | NULLABLE | Conta-quilómetros de saída. |
| `km_final` | Integer | NULLABLE | Conta-quilómetros de regresso. |
| `status` | Varchar(30) | DEFAULT 'ALOCADA' | Situação tática da equipa. |