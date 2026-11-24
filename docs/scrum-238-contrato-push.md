# SCRUM-238: contrato dos alertas no aparelho (front → back, banco e service worker)

O front está pronto atrás de `VITE_WEB_PUSH_ATIVO` (`webPush` em `recursosBackend.ts`), desligado por padrão. Desligado, nenhuma rota abaixo é chamada e as preferências do aplicativo ficam como antes.

As rotas `vapid-public-key`, `subscribe` e `unsubscribe` vêm da SCRUM-222. **O restante é proposta do front**, a confirmar com quem assumir a SCRUM-236 e a SCRUM-237: formato dos corpos, rota de situação e rotas de preferências.

Todas as rotas ficam em `/api/notificacoes`, exigem sessão e usam o usuário **da sessão**, nunca um id enviado pelo cliente.

## Rotas

| Método e rota | Corpo | Resposta esperada |
|---|---|---|
| `GET /vapid-public-key` | — | `200 { "chave_publica": "BEl6…" }` (base64url) |
| `POST /subscribe` | `{ "endpoint": "https://…", "keys": { "p256dh": "…", "auth": "…" } }` | `201` ou `204` |
| `POST /subscribe/status` | `{ "endpoint": "https://…" }` | `200 { "ativa": true }` |
| `DELETE /unsubscribe` | `{ "endpoint": "https://…" }` | `204` |
| `GET /preferencias` | — | `200 { "categorias": [ … ] }` |
| `PATCH /preferencias/:codigo` | `{ "push": true }` | `200` com a categoria salva |

Categoria:

```json
{ "codigo": "VIAGENS", "titulo": "Viagens", "descricao": "Agendamento, mudança e cancelamento.", "push": true }
```

O código e os textos acima são **só exemplo**. O front não tem lista fixa: mostra as categorias, na ordem e com os textos que a API devolver. `descricao` é opcional.

### Regras que o front espera

- **`subscribe`:** idempotente para o mesmo usuário e `endpoint`. Se o `endpoint` já for de outra pessoa, recusar (`409`), sem transferir. No limite de aparelhos, `409` com o motivo em `erro`, que é mostrado na tela.
- **`subscribe/status`:** `ativa: true` só se a assinatura existir e for do usuário da sessão. Nos demais casos, `ativa: false`, sem dizer de quem é. É `POST` para o `endpoint` não aparecer em URL nem em log.
- **`unsubscribe`:** só a assinatura do próprio usuário. Repetir a chamada também responde `204`.
- **`preferencias`:** só as categorias que o perfil pode receber. Categoria fora do perfil responde `403` ou `404`.
- **Independência:** preferência desligada ou push recusado não afeta os avisos dentro do sistema.

Nos erros, o front mostra o `erro` da resposta, no formato que a API já usa.

## O que o front faz

| Situação | Comportamento |
|---|---|
| Permissão ainda não pedida | Só pede quando a pessoa toca em **Ligar alertas** |
| Permissão negada | Explica como liberar e não pede de novo |
| Pedido fechado sem resposta | Avisa e permite tentar outra vez |
| iPhone/iPad fora do aplicativo instalado | Orienta a instalar |
| Navegador sem suporte | Explica; as categorias continuam disponíveis |
| Sem conexão | Bloqueia as mudanças e confere sozinho quando a conexão voltar |
| `subscribe` falhou | Desfaz a assinatura no navegador e mostra o motivo |
| Já existe assinatura no navegador ao ligar | Encerra a antiga e cria outra, sem reaproveitar o `endpoint` |
| Desligar | Chama `unsubscribe` e encerra no navegador; basta um dos dois funcionar |
| **Sair da conta** | Encerra a assinatura **no navegador**, sem chamar `unsubscribe` |
| Sessão expirada | Mantém a assinatura |
| Outra conta entra no mesmo aparelho | Consulta `subscribe/status` e, se não for dela, encerra a assinatura no navegador |

Ao sair da conta, ou quando o `unsubscribe` falha, a linha fica no banco até o próximo envio, que responde `404` ou `410`. **O back precisa descartar a assinatura nesses casos** (já previsto na SCRUM-237) e não contar as descartadas no limite de aparelhos.

Entre a sessão expirar e outra pessoa entrar, o aparelho ainda recebe os alertas da conta anterior. Por isso o texto do push não pode ter dado pessoal, como já pede a SCRUM-222.

## Para ligar o interruptor

1. SCRUM-236 (banco) e SCRUM-237 (back) entregues e conferidas com este contrato.
2. SCRUM-239 (service worker com `push` e `notificationclick`) publicada. Sem ela, a assinatura funciona, mas o alerta não aparece corretamente.
3. Chaves VAPID configuradas **só no back**; o front recebe apenas a pública.
4. Gerar o front com `VITE_WEB_PUSH_ATIVO=true`.
5. Testar em HTTPS: Android/Chrome, computador (Chrome e Edge) e iPhone com o aplicativo instalado; ligar, desligar, negar, sair da conta e trocar de conta.
