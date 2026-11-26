# SCRUM-224 · Validação operacional das notificações

A [retenção In-App](scrum-242-retencao-notificacoes.md) e o [roteiro de rollout](scrum-241-implantacao-push.md) foram integrados nos PRs [#205](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/205) e [#213](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/213). Esta validação usa a API HTTP e PostgreSQL descartáveis. As rajadas representam um ciclo simultâneo de polling com 10 ou 50 usuários e uma, duas ou três abas visíveis. O relatório registra volume, status HTTP, latência e contagem de avisos e itens na fila antes e depois. A simulação não mede temporizadores em abas reais, a rede dos provedores ou cold start.

## Retenção e recuperação

- In-App. Simular o corte estrito de 30 dias a partir de `lida_em` e 90 dias a partir de `criado_em` para avisos não lidos. Conferir os limiares, a role restrita e a revalidação da linha após uma leitura concorrente. A rotina de aplicação exige autorização e configuração explícitas.
- Assinaturas. `ATIVA`, `REVOGADA` e `EXPIRADA`/`INVALIDA` distinguem o ciclo de uso. Respostas 404/410 tornam o endpoint inelegível para novas entregas. O expurgo físico depende de política formal.
- Outbox. `PENDENTE` e `PROCESSANDO` são estados de trabalho. `ENVIADO`, inclusive parcial, `IGNORADO` e `FALHA_DEFINITIVA` são estados terminais. Preservar dados usados pela investigação de falhas e pela deduplicação.
- Para propor a política, usar a idade do estado terminal e o máximo das janelas aprovadas de investigação, retry e deduplicação. Definir retenção e recuperação de backups com a liderança e o responsável pelo banco antes de programar qualquer exclusão.

O inventário pode ser consultado em sessão somente leitura, com resultados agregados.

```sql
BEGIN READ ONLY;
SELECT status, count(*) FROM push_subscriptions GROUP BY status ORDER BY status;
SELECT status, count(*) FROM notificacao_outbox GROUP BY status ORDER BY status;
COMMIT;
```

## Reproduzir

1. Migrar um PostgreSQL descartável identificado como `127.0.0.1/frotas_teste`.
2. Executar `POSTGRES_STATEMENT_TIMEOUT_MS=120000 SCRUM241_DESEMPENHO=1 SCRUM241_RELATORIO=relatorio.json npx vitest run src/tests/desempenhoNotificacoesPostgres.test.ts` no backend. O relatório contém dados agregados de contas sintéticas.
3. Para retenção e fila, executar `retencaoNotificacoes.test.ts` e as suítes de outbox, envio e métricas com as mesmas variáveis PostgreSQL do CI, em série.
4. Em homologação, acompanhar fila pendente, idade do item mais antigo, falhas sanitizadas e taxa de 429/503. Observar uma retomada real após suspensão em ambiente isolado, com as etapas de reversão do guia SCRUM-241. Registrar os tempos observados no Render e Neon separadamente.

A execução do job, o provisionamento das roles por Gabriel Arruda e qualquer ativação real seguem a aprovação da liderança e o [procedimento de backup e recuperação](politica-backup-e-recuperacao-db.md).

## Resultado local de 26/11/2026

Base 6cbe676 e alteração de medição deste PR. Quatro casos passaram. A massa tinha 167.000 avisos, 100.000 itens de outbox, 50 pendentes e 150 assinaturas. As contagens de avisos e fila ficaram iguais após os seis lotes.

| Usuários | Abas por usuário | HTTP 200 | HTTP 503 | p95 dos sucessos |
| --- | --- | --- | --- | --- |
| 10 | 1 | 10 | 0 | 35,2 ms |
| 10 | 2 | 20 | 0 | 40,4 ms |
| 10 | 3 | 30 | 0 | 61,4 ms |
| 50 | 1 | 50 | 0 | 85,4 ms |
| 50 | 2 | 50 | 50 | 122,0 ms |
| 50 | 3 | 50 | 100 | 166,1 ms |

A API local limita a 50 requisições simultâneas. A série de cinco a dez minutos com abas e a retomada real em Render/Neon continuam pendentes.

Com BroadcastChannel e Web Locks, abas visíveis compartilham o resultado do contador por conta. A consulta inicial é distribuída em até dois segundos. Os ticks de coordenação de cinco segundos não são consultas HTTP: o contador e a lista aberta respeitam uma janela periódica de 60 segundos. Cada central aberta revalida sua própria lista, inclusive quando o total não muda, para detectar revogações. Foco tem debounce separado de cinco segundos. Falhas temporárias do contador e da lista possuem retentativas independentes com espera progressiva de 5 a 60 segundos, mais variação de até um segundo. Navegadores sem suporte continuam com polling individual limitado. Abrir a central e ações explícitas continuam podendo atualizar imediatamente.

A regressão de temporizadores, revogação, coordenação, sessão e recuperação está coberta por cenários Vitest em `NotificacoesContext.test.tsx`. Os resultados desses novos cenários precisam ser registrados após execução; os números HTTP históricos abaixo não os substituem e não comprovam comportamento de navegadores reais.

Em PostgreSQL 17 local descartável, `desempenhoNotificacoesPostgres.test.ts` passou os cinco casos. Com 168.936 avisos, 100.062 registros de fila e 188 assinaturas, a simulação com 10 e 50 usuários em duas e três abas teve 360 respostas HTTP 200 em três ciclos por cenário. O maior p95 do contador nos ciclos coordenados foi 19,4 ms. Na rajada de controle, 100 requisições receberam 503. A recuperação após 5 segundos fez uma tentativa por usuário afetado e os 34 receberam HTTP 200. O teste simula a coordenação na carga HTTP. Suspensão real e reconexão em Render/Neon requerem um ambiente isolado autorizado.


## Medição complementar de 26/11/2026

Executada sobre `94b63e4` com API Express e PostgreSQL 17 descartável em loopback. Sessões sintéticas e rota de contador real. Em seis ciclos espaçados de 60 s, alternaram-se simulações de uma a três abas, primeiro com contador e depois também com lista da central aberta. As chamadas foram escalonadas por conta e os percentis contam tempo completo de resposta HTTP.

| Contas | Duração | HTTP 200 / total | Requisições por conta | Faixa de p50 por combinação | Maior p95 por combinação |
| --- | --- | --- | --- | --- | --- |
| 10 | 302,4 s | 90 / 90 | 9 | 3,2–5,4 ms | 69,1 ms |
| 50 | 302,4 s | 450 / 450 | 9 | 3,1–4,0 ms | 5,8 ms |

Em uma rodada separada de 300 s, uma conta autenticada abriu três abas reais do Edge headless. Foram observadas sete consultas de contador (cinco HTTP 200, uma 429 e uma 503 injetadas) e três de lista, após abrir a central. Após as duas falhas, outra aba devolveu 200 no mesmo ciclo e os ciclos seguintes voltaram ao espaçamento de cerca de 60–65 s. O Edge headless reportou as três abas como visíveis. As retentativas de uma aba isolada e a pausa por aba oculta continuam cobertas pela suíte `NotificacoesContext.test.tsx`. As medições em navegador na escala de 10/50 contas, com abas realmente ocultas e suspensão do provedor, seguem **Não executado**.

Para reproduzir a série HTTP, obtenha credenciais de contas sintéticas no ambiente descartável, faça um GET do contador por conta a cada minuto durante seis ciclos e defase o início de cada conta. Nos três últimos ciclos, acrescente um GET da lista. Registre latência e status, sem salvar o token no relatório. Compare com o ensaio de rajadas e contagens da suíte existente. Para o teste de abas, abra três páginas no mesmo perfil local e acompanhe as chamadas da central; injete 429/503 somente no navegador de QA.

O contrato estático da Vercel passou em quatro testes de proxy e cabeçalhos. O job In-App foi invocado em modo simulação local, e a suíte PostgreSQL testou falha após um lote já confirmado. Agenda hospedada, entrega HTTPS, suspensão, backup institucional e rollout continuam dependentes de ambiente autorizado. O inventário de assinaturas e outbox está documentado na [SCRUM-242](scrum-242-retencao-notificacoes.md).
