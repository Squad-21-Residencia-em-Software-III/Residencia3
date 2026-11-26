# SCRUM-241: liberação dos avisos e dos alertas no aparelho

Como ligar a central de avisos e o Web Push em produção aos poucos, como acompanhar e como desfazer. Tudo no plano gratuito: Render (API), Vercel (front) e Neon (banco). **Nenhuma mudança em produção sem aprovação da liderança.**

Referências: [SCRUM-229](scrum-229-publicacao-e-fila.md) (fila), [SCRUM-237](scrum-237-envio-push.md) (envio e VAPID), [SCRUM-238](scrum-238-contrato-push.md) (tela), [SCRUM-230](scrum-230-avisos-solicitacoes.md) (A4 pela rotina), [SCRUM-242](scrum-242-retencao-notificacoes.md) (retenção).

## Chaves de liberação

| Onde | Variável | Efeito | Desfazer |
|---|---|---|---|
| Render | `NOTIFICACOES_ATIVAS` | `true`: as operações publicam avisos. A API só sobe com as tabelas das SCRUM-225 e 228 | `false`: nada é publicado. Os avisos já criados continuam no banco |
| Render | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | As três juntas, com `NOTIFICACOES_ATIVAS=true`, ligam o envio. Só uma ou duas: a API não sobe | Apagar as três: rotas de assinatura respondem `503`, a fila não envia, a central continua. **Guardar o par antes** (veja abaixo) |
| Vercel | `VITE_NOTIFICACOES_IN_APP_ATIVAS` | `true`: sino, central e contador | `false` e novo deploy |
| Vercel | `VITE_WEB_PUSH_ATIVO` | `true`: oferece ligar os alertas nas preferências | `false` e novo deploy. Os aparelhos já assinados param de receber se o Render também desligar |
| GitHub (variável) | `FSPH_EXPIRACAO_AVISOS_ATIVOS` | `true`: a rotina de expiração publica o A4 | `false` |
| GitHub (variável) | `FSPH_API_URL` | URL pública da API, para acordá-la depois do A4 (veja abaixo) | Vazia: não acorda |
| GitHub (variável) | `FSPH_RETENCAO_NOTIFICACOES_MODO` | `simular` ou `aplicar` a retenção (SCRUM-242) | Vazia: não roda |

- As variáveis `VITE_*` entram no build: mudar na Vercel só vale depois de **um novo deploy**.
- A chave privada VAPID fica **só no Render**. Nunca numa variável `VITE_*`, no repositório, num print ou num log. O front recebe a pública por `GET /api/notificacoes/vapid-public-key`.
- **Não trocar o par VAPID** depois de liberado: todas as assinaturas deixam de valer, e cada pessoa precisa ligar os alertas de novo.
- **Desligar por um tempo não é trocar:** antes de apagar as chaves no Render, confirmar que o par original (pública e privada) está guardado no cofre da equipe. Para religar, usar **o mesmo par**: as assinaturas continuam valendo, e ninguém precisa ligar os alertas de novo. Um par novo só em caso de vazamento da chave privada.

## Etapas

Cada etapa só começa quando a anterior estiver estável por pelo menos um dia de uso.

### 0. Pré-requisitos

1. Migrations das SCRUM-225, 228 e 236 aplicadas no Neon (`npm run migrate` com a role de migração).
2. `PROXY_SECRET` igual na Vercel e no Render (já usado pelo proxy `/api`).
3. Roles das rotinas provisionadas (`provisionar-roles-cron.cjs`), se o A4 ou a retenção forem ligados.

### 1. Avisos dentro do sistema

1. Render: `NOTIFICACOES_ATIVAS=true`. Novo deploy.
2. Conferir no log da partida: `{"evento":"PUSH_DESLIGADO","notificacoes_ativas":true}`.
3. Vercel: `VITE_NOTIFICACOES_IN_APP_ATIVAS=true`. Novo deploy.
4. Conferir: o sino aparece, e `GET /api/notificacoes/metricas` (Administrador) mostra `avisos.criados_na_janela` subindo com o uso.

**Desfazer:** `VITE_NOTIFICACOES_IN_APP_ATIVAS=false` esconde o sino sem perder nada. `NOTIFICACOES_ATIVAS=false` para de publicar.

### 2. Alertas no aparelho

Depende da SCRUM-239 publicada (service worker com `push` e `notificationclick`).

1. Gerar o par fora do servidor: `npx web-push generate-vapid-keys`. Guardar a privada no cofre da equipe.
2. Render: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (`mailto:` de um contato da equipe). Novo deploy.
3. Conferir no log da partida: `{"evento":"PUSH_LIGADO","notificacoes_ativas":true}`.
4. Vercel: `VITE_WEB_PUSH_ATIVO=true`. Novo deploy.
5. Primeiro só com a equipe: ligar os alertas em Android/Chrome, desktop e iOS (PWA instalado). Seguir o roteiro da SCRUM-238.
6. Conferir nas métricas: `aparelhos.ativos` sobe, e `fila.encerrados.enviados` cresce sem `falhas`.

**Desfazer:** `VITE_WEB_PUSH_ATIVO=false` para de oferecer. Apagar as três chaves VAPID para de enviar, depois de conferir que o par original está guardado. Para religar, voltar **o mesmo par**. Nos dois casos, os avisos continuam na central.

### 3. Rotinas

1. A4: provisionar a role, depois `FSPH_EXPIRACAO_AVISOS_ATIVOS=true` e `FSPH_API_URL` (por exemplo, a URL do Render).
2. Retenção: `FSPH_RETENCAO_NOTIFICACOES_MODO=simular` por alguns dias, conferir os totais no log do workflow, depois `aplicar`.

## Render gratuito: API dormindo

O Render gratuito suspende a API depois de alguns minutos sem acesso, e a primeira requisição seguinte a acorda, com alguma demora. A fila de push roda dentro da API, então **não envia nada enquanto ela dorme**. Não há worker 24/7.

- **Avisos criados por alguém usando o sistema:** a API está acordada, e a fila envia logo depois do commit.
- **Na partida:** a API retoma o que ficou pendente (`definirEnviadorPush`). Toda requisição a `/api` também acorda a fila, no máximo uma vez por minuto.
- **A4 (rotina do GitHub Actions):** a rotina grava direto no banco, sem a API. Por isso o workflow chama `GET /api/status` quando expirou algum pedido e os avisos estão ligados. Se a chamada falhar, a expiração não é desfeita, e o alerta sai na próxima vez que alguém usar o sistema.
- **Validade:** um alerta pendente há mais de 24 h é encerrado como `PRAZO_ENCERRADO` (`IGNORADO`). O aviso continua na central.

## Custo e desempenho (NF-25 e NF-26)

Os serviços de push (Google, Mozilla, Microsoft e Apple) não cobram. O custo é o tráfego da Vercel, as horas do Render e o processamento do Neon. Abaixo, **estimativa** é conta feita a partir do código; **medição** é o que foi rodado de fato, num banco local descartável.

### Quantas consultas o sino faz (estimativa, pelo código do front)

| Situação | Consultas |
|---|---|
| Aba visível, central fechada | 1 contador por minuto |
| Aba visível, central aberta | 1 lista (20 avisos e o contador) por minuto, no lugar do contador |
| Abrir a central | 1 lista |
| Voltar o foco à aba ou à janela | 1 contador, no máximo a cada 5 s por aba |
| Aba em segundo plano ou sem rede | Nenhuma |

- **Várias abas:** no mesmo navegador, só a aba da frente fica visível e consulta. Duas janelas lado a lado consultam as duas. Alternar entre janelas soma uma consulta por troca.
- **Pior caso** (todos com a tela aberta 8 h por dia em 22 dias, sem contar as trocas de foco):

| Pessoas | Janelas visíveis por pessoa | Por minuto | Por mês |
|---|---|---|---|
| 10 | 1 | até 10 | até ~106 mil |
| 50 | 1 | até 50 | até ~528 mil |
| 50 | 2 | até 100 | até ~1,06 milhão |

- Cada consulta passa pelo proxy da Vercel e mantém o Render e o Neon acordados no horário de uso. Antes de abrir para todos, comparar com o uso nos painéis da Vercel, do Render e do Neon, porque as cotas gratuitas mudam.
- **Para reduzir:** a chave do front vale para todos (o build é um só), então não dá para liberar a central só para um grupo. As opções são adiar a etapa 1 ou aumentar `INTERVALO_POLLING_NOTIFICACOES_MS` no front, com novo deploy.

### Medição com histórico acumulado

`src/backend/src/tests/desempenhoNotificacoesPostgres.test.ts`, fora do CI porque gera ~270 mil linhas. Para repetir, num banco novo depois de `npm run migrate`:

```bash
SCRUM241_DESEMPENHO=1 SCRUM241_RELATORIO=relatorio.json npx vitest run src/tests/desempenhoNotificacoesPostgres.test.ts
```

- **Massa:** 50 pessoas, 167 mil avisos espalhados por 90 dias (uma pessoa com 20 mil; 3 em 4 lidos), 100 mil itens na fila e 150 aparelhos. Tabelas analisadas (`ANALYZE`) antes de medir.
- **O que mede:** as requisições reais da API (sessão, escopo e consulta), o `EXPLAIN ANALYZE` das consultas que a API fez, e rajadas e vazão contra a API rodando nesta máquina.
- **Resultado, em 2 rodadas:**

| Consulta | Índice usado | Tempo no banco |
|---|---|---|
| Contador (pessoa com 20 mil avisos) | `idx_notificacoes_usuario_nao_lidas` | 3 a 6 ms |
| Central, primeira página | `idx_notificacoes_usuario_cursor` | 0,1 a 2,7 ms, mais o contador |
| Central, página antiga | `idx_notificacoes_usuario_cursor` | 0,2 ms, mais o contador |
| Métricas: fila aberta | `idx_notificacao_outbox_fila_pendente` | 0,1 a 1 ms |
| Métricas: encerrados em 24 h | `idx_notificacao_outbox_retencao_terminal` | 1,6 a 1,7 ms |
| Métricas: avisos em 24 h | `idx_notificacoes_criado_em` | 6,4 a 6,5 ms |

| Rota, pela API | p50 | p95 |
|---|---|---|
| Contador, pessoa típica (200 chamadas) | 3,5 ms | 5,6 ms |
| Contador, pessoa com 20 mil avisos (200) | 5,5 ms | 8,4 ms |
| Central, pessoa com 20 mil avisos (100) | 6 ms | 10,5 ms |
| Métricas (30) | 4,5 a 6,1 ms | 18,7 ms |

- **Vazão do contador:** ~650 por segundo com 5 clientes e ~740 com 20. A demanda estimada é de 0,17 por segundo (10 pessoas) a 2,5 por segundo (50 pessoas com 3 janelas).
- **Corrigido por causa da medição:** a janela de 24 h das métricas usava `clock_timestamp()`, que muda a cada linha e impede o índice. As duas consultas liam as tabelas inteiras (40 a 50 ms cada; p95 da rota de 158 ms). Com `now()`, usam os índices acima. O teste falha se alguma consulta voltar a ler `notificacoes` ou `notificacao_outbox` inteira.

### Limites que aparecem com mais gente

- **Rajada (medição):** a API atende até `MAX_REQUISICOES_SIMULTANEAS` (padrão 50) requisições ao mesmo tempo. Com 100 consultas no mesmo instante, 50 foram atendidas e 50 receberam `503`; com 150, 100 receberam `503`. No uso normal as consultas se espalham pelo minuto. O sino ignora a falha e tenta de novo no próximo ciclo. Pode acontecer quando muita gente volta ao sistema ao mesmo tempo, como quando o Render acorda. Se `503` aparecer com frequência no log, avaliar subir o limite, considerando a memória do plano gratuito.
- **Limite por IP (estimativa):** a leitura é limitada a `RATE_LIMIT_LEITURA_POR_MIN` (padrão 300) por IP de origem. Se a rede da FSPH sair para a internet por um único IP, todas as pessoas dividem esse limite: 50 pessoas com 2 janelas já somam 100 consultas por minuto só do sino, além da navegação. Antes da etapa 1, confirmar com a TI como é a saída. Se for um IP só, ajustar `RATE_LIMIT_LEITURA_POR_MIN` no Render.

### O que a medição não cobre

- A rede até o Render e o Neon, a partida a frio do Render e o processador do plano gratuito, mais lento que o desta máquina. Os tempos reais serão maiores; a proporção entre consultas e a escolha dos índices se mantêm.
- As tabelas de origem (solicitações, viagens, ordens) estavam vazias. A conferência de acesso da central roda só para os 20 avisos da página.
- Nada foi executado no Neon real.

## Acompanhamento

### Métricas (`GET /api/notificacoes/metricas`)

Só o Administrador. Só totais, das últimas 24 h, com `Cache-Control: no-store`. Sem usuário, endpoint, chave, texto do aviso ou registro de origem.

```json
{
  "gerado_em": "2026-11-26T12:00:00.000Z",
  "janela_horas": 24,
  "configuracao": { "notificacoes_ativas": true, "push_configurado": true },
  "fila": {
    "pendentes": 0,
    "processando": 0,
    "pendente_mais_antigo_segundos": null,
    "encerrados": { "enviados": 42, "parciais": 1, "ignorados": 30, "falhas": 0 },
    "motivos": { "CATEGORIA_DESLIGADA": 25, "SEM_ASSINATURA": 5 }
  },
  "aparelhos": { "ativos": 12, "usuarios": 9, "expirados_na_janela": 1 },
  "avisos": { "criados_na_janela": 120 }
}
```

| Sinal | Provável causa | O que fazer |
|---|---|---|
| `pendente_mais_antigo_segundos` acima de 3600 | API dormindo ou fila parada | Abrir o sistema ou chamar `/api/status`. Persistindo, ver `PUSH_FILA_FALHOU` no log |
| `falhas` subindo | Chaves VAPID, host fora de `PUSH_HOSTS_PERMITIDOS` ou serviço de push recusando | Ver `motivos` e o log. Se for geral, desfazer a etapa 2 |
| Muitos `CATEGORIA_DESLIGADA` ou `SEM_ASSINATURA` | Esperado: os alertas são opcionais | Nada |
| `expirados_na_janela` alto | Aparelhos que desinstalaram o app ou tiraram a permissão | Nada: saem do limite de 5 aparelhos sozinhos |
| `push_configurado: false` com a etapa 2 feita | Chaves ausentes no Render | Conferir as três variáveis e o log da partida |

Motivos possíveis:

- **Ignorados:** `PRAZO_ENCERRADO`, `USUARIO_INATIVO`, `CATEGORIA_DESLIGADA`, `SEM_ASSINATURA`, `ACESSO_REVOGADO`.
- **Falhas:** `APARELHOS_REJEITADOS`, `PROCESSO_INTERROMPIDO`, `TIMEOUT`, `REDE` e `HTTP_<status>` (resposta do serviço de push depois das 5 tentativas).

Qualquer outro valor aparece como `OUTRO`, para nunca expor texto livre.

### Log do Render

Linhas JSON com códigos fixos, sem dado pessoal:

| Evento | Quando |
|---|---|
| `PUSH_LIGADO` / `PUSH_DESLIGADO` | Partida da API, com `notificacoes_ativas` |
| `PUSH_FILA_PROCESSADA` | Fim de cada rodada da fila, com os totais (`enviados`, `adiados`, `ignorados`, `falhas`, `vencidos`) |
| `PUSH_FILA_FALHOU` | Rodada interrompida por erro |
| `PUSH_ITEM_INTERROMPIDO` | Um item deu erro inesperado e volta a ser tentado |
| `PUSH_REGISTRO_ASSINATURA_FALHOU` | Falhou ao marcar o resultado de um aparelho |

## Vercel

`vercel.json` já atende: `sw.js`, `registerSW.js` e o manifesto sem cache longo (um service worker novo chega no próximo acesso), e `/api` levado ao Render com o `PROXY_SECRET`, antes dos arquivos e do `index.html`. O teste `src/frontend/src/config/vercel.test.ts` impede que uma mudança quebre isso.

## Testes

- `metricasNotificacoesPostgres.test.ts`: totais da fila, dos aparelhos e dos avisos pela rota real, janela de 24 h, motivo fora da lista virando `OUTRO` (texto livre e código inventado), nenhum dado pessoal na resposta, `no-store` e acesso só do Administrador. Roda no CI com `SCRUM241_POSTGRES_TESTS=1`.
- `metricasNotificacoes.test.ts`: a lista de motivos aceitos e os valores que viram `OUTRO`.
- `desempenhoNotificacoesPostgres.test.ts`: a medição acima, fora do CI.
- `matrizAcesso.test.ts`: a rota para todos os perfis.
- `vercel.test.ts` (front): cabeçalhos do service worker e do manifesto, proxy com segredo e ordem das rotas.
- Workflow da expiração: o passo roda com `pipefail`, então uma falha do script derruba o passo mesmo com o `tee`. Conferido executando o bloco do workflow com um `npm` simulado: falha da expiração (antes passava como sucesso), falha depois de imprimir o total, 2 expiradas, nenhuma e segredo ausente. Só o despertar da API é tolerado se falhar, e ele só roda com `FSPH_EXPIRACAO_AVISOS_ATIVOS=true` e `FSPH_API_URL` definida.
