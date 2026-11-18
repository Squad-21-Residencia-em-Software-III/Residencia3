# Segurança HTTP: CORS, cabeçalhos e trust proxy

Este documento cobre a configuração de transporte da API:

- **CORS:** quem pode chamar a API pelo navegador;
- **cabeçalhos de segurança:** como o navegador deve tratar as respostas;
- **trust proxy:** como a API identifica o IP real do cliente atrás dos proxies da hospedagem.

A implementação está em:

- `src/backend/src/app.ts`
- `src/backend/src/config/segurancaHttp.ts`
- `src/backend/src/config/env.ts`
- `src/backend/src/middlewares/limitarTentativasLogin.ts`

A política de tokens e sessão está em [seguranca-sessoes.md](seguranca-sessoes.md).

## CORS por ambiente

| Ambiente | `CORS_ORIGIN` | Resultado |
|---|---|---|
| Desenvolvimento | não definido | `http://localhost:5173` (Vite) |
| Produção | não definido | Nenhuma origem cruzada. O frontend usa a mesma origem via proxy `/api` da Vercel. |
| Qualquer um | lista separada por vírgula | Somente essas origens |

Regras:

- `*` e valores que não sejam origens (`https://dominio[:porta]`, sem caminho) são recusados na inicialização;
- em produção, só origens `https` são aceitas;
- as requisições usam credenciais (`Access-Control-Allow-Credentials: true`), porque o refresh token vai em cookie;
- métodos permitidos: `GET, POST, PUT, PATCH, DELETE`. Cabeçalhos permitidos: `Content-Type, Authorization`. O preflight fica em cache por 10 minutos.

Para uma origem não autorizada, a API não envia `Access-Control-Allow-Origin`, e o navegador bloqueia a leitura da resposta. O CORS não substitui autenticação: as rotas continuam exigindo `Bearer`. A proteção contra CSRF das rotas de sessão está em [seguranca-sessoes.md](seguranca-sessoes.md#csrf).

## Cabeçalhos de segurança (Helmet)

A API só responde JSON, então a política é restritiva. Os cabeçalhos valem para todas as respostas, inclusive erros e 404.

| Cabeçalho | Valor | Motivo |
|---|---|---|
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` | Nada da API deve ser executado ou embutido como página |
| `Strict-Transport-Security` | `max-age=15552000; includeSubDomains` (180 dias), **só em produção** | Força HTTPS. Em desenvolvimento a API roda em `http://localhost` |
| `X-Content-Type-Options` | `nosniff` | Impede o navegador de reinterpretar o tipo da resposta |
| `X-Frame-Options` | `DENY` | Impede *clickjacking* em navegadores antigos |
| `Referrer-Policy` | `no-referrer` | Não vaza URLs da API para terceiros |
| `Cross-Origin-Resource-Policy` | `same-site` | Bloqueia a inclusão das respostas por outros sites, e mantém o dev local (5173 → 3000) funcionando |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isola o contexto de navegação |
| `X-DNS-Prefetch-Control` | `off` | Desativa o prefetch de DNS |
| `X-Permitted-Cross-Domain-Policies` | `none` | Bloqueia políticas de Flash e PDF |
| `X-Powered-By` | removido | Não revela a tecnologia do servidor |

## Trust proxy e IP real do cliente

Em produção, a API pode ser acessada por dois caminhos, e eles têm quantidades diferentes de proxies:

```
direto: cliente → borda do Render → API
Vercel: cliente → Vercel (rewrite /api) → borda do Render → API
```

Cada proxy acrescenta ao `X-Forwarded-For` o IP de quem o chamou. Como qualquer cliente também pode enviar esse cabeçalho, o Express só deve acreditar nas entradas acrescentadas por proxies **confiáveis**. O `TRUST_PROXY` declara quais são **no caminho direto**. O salto extra da Vercel é tratado pelo `PROXY_SECRET`, descrito em [Decisão e validação](#decisão-e-validação).

| Formato | Exemplo | Significado |
|---|---|---|
| Número de saltos | `2` | Confia nos 2 proxies mais próximos da API. O IP do cliente é a entrada anterior a eles. |
| Lista de IPs/CIDRs | `10.0.0.0/8, 76.76.21.0/24` | Confia só nesses endereços. Também aceita `loopback`, `linklocal` e `uniquelocal`. |
| Vazio ou `0` | `0` | Não confia em proxy nenhum. O IP é o da conexão. Só é permitido fora de produção. |

Valores recusados na inicialização:

- **`true`, `*` e faixas `/0`:** confiar em qualquer proxy deixaria qualquer cliente forjar o próprio IP e escapar do limite de tentativas;
- **ausência em produção:** a cadeia precisa ser declarada de forma consciente. Não se presume 0 nem 1. Se presumíssemos 1 numa cadeia de 2, o IP identificado seria o da Vercel, e todos os usuários dividiriam o mesmo limite de login (há teste que demonstra isso).

## Decisão e validação

### Por que um `TRUST_PROXY` fixo não basta

| `TRUST_PROXY` | Caminho direto | Caminho da Vercel |
|---|---|---|
| `1` | Correto: o IP é o que a borda do Render acrescentou | **Errado:** o IP identificado é o da Vercel, e todos os usuários do frontend dividem o mesmo limite de login |
| `2` | **Inseguro:** o cliente envia `X-Forwarded-For: <qualquer>` e escolhe o próprio IP, contornando o rate limit | Correto |
| CIDRs da Vercel | Não se aplica: a Vercel não publica faixas fixas de saída, exceto no Secure Compute, um recurso pago | |

### Decisão

- `TRUST_PROXY=1`: só a borda do Render é confiável. Vale para os dois caminhos e define `req.protocol`.
- A Vercel se identifica com o cabeçalho `X-Proxy-Secret`, definido no `src/frontend/vercel.json` com `"op": "set"`. O `set` substitui qualquer valor enviado pelo visitante. O valor vem da variável de ambiente `PROXY_SECRET` da Vercel e não fica no repositório.
- A API (`src/backend/src/middlewares/identificarCliente.ts`) compara o cabeçalho com o seu `PROXY_SECRET` em tempo constante:
  - **segredo válido:** confia em mais um salto (o da Vercel), e `req.ip` passa a ser o endereço anterior a ele, que é o cliente. Segundo a documentação da Vercel, no rewrite para uma origem externa ela envia `X-Forwarded-For` com o IP público do visitante;
  - **sem segredo, ou com segredo errado:** é tratado como acesso direto, sem confiar em nenhum salto extra.
- O cabeçalho é removido antes das rotas e nunca aparece em logs.
- O rate limit continua usando o `keyGenerator` padrão do `express-rate-limit`, porque é nele que rodam as validações `ERR_ERL_*`. Um `keyGenerator` próprio as desligaria.
- O mesmo cliente tem um só contador nos dois caminhos.

Se o `PROXY_SECRET` não estiver configurado, a API funciona como antes: no caminho da Vercel, o IP identificado é o da Vercel. Isso é seguro, mas os limites ficam compartilhados. Por isso a variável deve ser definida nos dois lados.

### Como validar (e revalidar após mudanças na hospedagem)

1. Gere dois segredos aleatórios, por exemplo com `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
2. Configure as variáveis:
   - Render: `PROXY_SECRET`, que deve ser idêntico ao da Vercel, e `DIAGNOSTICO_PROXY_TOKEN`. Este último é temporário e liga a rota `/api/diagnostico/ip`.
   - Vercel: `PROXY_SECRET`, em Production e Preview. Depois, faça um redeploy.
3. De uma rede, rode:
   ```bash
   cd src/backend
   DIAGNOSTICO_PROXY_TOKEN=... node scripts/diagnosticar-proxy.cjs \
     --direto https://fsph-api.onrender.com --vercel https://fsph-web.vercel.app --rede wifi
   ```
   Repita de outra rede, por exemplo `--rede 4g`, para provar que os limites são por cliente.
4. O script salva `docs/evidencias/proxy-<data>-<rede>.json`, com o último bloco dos IPs mascarado, e termina com código 1 se alguma verificação falhar. Verificações:
   - `diretoIdentificaTestador` e `vercelIdentificaTestador`: o IP identificado é o IP público do testador;
   - `forjadoIgnoradoNosDois` e `segredoFalsoIgnoradoNosDois`: um `X-Forwarded-For` ou `X-Proxy-Secret` enviado pelo cliente não muda nada;
   - `diretoComecouLiberado` e `diretoBloqueouNaTentativa11`: um IP novo tem o próprio contador e é bloqueado após 10 falhas de login;
   - `forjadoNaoLiberou*`: trocar o `X-Forwarded-For` depois do bloqueio não libera novas tentativas;
   - `vercelHerdouBloqueioDoMesmoCliente`: o caminho da Vercel já começa bloqueado, porque conta pelo IP do testador, e não pelo da Vercel.
5. Nos logs do Render, no período do teste, confirme que não há `ERR_ERL_*`.
6. Remova `DIAGNOSTICO_PROXY_TOKEN` do Render. A rota volta a responder 404.

O teste consome as 10 falhas de login da janela de 15 minutos do IP do testador. Cada falha gera um registro de auditoria `LOGIN_FALHOU` com e-mail inexistente.

Se o resultado medido divergir do esperado, por exemplo se a borda do Render não acrescentar o IP da Vercel, o `identificarCliente` mantém o `req.ip`. Nesse caso, o JSON do diagnóstico (`cabecalhos`, `reqIps`, `ipPeloTrustProxy`) mostra a cadeia real. Ajuste o `TRUST_PROXY` com base nele e registre aqui a nova decisão.

## Rate limit

Os limites gerais por tipo de operação (leitura, escrita e consultas pesadas), a concorrência e os tempos limite estão em [limites-e-timeouts.md](limites-e-timeouts.md). Abaixo, a relação com o proxy.

Os limites de login (10 falhas a cada 15 minutos) e de renovação de sessão (20 falhas a cada 15 minutos) são contados por `req.ip`, que depende do `TRUST_PROXY`.

As validações do `express-rate-limit` ficam ativas e registram no log:

- `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` quando chega um `X-Forwarded-For` e nenhum proxy é confiável, o sinal de `TRUST_PROXY` ausente atrás de um proxy;
- `ERR_ERL_PERMISSIVE_TRUST_PROXY` quando a confiança é irrestrita. O `env.ts` já recusa esse caso antes.

O contador fica em memória, por instância. Com várias instâncias, ele exigiria um armazenamento compartilhado.
