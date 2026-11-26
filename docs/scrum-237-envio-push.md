# SCRUM-237: envio dos alertas no aparelho (Web Push)

Liga a fila da SCRUM-229 ao envio de verdade e entrega as rotas do contrato da SCRUM-238 (`docs/scrum-238-contrato-push.md`). Usa as tabelas da SCRUM-236 (`push_subscriptions`, `preferencias_notificacao`) e da SCRUM-228 (`notificacao_outbox`). **Sem migration.** Dependência nova: `web-push` 3.6 (CommonJS, como o backend).

## Configuração (só no backend)

| Variável | Conteúdo |
|---|---|
| `VAPID_PUBLIC_KEY` | Chave pública, base64url (65 bytes). A única que o front recebe |
| `VAPID_PRIVATE_KEY` | Chave privada, base64url (32 bytes). **Segredo**: só no ambiente do backend |
| `VAPID_SUBJECT` | `mailto:contato@dominio` ou `https://` pública |
| `PUSH_HOSTS_PERMITIDOS` | Opcional. Hosts aceitos nos endpoints. Padrão: `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com` |

- Gerar o par: `npx web-push generate-vapid-keys`. Trocar o par invalida todas as assinaturas: os aparelhos precisam ligar os alertas de novo.
- **Nenhuma das três:** push desligado. A API sobe, a fila não envia, as rotas de chave e assinatura respondem `503` (`PUSH_DESLIGADO`), e os avisos continuam dentro do sistema. Preferências e cancelamento continuam funcionando.
- **Só uma ou duas, formato errado, par que não combina ou valor de exemplo:** a API não sobe. A mensagem diz qual variável está errada, sem mostrar o valor.
- Ao subir com as chaves, `server.ts` registra o enviador (`definirEnviadorPush`), e a fila retoma o que ficou pendente.

## Rotas (`/api/notificacoes`, todas com sessão)

O usuário é sempre o da sessão. Nenhuma rota aceita id de usuário, e um campo extra no corpo dá `400`. As respostas levam `Cache-Control: no-store`.

| Rota | Corpo | Respostas |
|---|---|---|
| `GET /vapid-public-key` | — | `200 { publicKey }` · `503` desligado |
| `POST /subscribe` | `{ endpoint, keys: { p256dh, auth } }` | `201` criada · `204` renovada · `400` · `409 PUSH_ENDPOINT_EM_USO` · `409 PUSH_LIMITE_DISPOSITIVOS` · `503` |
| `POST /subscribe/status` | `{ endpoint }` | `200 { ativa }` |
| `DELETE /unsubscribe` | `{ endpoint }` | `204`, também quando repetido |
| `GET /preferencias` | — | `200 { categorias: [{ codigo, titulo, descricao, push }] }` |
| `PATCH /preferencias/:codigo` | `{ push: boolean }` | `200` com a categoria · `404` fora do perfil |

- **`subscribe`:**
  - É idempotente: o mesmo usuário com o mesmo endpoint troca as chaves e reativa um aparelho expirado ou revogado, sem ocupar vaga nova.
  - Um endpoint de outra conta é recusado sem transferência, e a mensagem não diz de quem é.
  - O limite é de 5 aparelhos ativos, aplicado pelo gatilho da SCRUM-236 e seguro com requisições simultâneas. A mensagem que a tela mostra fica em `erro`.
- **Endpoint (SSRF):** a API faz requisições para o endpoint informado pelo cliente. Por isso só aceita `https` na porta 443, sem usuário e senha na URL e em um host da lista acima. O enviador confere de novo antes de cada envio e não segue redirecionamentos.
- **`unsubscribe`:** apaga a linha (as chaves não ficam guardadas sem uso) e só a do próprio usuário. Funciona também com o push desligado.
- **Limite por usuário:** 30 alterações por minuto em `subscribe`, `status`, `unsubscribe` e `PATCH preferencias`, além do limite geral por IP.

## Categorias por perfil (`constants/categoriasNotificacao.ts`)

| Código | Perfis |
|---|---|
| `SOLICITACOES` | Solicitante, Gestor de Frota, Administrador, Gestor SVO |
| `VIAGENS` | Solicitante, Gestor de Frota, Motorista da frota |
| `ODOMETRO` | Gestor de Frota, Motorista da frota, Administrador |
| `SVO` | Gestor SVO, Motorista SVO, Integrante SVO, Administrador |

- Sem escolha registrada, a categoria fica **desligada** (padrão da SCRUM-236).
- O perfil é conferido na escolha e **de novo na hora do envio** (`notificacaoOutboxModel.destino`). Quem muda de perfil deixa de receber as categorias do perfil anterior.
- Para criar uma categoria, basta incluí-la no catálogo, sem migration. O código é o mesmo de `publicarNotificacao({ push: { categoria } })`.

## Envio (`services/enviadorWebPush.ts`)

- O `web-push` (`generateRequestDetails`) cifra o conteúdo em `aes128gcm` e assina com VAPID (ES256). A requisição é feita com `fetch`, que respeita o cancelamento da fila após 10 s.
- Cabeçalhos: `TTL` de 24 h (igual à validade do item na fila) e `Urgency: normal`. `Topic` é a `tag`, quando ela cabe nas regras (base64url, até 32 caracteres): o serviço troca o alerta ainda não entregue pelo novo.
- O enviador responde o status HTTP e o `Retry-After` (em segundos ou como data, até 1 h). A fila (SCRUM-229) decide o que fazer:

| Resposta | Resultado |
|---|---|
| 2xx | Enviado |
| 404, 410 | Assinatura `EXPIRADA`, fora do limite de aparelhos; os outros aparelhos continuam |
| 408, 429, 5xx, rede, tempo esgotado | Nova tentativa com espera crescente, respeitando o `Retry-After`; 5 no total |
| Outros 4xx, redirecionamento, host fora da lista, chaves que não cifram | Falha definitiva naquele aparelho |

- **Só depois do commit:** `publicarNotificacao` grava o aviso e a pendência na transação da operação e acorda a fila depois do commit. Uma operação desfeita não envia nada.
- **Categoria desligada, sem assinatura ou usuário inativo:** o push não é enviado e o aviso continua dentro do sistema.

## LGPD e sigilo

- **Conteúdo do alerta:** só `{ notificacao_id, titulo, corpo, url, tag }`. Título com até 45 caracteres e corpo com até 110, contados por caractere e com `…` quando cortados. Os limites são aplicados de novo no envio. `url` só pode ser rota interna; caso contrário, vira `/`. Campos internos (`entregues`) e ids de usuário nunca vão no alerta.
- **O texto aparece na tela bloqueada** e pode chegar a um aparelho que trocou de conta (`docs/scrum-238-contrato-push.md`). Quem publica não põe dado pessoal nem sensível.
- **Chaves e endpoints:** nenhuma rota devolve `p256dh` ou `auth`, e nenhum log registra endpoint, chave, usuário ou texto do alerta (a fila registra só códigos e totais). A chave privada VAPID não sai da configuração nem do enviador.
- **Saída e troca de conta:** o logout não apaga preferências nem outros aparelhos. O front chama `unsubscribe` com o token da sessão que está terminando e consulta `subscribe/status` quando outra conta entra. A linha que ficar para trás é descartada no próximo envio (404/410).

## Testes

- `enviadorWebPush.test.ts`:
  - Cifra e VAPID reais, conferidos como um serviço de push faria: assinatura ES256 com a chave pública, decifragem com a chave do aparelho e outro aparelho sem conseguir ler.
  - Status, `Retry-After`, redirecionamento, host recusado e limites de texto.
  - Envio por HTTP real (`fetch` até um servidor local).
- `pushRoutes.test.ts`: o contrato das rotas, a validação, o SSRF, os erros `409` e `503`, as categorias por perfil e o log sem endpoint ou chaves.
- `env.test.ts`: configuração VAPID ausente, parcial, inválida, com par trocado e válida, sem expor valores.
- `matrizAcesso.test.ts`: as novas rotas para todos os perfis, com `401` sem sessão.
- `pushPostgres.test.ts`, de ponta a ponta no PostgreSQL. Roda no CI com `SCRUM237_POSTGRES_TESTS=1` e localmente em `127.0.0.1/frotas_teste` depois de `npm run migrate`. Cobre:
  - assinatura idempotente;
  - aparelho de outra conta;
  - limite de 5 e renovação no limite;
  - expirado fora do limite e religado;
  - situação e cancelamento só do dono;
  - logout que preserva preferências e outros aparelhos;
  - envio só após o commit (com rollback);
  - multi-aparelho com 410;
  - 404;
  - 429 com `Retry-After`;
  - 5xx até a falha definitiva;
  - categoria desligada e aviso In-App mantido;
  - sem assinatura;
  - mudança de perfil.

## Para ligar em produção

1. Gerar o par VAPID e definir `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` **só no ambiente do backend**.
2. SCRUM-239 publicada (service worker com `push` e `notificationclick`, lendo `titulo`, `corpo`, `url` e `tag`).
3. Gerar o front com `VITE_WEB_PUSH_ATIVO=true` e seguir o roteiro de testes em aparelhos da SCRUM-238.

O catálogo inclui `SOLICITACOES` para autores Gestor SVO (A2–A4), `ODOMETRO` para administradores (A9), e `SVO` para administradores (S1). A fila exige a categoria permitida e o acesso atual ao registro. A publicação e a partida da fila dependem de `NOTIFICACOES_ATIVAS`.
