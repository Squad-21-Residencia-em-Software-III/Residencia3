# Segurança: tokens JWT e política de sessão

Este documento descreve como a API emite, valida e invalida os tokens de autenticação. A implementação está em `src/backend/src/services/authService.ts`, `src/backend/src/middlewares/autenticar.ts` e `src/backend/src/config/env.ts`.

## Tokens

O login (`POST /api/auth/login`) devolve dois tokens:

| Token | Uso | Validade padrão | Máximo configurável |
|---|---|---|---|
| `token` (access) | Cabeçalho `Authorization: Bearer <token>` em todas as rotas protegidas | 2h (`JWT_EXPIRES_IN`) | 8h |
| `refreshToken` | Somente em `POST /api/auth/refresh`, para obter um novo par de tokens | 12h (`JWT_REFRESH_EXPIRES_IN`) | 24h |

Os dois tokens:

- são assinados exclusivamente com **HS256**. Tokens com outro algoritmo, inclusive `none`, são recusados;
- carregam `iss = fsph-frotas-api`, `aud = fsph-frotas-web`, `sub` (id do usuário), `typ` (`access` ou `refresh`), `iat` e `exp`;
- carregam `sh`, a impressão digital da senha atual: HMAC-SHA256 do id e do hash da senha, calculado com o segredo do servidor. O hash da senha não aparece no token;
- carregam `sessao_exp`, o fim absoluto da sessão.

O `refreshToken` vem no corpo da resposta e, no frontend, fica no `localStorage`, junto com o access token (veja as limitações abaixo).

## Validação a cada requisição

1. O cabeçalho precisa estar no formato exato `Bearer <token>`.
2. A assinatura, o algoritmo, o emissor, o público e a expiração são conferidos. A tolerância de relógio é de 5 segundos.
3. O payload precisa ter o formato esperado: `typ` correto, `sub` como inteiro positivo, `iat`, `exp`, `sh` e `sessao_exp`. Um refresh token não é aceito como access token, nem o contrário.
4. No banco, o usuário precisa existir (senão, 401), estar ativo (senão, 403) e ter a mesma senha da época da emissão (senão, 401).
5. O perfil usado na autorização é sempre o do banco, nunca o do token.

Qualquer recusa responde **401 "Token inválido ou expirado"**, sem indicar o motivo. Nenhum token ou segredo é registrado em log.

## Renovação e duração máxima da sessão

`POST /api/auth/refresh` com `{ "refreshToken": "..." }` devolve um novo par de tokens, mas **não estende** a sessão: o novo refresh mantém o mesmo `sessao_exp` do login. O access renovado nunca passa do fim da sessão. Depois de 12h a partir do login, o usuário precisa entrar de novo.

O frontend (`src/frontend/src/services/api/http.ts`) faz a renovação de forma automática: ao receber um 401, chama o refresh uma única vez, compartilhado entre requisições simultâneas, e repete a requisição. Se a renovação falhar, a sessão é encerrada e o usuário volta ao login.

As renovações recusadas são limitadas a 20 a cada 15 minutos por IP.

## Invalidação após alteração ou redefinição de senha

Quando a senha muda, o hash muda, e com ele a impressão digital `sh`. Todos os tokens emitidos antes da mudança, access e refresh, passam a ser recusados:

- **Troca da própria senha** (`PATCH /api/auth/senha`): as outras sessões caem. A sessão que fez a troca recebe tokens novos na resposta (200).
- **Redefinição pelo administrador** (`PATCH /api/usuarios/:id/senha`): todas as sessões do usuário caem.
- **Inativação do usuário**: os tokens passam a receber 403 na próxima requisição.

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

- **Sem revogação individual de sessões.** Os tokens não são guardados no servidor, então não há logout que invalide um token específico antes da expiração, nem detecção de reuso de refresh token. Para derrubar todas as sessões de um usuário, basta redefinir a senha ou inativá-lo. A revogação individual exigiria uma tabela de sessões, a ser alinhada com o responsável pelo banco.
- **Tokens no `localStorage`.** Os tokens ficam acessíveis a scripts da página. Uma vulnerabilidade de XSS permitiria roubá-los. A alternativa é um cookie `HttpOnly` com `SameSite`, que depende da configuração de domínio da hospedagem do frontend e do backend.
- **Troca do segredo.** Alterar `JWT_SECRET` invalida todas as sessões. Não há rotação com dois segredos simultâneos.
- **Limite por IP.** O controle de tentativas usa memória local, por instância, e o IP da requisição. Atrás de proxy ou com várias instâncias, ele depende da configuração de `trust proxy` e de um armazenamento compartilhado.
