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

Com BroadcastChannel e Web Locks, abas visíveis compartilham o resultado do contador por conta. A consulta inicial é distribuída em até dois segundos. A próxima sincronização periódica ocorre após 60 segundos e as falhas temporárias acionam nova tentativa com espera progressiva de 5 a 60 segundos, mais variação de até um segundo. A central aberta mantém sua atualização de lista. Navegadores sem suporte continuam usando o polling individual.

Em PostgreSQL 17 local descartável, `desempenhoNotificacoesPostgres.test.ts` passou os cinco casos. Com 168.936 avisos, 100.062 registros de fila e 188 assinaturas, a simulação com 10 e 50 usuários em duas e três abas teve 360 respostas HTTP 200 em três ciclos por cenário. O maior p95 do contador nos ciclos coordenados foi 19,4 ms. Na rajada de controle, 100 requisições receberam 503. A recuperação após 5 segundos fez uma tentativa por usuário afetado e os 34 receberam HTTP 200. O teste simula a coordenação na carga HTTP. Suspensão real e reconexão em Render/Neon requerem um ambiente isolado autorizado.
