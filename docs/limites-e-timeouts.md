# Limites de requisição, tempo e concorrência

Este documento descreve como a API se protege de requisições excessivas e de operações lentas, sem afetar o uso normal.

A implementação está em:

- `src/backend/src/app.ts`
- `src/backend/src/middlewares/limitarTentativasLogin.ts`
- `src/backend/src/middlewares/limitarConcorrencia.ts`
- `src/backend/src/middlewares/limitarTempoRequisicao.ts`
- `src/backend/src/config/servidor.ts`
- `src/backend/knexfile.js`

## Limites por tipo de operação

Os limites são contados por IP do cliente, identificado pelo `TRUST_PROXY` (veja [seguranca-http.md](seguranca-http.md)), e ficam em memória, por instância.

| Operação | Rotas | Limite padrão | Conta |
|---|---|---|---|
| Login | `POST /api/auth/login` | 10 a cada 15 min | Só as tentativas recusadas |
| Renovação de sessão | `POST /api/auth/refresh` | 20 a cada 15 min | Só as tentativas recusadas |
| Leitura | `GET`/`HEAD` em `/api` | 300 por minuto (`RATE_LIMIT_LEITURA_POR_MIN`) | Todas |
| Escrita | `POST`/`PUT`/`PATCH`/`DELETE` em `/api`, exceto login e refresh | 60 por minuto (`RATE_LIMIT_ESCRITA_POR_MIN`) | Todas |
| Consultas pesadas | `/api/dashboard`, `/api/auditorias` | 30 por minuto (`RATE_LIMIT_PESADAS_POR_MIN`), somado ao de leitura | Todas |

Regras:

- **Contadores separados:** leitura e escrita contam de forma independente. Um excesso de consultas não impede o usuário de salvar uma alteração.
- **Ao estourar:** a resposta é **429** `{ "erro": "..." }`, com o cabeçalho `Retry-After`.
- **Requisições legítimas:** recebem os cabeçalhos `RateLimit` e `RateLimit-Policy`, com o limite e o restante.
- **Faixa:** os valores do uso normal (uma tela que faz algumas consultas por navegação) ficam bem abaixo dos limites.
- **Desligar:** só é possível fora de produção, com `RATE_LIMIT=off`. Nos testes automatizados os limites gerais ficam desligados por padrão, e os testes de limite os ligam. Em produção, `RATE_LIMIT=off` é recusado na inicialização.

## Concorrência

No máximo **50 requisições simultâneas por instância** (`MAX_REQUISICOES_SIMULTANEAS`). Acima disso, a API responde **503** "Servidor ocupado", com `Retry-After: 1`, em vez de enfileirar trabalho que esgotaria o pool de conexões (máximo de 10) e o tempo de resposta.

O `GET /api/status` (health check) fica fora desse limite.

## Tempos limite

| Camada | Limite padrão | Comportamento |
|---|---|---|
| Requisição (aplicação) | 15s (`REQUEST_TIMEOUT_MS`) | Responde **503** "A requisição excedeu o tempo limite", com `Retry-After: 5`. A resposta que o handler tentar enviar depois é descartada. |
| Servidor HTTP (Node) | `requestTimeout` = requisição + 5s; `headersTimeout` = 20s; `keepAliveTimeout` = 5s | Encerra conexões presas e as que demoram a enviar cabeçalhos (*slowloris*) |
| Consulta SQL (`statement_timeout`) | 10s (`POSTGRES_STATEMENT_TIMEOUT_MS`) | O PostgreSQL cancela a consulta (erro `57014`), e a API responde **503** "A operação demorou mais que o permitido" |
| Driver `pg` (`query_timeout`) | consulta + 2s | Garantia do lado do cliente, caso o servidor não responda. Também resulta em **503**. |
| Transação ociosa (`idle_in_transaction_session_timeout`) | 15s (`POSTGRES_IDLE_TRANSACTION_TIMEOUT_MS`) | O PostgreSQL encerra transações abertas e esquecidas, liberando os locks |
| Pool de conexões (PR #114) | aquisição e criação em 10s | Sem conexão livre: **503** "Banco de dados ocupado" |

Migrations e seeds rodam **sem** os limites de consulta, porque podem ser longas.

Nas respostas 503, o log registra apenas o tipo do erro. O SQL e os parâmetros não aparecem.

## Processamento excessivo

- Corpo JSON limitado a **100 KB**. Acima disso, a resposta é **413** "O corpo da requisição excede o limite de 100 KB". Antes, esse caso respondia 500.
- As listagens têm paginação com no máximo 100 itens por página, ou um limite fixo no model.
- A soma de pool limitado, concorrência limitada e `statement_timeout` impede que uma consulta lenta ou um pico de acessos derrubem a API.

## Política de retentativa

- **O backend não repete consultas nem requisições.** A única retentativa automática é a da *criação de conexão* do pool (`createRetryIntervalMillis`). Ela é segura, porque acontece antes de qualquer operação ser executada.
- **Os clientes** (frontend e integrações) só devem repetir automaticamente operações **seguras e idempotentes** (`GET`/`HEAD`) depois de um **429** ou **503**, respeitando o `Retry-After`.
- `POST`, `PUT`, `PATCH` e `DELETE` **nunca** são repetidos automaticamente. Um 503 por tempo esgotado não garante que a operação deixou de ser aplicada, então cabe ao usuário verificar e repetir.
- Exceção segura: repetir uma requisição **uma vez** depois de renovar a sessão, num 401. A requisição original foi recusada na autenticação, antes de qualquer efeito.

## Variáveis de ambiente

| Variável | Padrão | Faixa |
|---|---|---|
| `RATE_LIMIT` | `on` (`off` nos testes) | `on`/`off`. `off` é proibido em produção. |
| `RATE_LIMIT_LEITURA_POR_MIN` | 300 | 10 a 10000 |
| `RATE_LIMIT_ESCRITA_POR_MIN` | 60 | 5 a 5000 |
| `RATE_LIMIT_PESADAS_POR_MIN` | 30 | 1 a 1000 |
| `MAX_REQUISICOES_SIMULTANEAS` | 50 | 1 a 1000 |
| `REQUEST_TIMEOUT_MS` | 15000 | 1000 a 120000 |
| `POSTGRES_STATEMENT_TIMEOUT_MS` | 10000 | inteiro positivo |
| `POSTGRES_IDLE_TRANSACTION_TIMEOUT_MS` | 15000 | inteiro positivo |
