# Dicionário de Dados - Gestão de Frotas

## 1. Tabela: `fornecedores`
Armazena os dados das entidades que prestam serviços de manutenção ou fornecem combustível[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do fornecedor[cite: 9]. |
| `nome` | Varchar(255) | NOT NULL | Nome da empresa ou fornecedor[cite: 9]. |
| `cnpj` | Varchar(20) | NOT NULL, UNIQUE | CNPJ do fornecedor[cite: 9]. |
| `tipo_servico` | Varchar(100) | NULLABLE | Categoria do serviço prestado[cite: 9]. |
| `contrato` | Varchar(100) | NULLABLE | Número ou referência do contrato[cite: 9]. |

## 2. Tabela: `usuarios`
Armazena os utilizadores com acesso ao sistema e as respetivas credenciais e perfis[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do utilizador[cite: 9]. |
| `nome` | Varchar(255) | NOT NULL | Nome completo[cite: 9]. |
| `email` | Varchar(255) | NOT NULL, UNIQUE | Correio eletrónico (índice único em minúsculas)[cite: 9, 12]. |
| `senha` | Varchar(255) | NOT NULL | Palavra-passe encriptada[cite: 9]. |
| `tipo_usuario` | Varchar(50) | NOT NULL | Categoria base (Validação: se o perfil for MOTORISTA_*, o tipo é 'MOTORISTA')[cite: 9, 12]. |
| `perfil` | Varchar(50) | NOT NULL | CHECK: `ADMINISTRADOR`, `SOLICITANTE`, `GESTOR_FROTA`, `GESTOR_SVO`, `MOTORISTA_FROTA`, `MOTORISTA_SVO`[cite: 9, 11]. |
| `ativo` | Boolean | NOT NULL, DEFAULT true | Indica se a conta tem permissão de acesso[cite: 9, 12]. |

## 3. Tabela: `veiculos`
Registo dos veículos pertencentes à frota geral e ao Serviço de Verificação de Óbitos (SVO)[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do veículo[cite: 9]. |
| `placa` | Varchar(10) | NOT NULL, UNIQUE | Matrícula do veículo[cite: 9]. |
| `modelo` | Varchar(100) | NOT NULL | Marca e modelo[cite: 9]. |
| `tipo_frota` | Varchar(20) | NOT NULL | CHECK: `ADMINISTRATIVA`, `SVO`[cite: 9, 10]. |
| `capacidade_maxima` | Integer | NOT NULL | Lotação (CHECK: `>= 0`)[cite: 9, 10]. |
| `status` | Varchar(30) | NOT NULL, DEFAULT 'DISPONIVEL' | CHECK: `DISPONIVEL`, `EM_USO`, `MANUTENCAO`[cite: 9, 13]. |

## 4. Tabela: `equipes_svo`
Registo das equipas alocadas ao serviço SVO[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador da equipa[cite: 9]. |
| `nome_equipe` | Varchar(100) | NOT NULL | Nome ou identificação da equipa de SVO[cite: 9]. |

## 5. Tabela: `auditorias`
Registo de ações realizadas no sistema (logs de segurança)[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do log[cite: 9]. |
| `usuario_id` | Integer | FOREIGN KEY | Ligação à tabela `usuarios` (RESTRICT)[cite: 9]. |
| `acao` | Varchar(255) | NOT NULL | Descrição da ação executada[cite: 9]. |
| `modulo` | Varchar(100) | NOT NULL | Módulo afetado pela ação[cite: 9]. |
| `data_hora` | Timestamp | DEFAULT now() | Data e hora exatas da operação[cite: 9]. |

## 6. Tabela: `motoristas`
Registo detalhado das habilitações dos utilizadores com perfil de condução[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do motorista[cite: 9]. |
| `usuario_id` | Integer | FOREIGN KEY | Ligação à conta na tabela `usuarios` (RESTRICT)[cite: 9]. |
| `numero_cnh` | Varchar(20) | NOT NULL, UNIQUE | Número da carta de condução[cite: 9]. |
| `categoria_cnh` | Varchar(5) | NOT NULL | Categoria da carta (Ex: B, C, D)[cite: 9]. |
| `validade_cnh` | Date | NOT NULL | Data de validade do documento[cite: 9]. |
| `tipo_motorista` | Varchar(20) | NOT NULL | Categoria de alocação do condutor[cite: 9]. |
| `status` | Varchar(30) | DEFAULT 'DISPONIVEL' | Estado de disponibilidade operacional[cite: 9]. |

## 7. Tabela: `manutencoes`
Histórico de manutenções preventivas e corretivas da frota[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador da intervenção[cite: 9]. |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo intervencionado (RESTRICT)[cite: 9]. |
| `fornecedor_id` | Integer | FOREIGN KEY | Oficina responsável (RESTRICT)[cite: 9]. |
| `tipo_manutencao` | Varchar(50) | NOT NULL | Preventiva ou Corretiva[cite: 9]. |
| `data_manutencao` | Date | NOT NULL | Data da intervenção[cite: 9]. |
| `descricao` | Text | NOT NULL | Detalhamento do serviço[cite: 9]. |
| `custo` | Decimal(10,2) | NOT NULL | Valor pago pelo serviço[cite: 9]. |
| `status` | Varchar(30) | DEFAULT 'AGENDADA' | Estado atual da reparação[cite: 9]. |

## 8. Tabela: `documentos_veiculo`
Controlo de documentação legal e seguros dos veículos[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do documento[cite: 9]. |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo associado (RESTRICT)[cite: 9]. |
| `tipo` | Varchar(100) | NOT NULL | Natureza do documento (Ex: Seguro, Inspeção)[cite: 9]. |
| `data_vencimento` | Date | NOT NULL | Data limite de validade legal[cite: 9]. |

## 9. Tabela: `solicitacoes_viagem`
Pedidos de deslocação da frota administrativa[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do pedido[cite: 9]. |
| `solicitante_id` | Integer | FOREIGN KEY | Utilizador que realizou o pedido (RESTRICT)[cite: 9]. |
| `origem` | Varchar(255) | NOT NULL | Ponto de partida[cite: 9]. |
| `destino` | Varchar(255) | NOT NULL | Local de chegada[cite: 9]. |
| `finalidade` | Text | NOT NULL | Motivo da deslocação[cite: 9]. |
| `data_saida_desejada` | Timestamp | NOT NULL | Início planeado[cite: 9]. |
| `data_chegada_desejada`| Timestamp | NULLABLE | Fim planeado da viagem[cite: 9]. |
| `status` | Varchar(30) | DEFAULT 'PENDENTE_APROVACAO' | Estado da aprovação da viagem[cite: 9]. |

## 10. Tabela: `solicitacoes_svo`
Triagem de pedidos para o Serviço de Verificação de Óbitos[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do pedido de SVO[cite: 9]. |
| `registrante_id` | Integer | FOREIGN KEY | Utilizador que registou a ocorrência (RESTRICT)[cite: 9]. |
| `dados_solicitante` | Text | NOT NULL | Informação de quem contactou a instituição[cite: 9]. |
| `local_ocorrencia` | Varchar(255) | NOT NULL | Morada do incidente[cite: 9]. |
| `material_sensivel` | Boolean | DEFAULT false | Exige protocolos específicos de transporte[cite: 9]. |
| `status` | Varchar(30) | DEFAULT 'EM_TRIAGEM' | Estado de processamento operacional[cite: 9]. |

## 11. Tabela: `escalas_svo`
Planeamento de horários das equipas SVO[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do turno[cite: 9]. |
| `equipe_id` | Integer | FOREIGN KEY | Equipa escalada (RESTRICT)[cite: 9]. |
| `data_inicio` | Timestamp | NOT NULL | Início do turno[cite: 9]. |
| `data_fim` | Timestamp | NOT NULL | Fim do turno[cite: 9]. |

## 12. Tabela: `multas`
Armazena o registo de infrações de trânsito vinculadas aos veículos e motoristas[cite: 9, 14].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único da multa[cite: 9, 14]. |
| `veiculo_id` | Integer | FOREIGN KEY | Vínculo com a tabela `veiculos` (RESTRICT)[cite: 9, 14]. |
| `motorista_id` | Integer | FOREIGN KEY | Vínculo com a tabela `motoristas` (RESTRICT)[cite: 9, 14]. |
| `id_infracao` | Varchar(255) | NULLABLE | Código da infração registado pelo Detran[cite: 14]. |
| `orgao_autuador` | Varchar(255) | NULLABLE | Entidade responsável pela autuação (Ex: PRF, SMTT)[cite: 14]. |
| `data_infracao` | Timestamp | NOT NULL | Data e hora exatas da ocorrência da infração[cite: 9, 14]. |
| `data_vencimento`| Date | NULLABLE | Data limite para pagamento com desconto[cite: 14]. |
| `status_pagamento`| Varchar(255) | NOT NULL, DEFAULT 'PENDENTE' | Valores: `PENDENTE`, `PAGO`, `CANCELADO`[cite: 14]. |
| `valor` | Decimal(10,2) | NOT NULL | Valor original da autuação[cite: 9, 14]. |
| `descricao` | Text | NULLABLE | Detalhes adicionais[cite: 9, 14]. |
| `pontos` | Integer | NOT NULL | Pontuação deduzida na carta de condução[cite: 9, 14]. |

## 13. Tabela: `abastecimentos`
Controlo de consumo de combustível da frota[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador do abastecimento[cite: 9]. |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo abastecido (RESTRICT)[cite: 9]. |
| `motorista_id` | Integer | FOREIGN KEY | Motorista que conduzia (RESTRICT)[cite: 9]. |
| `fornecedor_id` | Integer | FOREIGN KEY | Empresa que forneceu o combustível (RESTRICT)[cite: 9]. |
| `data_abastecimento`| Date | NOT NULL | Data do evento[cite: 9]. |
| `quilometragem` | Integer | NOT NULL | Valor do conta-quilómetros no momento[cite: 9]. |
| `litros` | Decimal(10,2) | NOT NULL | Volume abastecido[cite: 9]. |
| `valor_total` | Decimal(10,2) | NOT NULL | Custo pago[cite: 9]. |
| `posto_combustivel` | Varchar(150) | NULLABLE | Nome comercial da estação de serviço[cite: 9]. |

## 14. Tabela: `viagens_frota`
Execução efetiva das deslocações administrativas aprovadas[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador da viagem[cite: 9]. |
| `solicitacao_id` | Integer | FOREIGN KEY | Pedido de origem (RESTRICT)[cite: 9]. |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo utilizado (RESTRICT)[cite: 9]. |
| `motorista_id` | Integer | FOREIGN KEY | Motorista encarregue (RESTRICT)[cite: 9]. |
| `km_inicial` | Integer | NULLABLE | Conta-quilómetros à partida[cite: 9]. |
| `km_final` | Integer | NULLABLE | Conta-quilómetros à chegada[cite: 9]. |
| `data_hora_efetiva_saida` | Timestamp | NULLABLE | Hora de início real[cite: 9]. |
| `data_hora_efetiva_chegada`| Timestamp | NULLABLE | Hora de conclusão real[cite: 9]. |
| `status` | Varchar(30) | DEFAULT 'AGENDADA' | Estado operacional da deslocação[cite: 9]. |

## 15. Tabela: `ordens_svo`
Alocação e execução de chamadas do Serviço de Verificação de Óbitos[cite: 9].

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador da ordem[cite: 9]. |
| `solicitacao_id` | Integer | FOREIGN KEY | Triagem vinculada (RESTRICT)[cite: 9]. |
| `veiculo_id` | Integer | FOREIGN KEY | Veículo de transporte alocado (RESTRICT)[cite: 9]. |
| `motorista_id` | Integer | FOREIGN KEY | Condutor do SVO (RESTRICT)[cite: 9]. |
| `equipe_id` | Integer | FOREIGN KEY | Profissionais alocados (RESTRICT)[cite: 9]. |
| `capacidade_utilizada`| Integer | DEFAULT 1 | Espaço ocupado no transporte[cite: 9]. |
| `data_hora_chamado` | Timestamp | DEFAULT now() | Momento da ativação da equipa[cite: 9]. |
| `data_hora_conclusao`| Timestamp | NULLABLE | Regresso e término da operação[cite: 9]. |
| `km_inicial` | Integer | NULLABLE | Conta-quilómetros de saída[cite: 9]. |
| `km_final` | Integer | NULLABLE | Conta-quilómetros de regresso[cite: 9]. |
| `status` | Varchar(30) | DEFAULT 'ALOCADA' | Situação tática da equipa[cite: 9]. |