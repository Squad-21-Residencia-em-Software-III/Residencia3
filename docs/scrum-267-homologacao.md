# Homologação local do acompanhamento SVO

O roteiro `src/frontend/scripts/homologar-acompanhamento-svo.mjs` serve o frontend compilado e encaminha `/api` à aplicação Express real. O navegador exerce a interface pública, enquanto os estados são produzidos pelas operações reais de cadastro, triagem, alocação, saída e encerramento. A conexão administrativa prepara somente fixtures sintéticas. `current_user` comprova a role restrita na conexão que atende as requisições.

## Reprodução

1. Use uma cópia de trabalho com o backend do #245 integrado à `develop`. Configure um PostgreSQL descartável em `127.0.0.1`, banco `frotas_teste`, credenciais sintéticas e role operacional distinta da role de migração. No backend, execute `npm run db:provisionar-app-user`, `npm run migrate:status`, `npm run migrate`, `npm run migrate:status`, `npm run db:provisionar-app-user` e `npm run build`.
2. Compile o frontend deste PR com `VITE_ACOMPANHAMENTO_EXTERNO_SVO_ATIVO=true` e `VITE_API_URL=/api`, usando `npm run build`.
3. Execute o roteiro com o mesmo ambiente do banco descartável, `NODE_ENV=test`, `DB_ROLE=app` e `SVO_BROWSER_DESCARTAVEL=1`. Aponte `PLAYWRIGHT_MODULE` para um módulo Playwright instalado e utilize Chrome compatível com `launchPersistentContext`.

```text
node src/frontend/scripts/homologar-acompanhamento-svo.mjs <pasta-backend> <pasta-dist-frontend> <pasta-evidencias>
```

## Matriz executada

| Critério | Evidência |
| --- | --- |
| Sete estados e transições | Status e mensagem do DTO conferidos na tela. A alocação sem saída permaneceu Confirmada. As operações reais produziram os estados terminais. |
| Privacidade e validade | Resposta uniforme para protocolo isolado ou inexistente e credencial incorreta, cruzada, revogada ou expirada. O relógio injetado no serviço real confirmou acesso 1 ms antes da expiração e negativa na fronteira. Verificações de URL, Web Storage, IndexedDB, CacheStorage, DTO e cabeçalhos sem persistência da credencial. |
| Erros e concorrência | Duplo envio deduplicado, troca de dados com consulta anterior pendente, timeout, retorno da conexão, `429` com `Retry-After` real e desativação da flag do backend. O atraso local controla o transporte e as respostas continuam vindo do Express. |
| Sessão | Visitante sem refresh. Login real, acesso direto à rota pública sem Authorization/cookie, restauração na rota protegida, redirecionamento ao perder o cookie, logout offline nas duas abas, reconciliação e troca de conta. |
| Acessibilidade | Rótulos, foco e descrição dos campos inválidos, carregamento, Tab/Enter, reflow em 320 CSS px e ampliação nativa de 200% selecionada nas configurações do Chrome. |

O roteiro grava JSON sem corpos de requisições e capturas com os campos de protocolo e segredo mascarados. A matriz física e assistiva depende de evidência própria. As preferências no layout público são homologadas junto com o #238 e a política institucional de perfis pertence à SCRUM-272.
