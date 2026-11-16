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

Em produção, a requisição percorre uma cadeia de proxies antes de chegar à API:

```
navegador → Vercel (rewrite /api) → balanceador do Render → API
```

Cada proxy acrescenta ao `X-Forwarded-For` o IP de quem o chamou. Como qualquer cliente também pode enviar esse cabeçalho, o Express só deve acreditar nas entradas acrescentadas por proxies **confiáveis**. O `TRUST_PROXY` declara quais são.

| Formato | Exemplo | Significado |
|---|---|---|
| Número de saltos | `2` | Confia nos 2 proxies mais próximos da API. O IP do cliente é a entrada anterior a eles. |
| Lista de IPs/CIDRs | `10.0.0.0/8, 76.76.21.0/24` | Confia só nesses endereços. Também aceita `loopback`, `linklocal` e `uniquelocal`. |
| Vazio ou `0` | `0` | Não confia em proxy nenhum. O IP é o da conexão. Só é permitido fora de produção. |

Valores recusados na inicialização:

- **`true`, `*` e faixas `/0`:** confiar em qualquer proxy deixaria qualquer cliente forjar o próprio IP e escapar do limite de tentativas;
- **ausência em produção:** a cadeia precisa ser declarada de forma consciente. Não se presume 0 nem 1. Se presumíssemos 1 numa cadeia de 2, o IP identificado seria o da Vercel, e todos os usuários dividiriam o mesmo limite de login (há teste que demonstra isso).

### Como calibrar no Render

1. Com o deploy no ar, faça uma requisição a partir de um IP conhecido, passando pelo domínio da Vercel.
2. Nos logs do Render, observe o `X-Forwarded-For` que chega à API, ou consulte a documentação do Render e da Vercel sobre os proxies de cada um.
3. Conte quantas entradas ficam **depois** do seu IP e some 1 (o balanceador do Render, que é a conexão direta com a API). Esse é o número de saltos. Por exemplo, `seu-ip, ip-da-vercel` com o balanceador do Render conectando dá `TRUST_PROXY=2`.
4. Se os provedores publicarem as faixas de IP dos proxies, prefira a lista de CIDRs. Ela continua correta mesmo que a quantidade de saltos mude.
5. Depois de ajustar, confirme que os logs não têm erros `ERR_ERL_*` do limitador.

## Rate limit

Os limites de login (10 falhas a cada 15 minutos) e de renovação de sessão (20 falhas a cada 15 minutos) são contados por `req.ip`, que depende do `TRUST_PROXY`.

As validações do `express-rate-limit` ficam ativas e registram no log:

- `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` quando chega um `X-Forwarded-For` e nenhum proxy é confiável, o sinal de `TRUST_PROXY` ausente atrás de um proxy;
- `ERR_ERL_PERMISSIVE_TRUST_PROXY` quando a confiança é irrestrita. O `env.ts` já recusa esse caso antes.

O contador fica em memória, por instância. Com várias instâncias, ele exigiria um armazenamento compartilhado.
