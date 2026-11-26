# Evidencias automatizadas da integracao #221

Data: 2026-11-26T17:26:23.6176724-03:00
Ambiente: Windows PowerShell, Node v24.22.1.

- HEAD anterior do PR: fc4290b82f78007e91b338d9aa118d1e8f265530
- Develop integrada: e144d4ed3c20bcc8669b14ccc57fb93feb862ea7
- Arvore Git efetivamente testada (antes deste documento): 1101573e931d60906590442014e110a907811074
- O commit de entrega inclui esta mesma arvore de codigo/testes, acrescida apenas deste relatorio.
- Nenhum merge de PR ou ativacao de producao foi realizado.

## Testes automatizados (Node/jsdom; nao equivalem a navegador/SO real)

| Suite | Passou | Falhou | Nao executado |
| --- | ---: | ---: | ---: |
| src/sw/barreiraPush.test.ts | 7 | 0 | 0 |
| src/sw/estadoPush.test.ts | 6 | 0 | 0 |
| src/contexts/AuthContext.test.tsx | 6 | 0 | 0 |
| src/contexts/SessaoPush.test.tsx | 26 | 0 | 0 |
| src/hooks/useVinculoPush.test.tsx | 19 | 0 | 0 |
| src/components/pwa/AlertasPush.test.tsx | 45 | 0 | 0 |
| src/sw/logicaPushSw.test.ts | 28 | 0 | 0 |
| src/contexts/NotificacoesContext.test.tsx | 19 | 0 | 0 |
| src/components/notificacoes/BridgeNotificacoesSw.test.tsx | 5 | 0 | 0 |
| src/components/layout/SinoNotificacoes.test.tsx | 12 | 0 | 0 |
| src/components/notificacoes/ToastNotificacao.test.tsx | 2 | 0 | 0 |
| src/utils/operacoesPush.test.ts | 4 | 0 | 0 |
| src/components/layout/AppLayout.test.tsx | 5 | 0 | 0 |
| src/components/pwa/PwaComponents.test.tsx | 2 | 0 | 0 |
| src/config/vercel.test.ts | 4 | 0 | 0 |
| src/utils/appBadging.test.tsx | 2 | 0 | 0 |
| src/utils/destinoNotificacao.test.ts | 7 | 0 | 0 |

Total distinto: 199. Build frontend e TypeScript: Passou.

Android/Chrome, iOS Safari/PWA, Push desktop do SO, viewport mobile real, leitor de tela e atualizacao real do SW integrado: Nao executado. A evidencia historica Edge nao e uma nova homologacao. A migration SCRUM-239 nao foi revalidada nesta rodada.
CI deste novo commit: consultar o PR; nao declarada antecipadamente.
