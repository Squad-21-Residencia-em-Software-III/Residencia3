# Avaliação de Consultas Críticas, Índices e Dimensionamento do Pool PostgreSQL

## 1. Objetivo e Escopo

Este documento registra a avaliação técnica de desempenho, planos de execução (`EXPLAIN (ANALYZE, BUFFERS)`), criação de índices compostos/parciais, imposição de limites em consultas históricas e dimensionamento explícito do pool de conexões do PostgreSQL para o sistema **Gestão de Frotas e SVO (Squad 21)**.

---

## 2. Identificação das Consultas Críticas e Limitação de Consultas Acumulativas

### 2.1. Consultas Críticas Identificadas nos Modelos
A inspeção de todos os 13 modelos em `src/backend/src/models/` e serviços em `src/backend/src/services/` identificou cinco grupos de consultas de maior custo potencial à medida que o volume histórico cresce:

1. **Q1 (`auditoriaModel.listar`):** Paginação da trilha de auditoria (`ORDER BY data_hora DESC, id DESC LIMIT ? OFFSET ?`). Tabela *append-only* acionada em todas as mutações do sistema.
2. **Q2 (`solicitacaoViagemModel.listar` e `dashboardModel.indicadores`):** Filtragem de solicitações de viagem por `status` e intervalo de `data_saida_desejada` com ordenação por `(data_saida_desejada ASC, id ASC)`.
3. **Q3 (`solicitacaoViagemModel.listarDoSolicitante`):** Histórico paginado por `solicitante_id` ordenado por `(data_saida_desejada DESC, id DESC)` acoplado a uma subquery `LEFT JOIN LATERAL` que busca a viagem ativa mais recente (`WHERE vf.solicitacao_id = sv.id AND vf.status <> 'CANCELADA' ORDER BY vf.id DESC LIMIT 1`).
4. **Q4 (`veiculoModel.listarSvoDisponiveis`, `veiculoModel.listarOcupacaoSvo` e `disponibilidadeService.consultar`):** Agregação de ocupação SVO (`SUM(o.capacidade_utilizada)` em `ordens_svo` ativas) e verificação de conflito temporal de veículos e motoristas em `viagens_frota`.
5. **Q5 (`manutencaoModel.listarPorVeiculo`, `abastecimentoModel.listarPorVeiculo`, `multaModel.listar` e `documentoModel.listarVencimentos`):** Consultas de histórico operacional por veículo ou frota ordenadas por data decrescente.

### 2.2. Contenção de Consultas Sem Limites (`LIMIT`)
Operações de listagem em tabelas que acumulam registros continuamente ao longo do tempo possuíam consultas abertas (sem cláusula `LIMIT`), expondo o backend ao risco de exaustão de memória e retenção prolongada de conexões do pool. Foram aplicados limites explícitos e determinísticos (padrão e teto de **200 registros** por consulta):

| Modelo / Método | Ordenação Determinística | Limite Aplicado (`LIMIT`) |
| :--- | :--- | :---: |
| `abastecimentoModel.listarPorVeiculo` | `ORDER BY data_abastecimento DESC, id DESC` | `200` (`LIMITE_MAXIMO_ABASTECIMENTOS`) |
| `manutencaoModel.listarPorVeiculo` | `ORDER BY data_manutencao DESC, id DESC` | `200` (`LIMITE_MAXIMO_MANUTENCOES`) |
| `multaModel.listar` | `ORDER BY data_infracao DESC, id DESC` | `200` (`LIMITE_MAXIMO_MULTAS`) |
| `viagemModel.listar` | `ORDER BY inicio_previsto DESC NULLS LAST, id DESC` | `200` (`LIMITE_MAXIMO_VIAGENS`) |
| `documentoModel.listarVencimentos` | `ORDER BY data_vencimento ASC, id ASC` | `200` (`LIMITE_MAXIMO_DOCUMENTOS`) |

---

## 3. Avaliação de Planos de Execução (`EXPLAIN ANALYZE`) e Justificativa dos Índices

O schema original possuía apenas índices simples nas colunas de chave estrangeira (`usuario_id`, `veiculo_id`, `solicitante_id`, etc.), obrigando o PostgreSQL a realizar `Seq Scan` seguido de `Sort (top-N heapsort)` em memória/disco para atender às cláusulas `WHERE` combinadas com `ORDER BY`.

A migration `src/backend/database/migrations/20261113120500_indices_consultas_criticas.js` introduziu os índices compostos e parciais abaixo, todos medidos com `EXPLAIN (ANALYZE, BUFFERS)` através do utilitário `npm run db:avaliar-consultas` (`src/backend/scripts/avaliar-consultas-db.cjs`) sob massa de teste (3.000 auditorias, 1.500 solicitações de viagem e 1.200 manutenções):

### 3.1. Medições Antes vs. Depois dos Índices

| Código da Consulta | Índice Criado e Utilizado pelo Planner | Custo Sem Índice (`Total Cost`) | Custo Com Índice (`Total Cost`) | Redução de Custo | Tempo Sem Índice (`ms`) | Tempo Com Índice (`ms`) | Ganho de Latência |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Q1 (`auditorias`)** | `idx_auditorias_data_hora_id` `(data_hora DESC, id DESC)` | `140.34` (`Seq Scan + Sort`) | `1.46` (`Index Scan`) | **-98,96%** | `0,467 ms` | `0,035 ms` | **13,3x mais rápida** |
| **Q2 (`solicitacoes_viagem` por status)** | `idx_solicitacoes_viagem_status_saida_id` `(status, data_saida_desejada ASC, id ASC)` | `88.76` (`Seq Scan + Sort`) | `7.38` (`Index Scan`) | **-91,69%** | `0,766 ms` | `0,073 ms` | **10,5x mais rápida** |
| **Q3 (`listarDoSolicitante` + `LATERAL`)** | `idx_solicitacoes_viagem_solicitante_saida_id` + `idx_viagens_frota_solicitacao_ativa_id` | `1678.34` (`Nested Loop Seq Scan`) | `24.48` (`Index Scan`) | **-98,54%** | `2,127 ms` | `0,075 ms` | **28,4x mais rápida** |
| **Q4 (`ocupacao SVO`)** | `idx_veiculos_frota_status` + `idx_ordens_svo_veiculo_status_ativo` (`INCLUDE capacidade_utilizada`) | `2.18` | `2.18` (`Index Only Scan`) | Covering Index | `0,058 ms` | `0,046 ms` | **1,26x mais rápida** |
| **Q5 (`manutencoes` por veículo)** | `idx_manutencoes_veiculo_data_id` `(veiculo_id, data_manutencao DESC, id DESC)` | `113.84` (`Seq Scan + Sort`) | `23.21` (`Bitmap/Index Scan`) | **-79,61%** | `1,265 ms` | `0,267 ms` | **4,7x mais rápida** |

### 3.2. Catálogo Completo de Índices Adicionados e Justificativa Técnica

1. **`idx_auditorias_data_hora_id` (`auditorias (data_hora DESC, id DESC)`):**
   - Elimina ordenação (`Sort`) na listagem paginada de auditorias, lendo diretamente as `N` linhas mais recentes em ordem reversa do índice B-Tree.
2. **`idx_solicitacoes_viagem_status_saida_id` (`solicitacoes_viagem (status, data_saida_desejada ASC, id ASC)`):**
   - Atende simultaneamente à filtragem por `status` e ordenação da fila de aprovação e à contagem por período no `dashboardModel.indicadores`.
3. **`idx_solicitacoes_viagem_solicitante_saida_id` (`solicitacoes_viagem (solicitante_id, data_saida_desejada DESC, id DESC)`):**
   - Permite busca direta das solicitações de um usuário já ordenadas da mais recente para a mais antiga.
4. **`idx_viagens_frota_solicitacao_ativa_id` (`viagens_frota (solicitacao_id, id DESC) WHERE status <> 'CANCELADA'`):**
   - Índice parcial desenhado exatamente para o `LEFT JOIN LATERAL` de `solicitacaoViagemModel.listarDoSolicitante`, evitando varredura em viagens canceladas e entregando `ORDER BY vf.id DESC LIMIT 1` em uma única leitura de folha B-Tree.
5. **`idx_viagens_frota_status_veiculo` (`viagens_frota (status, veiculo_id)`) e `idx_viagens_frota_status_motorista` (`viagens_frota (status, motorista_id)`):**
   - Sustentam as subqueries `WHERE NOT EXISTS` de `disponibilidadeService.consultar` (`viagensConflitantes` com `status IN ('AGENDADA', 'EM_ANDAMENTO')`).
6. **`idx_ordens_svo_veiculo_status_ativo` (`ordens_svo (veiculo_id, status) INCLUDE (capacidade_utilizada) WHERE status IN ('ALOCADA', 'EM_DESLOCAMENTO')`):**
   - Índice parcial coberto (*covering index*) que permite calcular `SUM(o.capacidade_utilizada)` nas consultas de capacidade SVO sem acessar a *heap* da tabela para ordens já concluídas ou canceladas.
7. **`idx_solicitacoes_svo_status_id` (`solicitacoes_svo (status, id DESC)`):**
   - Atende à listagem paginada da fila de triagem SVO (`solicitacaoSvoModel.listar`).
8. **`idx_veiculos_frota_status` (`veiculos (tipo_frota, status)`):**
   - Acelera os filtros combinados de tipo de frota (`ADMINISTRATIVA` vs `SVO`) e disponibilidade.
9. **`idx_manutencoes_veiculo_data_id`, `idx_abastecimentos_veiculo_data_id` e `idx_multas_data_infracao_id`:**
   - Garantem leitura ordenada sem `Sort` para os históricos de manutenções, abastecimentos e multas.

---

## 4. Dimensionamento do Pool de Conexões e Timeouts

A configuração do pool no `src/backend/knexfile.js` (função `resolverPool`) foi dimensionada considerando a hospedagem da API Node.js (Render) conectada ao endpoint *connection pooler* do Neon PostgreSQL:

| Parâmetro Knex / Tarn.js | Variável de Ambiente | Valor Padrão | Justificativa Técnica |
| :--- | :--- | :---: | :--- |
| `pool.min` | `POSTGRES_POOL_MIN` | `2` | Mantém 2 conexões aquecidas com handshake TLS estabelecido para evitar latência de *cold connection* em requisições imediatas. |
| `pool.max` | `POSTGRES_POOL_MAX` | `10` | Limita o teto de conexões simultâneas por instância da aplicação, prevenindo saturação de conexões do PostgreSQL e contenção de CPU/locks sob pico de tráfego. |
| `pool.acquireTimeoutMillis` | `POSTGRES_POOL_ACQUIRE_TIMEOUT_MS` | `10000` (10s) | Tempo máximo que uma requisição aguarda na fila do pool por uma conexão livre antes de falhar de forma controlada (*fail-fast*). |
| `pool.createTimeoutMillis` | `POSTGRES_POOL_CREATE_TIMEOUT_MS` | `10000` (10s) | Tempo máximo para abertura do socket TCP + handshake TLS com o servidor remoto (também repassado a `connection.connectionTimeoutMillis`). |
| `pool.destroyTimeoutMillis` | `POSTGRES_POOL_DESTROY_TIMEOUT_MS` | `5000` (5s) | Tempo máximo aguardado para encerramento limpo de uma conexão sendo descartada. |
| `pool.idleTimeoutMillis` | `POSTGRES_POOL_IDLE_TIMEOUT_MS` | `30000` (30s) | Libera conexões ociosas acima de `pool.min` após 30s de inatividade, permitindo que o *compute* Serverless do Neon reduza consumo em períodos sem carga. |
| `pool.reapIntervalMillis` | `POSTGRES_POOL_REAP_INTERVAL_MS` | `1000` (1s) | Frequência de verificação de conexões ociosas elegíveis para liberação. |
| `pool.createRetryIntervalMillis` | `POSTGRES_POOL_CREATE_RETRY_INTERVAL_MS` | `200` (200ms) | Intervalo entre novas tentativas de conexão caso ocorra oscilação transitória de rede durante o `acquireTimeoutMillis`. |

---

## 5. Resultados do Teste de Carga e Concorrência

Para comprovar que o dimensionamento do pool (`min=2, max=10`) e os índices mantêm a integridade e o desempenho sob rajada superior ao limite físico do pool, foi executado o teste de carga real via `npm run db:avaliar-consultas` contra o banco Neon utilizando a conta restrita da aplicação (`frotas_app`):

- **Carga concorrente disparada:** `30` consultas críticas simultâneas (3x o limite `max=10` do pool, forçando enfileiramento e reutilização de conexões).
- **Taxa de sucesso:** `30 / 30` (**100%**, zero erros de timeout ou queda de conexão).
- **Tempo total para processar as 30 consultas concorrentes:** `909 ms`.
- **Distribuição de latência (incluindo tempo de fila no pool + RTT de rede TLS):**
  - **p50 (mediana):** `808 ms`
  - **p95:** `905 ms`
  - **Máxima:** `909 ms` (muito abaixo do limite de `acquireTimeoutMillis = 10.000 ms`).
