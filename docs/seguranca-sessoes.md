# Segurança: tokens JWT e política de sessão

Este documento descreve como a API emite, valida e invalida os tokens de autenticação. A implementação está em:

- `src/backend/src/services/authService.ts`
- `src/backend/src/controllers/authController.ts`
- `src/backend/src/config/cookieSessao.ts`
- `src/backend/src/middlewares/autenticar.ts`
- `src/backend/src/middlewares/verificarOrigem.ts`
- `src/backend/src/config/env.ts`

## Tokens

| Token | Onde trafega | Validade padrão | Máximo configurável |
|---|---|---|---|
| Access token | Corpo JSON das respostas de sessão. O cliente o envia em `Authorization: Bearer <token>` | 2h (`JWT_EXPIRES_IN`) | 8h |
| Refresh token | **Somente** no cookie `refreshToken` (`HttpOnly`), nunca no JSON | 12h (`JWT_REFRESH_EXPIRES_IN`), o fim absoluto da sessão | 24h |

Os dois tokens:

- são assinados exclusivamente com **HS256**. Tokens com outro algoritmo, inclusive `none`, são recusados;
- carregam `iss = fsph-frotas-api`, `aud = fsph-frotas-web`, `sub` (id do usuário), `typ` (`access` ou `refresh`), `iat` e `exp`;
- carregam `sv`, a versão da sessão do usuário (coluna `usuarios.versao_sessao`);
- carregam `sessao_exp`, o fim absoluto da sessão.

### Cookie do refresh token

| Atributo | Valor | Motivo |
|---|---|---|
| `HttpOnly` | sim | O JavaScript da página não lê o token, o que protege contra roubo por XSS |
| `Secure` | `COOKIE_SECURE`; obrigatório em produção | O cookie só trafega por HTTPS |
| `SameSite` | `Strict` | O navegador não envia o cookie em requisições originadas em outros sites |
| `Path` | `/api/auth` | O cookie só vai para as rotas de sessão, nunca para as demais rotas da API |
| `Max-Age` | tempo restante até `sessao_exp` | O cookie expira junto com a sessão |
| `Domain` | não definido | O cookie fica preso ao host que o emitiu e não depende de `onrender.com` |

O backend não depende de o JavaScript do frontend acessar o refresh token.

## Rotas de sessão

| Rota | Comportamento |
|---|---|
| `POST /api/auth/login` | Valida as credenciais e devolve `{ token, tipo, expiraEm, sessaoExpiraEm, usuario }`. Grava o cookie `refreshToken`. |
| `POST /api/auth/refresh` | Lê o refresh token **apenas do cookie**; o corpo é ignorado. Devolve um novo access token e rotaciona o cookie, mantendo o mesmo `sessao_exp`. Sem cookie, ou com cookie inválido, responde 401. |
| `PATCH /api/auth/senha` | Troca a senha, invalida as outras sessões e devolve um novo access token. Também atualiza o cookie da sessão atual. |
| `POST /api/auth/logout` | Remove o cookie (`Set-Cookie` com expiração no passado, mesmo `Path` e atributos) e responde 204. Não exige access token. |
| `GET /api/auth/me` | Rota autenticada por `Bearer`, que devolve o usuário atual. |

> **Logout não é revogação.** Remover o cookie apaga o token só deste navegador. Uma cópia do refresh ou do access token obtida antes continua válida até expirar. Para derrubar todas as sessões de um usuário, redefina a senha dele ou inative-o.

## Validação a cada requisição

1. O cabeçalho precisa estar no formato exato `Bearer <token>`. O cookie de refresh **não** autentica as rotas protegidas.
2. A assinatura, o algoritmo, o emissor, o público e a expiração são conferidos, com tolerância de relógio de 5 segundos.
3. O payload precisa ter o formato esperado:
   - `typ` correto;
   - `sub` como inteiro positivo;
   - `sv` como inteiro maior ou igual a 1;
   - `iat`, `exp` e `sessao_exp` presentes.

   Um refresh token não é aceito como access token, nem o contrário.
4. No banco, o usuário precisa existir (senão, 401) e estar ativo (senão, 403). O `sv` do token também precisa ser igual ao `versao_sessao` atual (senão, 401).
5. O perfil usado na autorização é sempre o do banco, nunca o do token.

Qualquer recusa de token responde **401 "Token inválido ou expirado"**, sem indicar o motivo. Nenhum token, cookie ou segredo é registrado em log.

## Renovação e duração máxima da sessão

A renovação **não estende** a sessão. O novo refresh mantém o mesmo `sessao_exp` do login, e o access renovado nunca passa do fim da sessão. Depois de 12h a partir do login, o usuário precisa entrar de novo. As renovações recusadas são limitadas a 20 a cada 15 minutos por IP.

O frontend deve guardar o access token apenas em memória. Ao receber 401 ou ao recarregar a página, ele chama `POST /api/auth/refresh` com `credentials: 'include'` (silent refresh). Essa adaptação é feita na task de front "[FE] Proteger armazenamento da sessão e dados no navegador".

## Invalidação de sessões (`versao_sessao`)

Cada usuário tem a coluna `versao_sessao` (`INTEGER NOT NULL DEFAULT 1`, criada no PR #111). Todo token carrega a versão vigente na emissão, no claim `sv`.

- **Troca da própria senha** (`PATCH /api/auth/senha`): a nova senha e o incremento da versão são gravados **na mesma transação**. As outras sessões caem, e a sessão que fez a troca recebe um access token e um cookie com a versão nova.
- **Redefinição pelo administrador** (`PATCH /api/usuarios/:id/senha`): incrementa a versão na mesma transação da nova senha. Todas as sessões do usuário caem, tanto access quanto refresh.
- **Inativação do usuário:** os tokens passam a receber 403 na próxima requisição.

O incremento é atômico (`UPDATE ... SET versao_sessao = versao_sessao + 1 RETURNING versao_sessao`), sem leitura prévia. Em alterações simultâneas, cada uma recebe uma versão distinta e só a mais recente continua válida.

## CORS, CSRF e proxy

### Arquitetura de produção

O navegador acessa o frontend na Vercel. A Vercel encaminha `/api/*` para a API no Render (reverse proxy). Para o navegador, tudo fica na mesma origem, e por isso o cookie `SameSite=Strict` funciona. A configuração da Vercel e do Render fica a cargo da equipe de infraestrutura.

### Variáveis

| Variável | Padrão | Função |
|---|---|---|
| `CORS_ORIGIN` | `http://localhost:5173` em desenvolvimento; vazio em produção | Lista, separada por vírgula, das origens autorizadas a fazer requisições com credenciais. Cada item é `https://dominio[:porta]`. `*` é recusado na inicialização. |
| `TRUST_PROXY` | `0` | Quantidade de proxies reversos à frente da API. Define `req.ip`, usado no limite de tentativas, e `req.protocol`. |
| `COOKIE_SECURE` | `true` em produção, `false` fora dela | Atributo `Secure` do cookie. `false` em produção é recusado. |

### CSRF

As rotas que emitem, leem ou removem o cookie (`/login`, `/refresh`, `/logout`, `/senha`) passam por `verificarOrigem`, além do `SameSite=Strict`. A requisição é recusada com **403 "Origem não autorizada"** se:

- o cabeçalho `Origin` vier com uma origem que não é a da própria API nem está em `CORS_ORIGIN` (inclusive `null`);
- o navegador marcar a requisição como `Sec-Fetch-Site: cross-site`.

Requisições sem `Origin`, como as de Postman ou de scripts, são aceitas, porque não carregam cookies de uma vítima. As demais rotas são autenticadas apenas por `Authorization: Bearer`, que o navegador não envia sozinho, e não mudam.

### Configuração em produção

- Inclua a origem do frontend em `CORS_ORIGIN`, por exemplo `CORS_ORIGIN=https://fsph-web.vercel.app`. Atrás do rewrite, o `Host` recebido pelo Render pode não coincidir com o `Origin` do navegador.
- Ajuste `TRUST_PROXY` ao número de proxies da infraestrutura.
- Mantenha `NODE_ENV=production`, para que o cookie seja `Secure`.

## Segredo de assinatura

`JWT_SECRET` é obrigatório. A API não inicia se ele:

- tiver menos de 32 caracteres;
- for um dos valores de exemplo da documentação;
- tiver menos de 10 caracteres distintos.

As mensagens de erro não exibem o valor. Para gerar um segredo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`JWT_EXPIRES_IN` e `JWT_REFRESH_EXPIRES_IN` usam o formato `<número><s|m|h|d>`. O refresh precisa ser mais longo que o access.

## Limitações conhecidas

- **Sem revogação individual de sessões.** Não há uma tabela de sessões, então não é possível revogar um token específico antes da expiração, nem detectar o reuso de um refresh token. A versão da sessão derruba **todas** as sessões do usuário de uma vez.
- **Troca do segredo.** Alterar `JWT_SECRET` invalida todas as sessões. Não há rotação com dois segredos simultâneos.
- **Limite por IP.** O controle de tentativas usa memória local, por instância, e o IP da requisição. Com várias instâncias, ele exigiria um armazenamento compartilhado.
