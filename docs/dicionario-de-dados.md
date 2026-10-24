# Dicionário de Dados - Gestão de Frotas (Squad 21)

Este documento descreve a estrutura atual do banco de dados relacional (PostgreSQL) utilizado no sistema, gerenciado via Knex.js.

## 1. Tabela: `usuarios`
Armazena os dados de acesso e perfil dos usuários do sistema (RF01 / RF02).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do usuário. |
| `nome` | Varchar | NOT NULL | Nome completo do usuário. |
| `email` | Varchar | NOT NULL, UNIQUE | E-mail para login (Indexado). |
| `senha` | Varchar | NOT NULL | Hash da senha (gerado via bcrypt). |
| `perfil` | Varchar | NOT NULL, CHECK | Define os acessos. Valores: `ADMINISTRADOR`, `SOLICITANTE`, `MOTORISTA`, etc. |
| `tipo_usuario` | Varchar | NOT NULL | Calculado a partir do perfil. |
| `ativo` | Boolean | DEFAULT true | Soft delete. `false` desativa o usuário. |

## 2. Tabela: `veiculos`
Armazena a frota disponível para as solicitações (RF03 / RF16).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do veículo. |
| `placa` | Varchar | NOT NULL, UNIQUE | Placa do veículo (Ex: ABC-1234). |
| `modelo` | Varchar | NOT NULL | Descrição do veículo (Ex: Fiat Uno). |
| `capacidade_maxima` | Integer | CHECK (>= 0) | Lotação máxima de passageiros. |
| `tipo_frota` | Varchar | NOT NULL, CHECK | Valores: `SVO`, `ADMINISTRATIVA`. |
| `status` | Varchar | NOT NULL, CHECK | Valores: `DISPONIVEL`, `EM_USO`, `MANUTENCAO`. |

## 3. Tabela: `motoristas`
Armazena os dados específicos dos motoristas da frota (RF04).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do motorista. |
| `usuario_id` | Integer | FOREIGN KEY | Vínculo com a tabela `usuarios`. |
| `numero_cnh` | Varchar | NOT NULL, UNIQUE | Número da Carteira de Habilitação. |
| `categoria_cnh` | Varchar | NOT NULL | Categoria da habilitação (Ex: B, D). |
| `validade_cnh` | Date | NOT NULL | Data de vencimento do documento. |

## 4. Tabela: `auditorias`
Registra o histórico de alterações críticas no sistema (RF27 / RN18).

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único do registro. |
| `usuario_id` | Integer | FOREIGN KEY | Quem executou a ação. |
| `acao` | Varchar | NOT NULL | Qual operação foi feita (Ex: `LOGIN`, `CRIAR_USUARIO`). |
| `modulo` | Varchar | NOT NULL | Qual módulo ou tabela sofreu alteração. |
| `data_hora` | Timestamp | DEFAULT now() | Momento exato da ação. |

## 5. Tabela: `multas`
Armazena o registro de infrações de trânsito vinculadas aos veículos e motoristas da frota.

| Coluna | Tipo | Restrições / Notas | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | Integer / Serial | PRIMARY KEY | Identificador único da multa. |
| `veiculo_id` | Integer | FOREIGN KEY | Vínculo com a tabela `veiculos`. |
| `motorista_id` | Integer | FOREIGN KEY | Vínculo com a tabela `motoristas` (se identificado). |
| `id_infracao` | Varchar | NULLABLE | Código da infração registrado pelo Detran. |
| `orgao_autuador` | Varchar | NULLABLE | Órgão responsável pela autuação (Ex: PRF, SMTT). |
| `data_infracao` | Timestamp | NOT NULL | Data e hora exatas da ocorrência da infração. |
| `data_vencimento`| Date | NULLABLE | Data limite para pagamento com desconto. |
| `status_pagamento`| Varchar | DEFAULT 'PENDENTE' | Valores: `PENDENTE`, `PAGO`, `CANCELADO`. |
| `valor` | Decimal | NOT NULL | Valor original da autuação. |