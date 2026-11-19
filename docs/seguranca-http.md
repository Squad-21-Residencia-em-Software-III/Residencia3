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

- Configure o `TRUST_PROXY` para a topologia direta do Render e confira o valor em homologação. O Express usa essa configuração para determinar o IP direto e o protocolo.
- O rewrite estático em `src/frontend/vercel.json` substitui `X-Proxy-Secret` pela variável `PROXY_SECRET` no encaminhamento da API. O segredo precisa ser aleatório e igual nos dois provedores. O recurso trata o valor literal da variável ausente como credencial inválida.
- Com segredo válido, a API aceita somente um endereço IPv4 ou IPv6 de `X-Vercel-Forwarded-For`, o cabeçalho de IP da borda descrito pela [Vercel](https://vercel.com/docs/headers/request-headers). Confirme em homologação que a borda define esse cabeçalho e que o rewrite o entrega ao Render.
- Com credencial ou endereço inválido, vale a seleção direta do Express. Se o endereço da Vercel faltar, os clientes encaminhados podem compartilhar o contador da borda. O limitador padrão continua agrupando IPv6 por sub-rede.
- O roteamento estático preserva o caminho de upload de fotos de até 10 MB. A etapa `filesystem` mantém a precedência dos arquivos estáticos antes do fallback para a SPA.

### Como validar (e revalidar após mudanças na hospedagem)

1. Configure `PROXY_SECRET` na Vercel em Preview e Production, e no Render. Use um valor aleatório de alta entropia e uma variável sem prefixo `VITE_`. Aplique as configurações com um novo deploy dos ambientes autorizados.
2. Em ambiente autorizado, configure temporariamente `DIAGNOSTICO_PROXY_TOKEN` no Render. A rota devolve somente IP e caminho e usa `Cache-Control: no-store`.
3. Exporte o token por um meio seguro e rode a partir de `src/backend`:

   ```bash
   node scripts/diagnosticar-proxy.cjs --direto <origem-https-render> --vercel <origem-https-vercel>
   ```

   O script consulta uma vez cada caminho e retorna erro se o IP ou o caminho não for consistente. Ele publica apenas a família do IP e o resultado. Repita em redes com IPv4 e IPv6, conforme disponíveis.
4. Verifique filtros e paginação, leitura e escrita, rotas internas da SPA, cabeçalhos, login, refresh, logout e upload do odômetro no preview. Execute a suíte local do backend para validar o rate limit.
5. Remova `DIAGNOSTICO_PROXY_TOKEN` após a validação. A rota volta a responder 404.

## Rate limit

Os limites gerais por tipo de operação (leitura, escrita e consultas pesadas), a concorrência e os tempos limite estão em [limites-e-timeouts.md](limites-e-timeouts.md). Abaixo, a relação com o proxy.

Os limites de login (10 falhas a cada 15 minutos) e de renovação de sessão (20 falhas a cada 15 minutos) são contados por `req.ip`, que depende do `TRUST_PROXY`.

As validações do `express-rate-limit` ficam ativas e registram no log:

- `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` quando chega um `X-Forwarded-For` e nenhum proxy é confiável, o sinal de `TRUST_PROXY` ausente atrás de um proxy;
- `ERR_ERL_PERMISSIVE_TRUST_PROXY` quando a confiança é irrestrita. O `env.ts` já recusa esse caso antes.

O contador fica em memória, por instância. Com várias instâncias, ele exigiria um armazenamento compartilhado.
