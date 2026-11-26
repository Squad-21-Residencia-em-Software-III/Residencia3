# SCRUM-223 · Aceite de PWA e notificações

Em 26/11/2026, a validação usou a develop `6cbe676`, o HEAD `2556778` do [#216](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/216) e a integração local `6d0e87e`. Essa evidência é histórica e não certifica o Worker atual. A SCRUM-240 já está disponível no [#199](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/199).

| Cenário | Ambiente e resultado | Evidência ou impedimento |
| --- | --- | --- |
| App Shell anterior → injectManifest | Passou em Edge desktop headless, com perfil limpo e servidor estático em loopback | A versão anterior controlou a página. A versão nova aguardou ativação, ativou após SKIP_WAITING e manteve /login ao terminar. |
| API fora do cache | Passou no mesmo Edge | App Shell precacheado. Dois GETs a /api/qa-probe chegaram ao servidor com respostas sequenciais 1 e 2. CacheStorage sem o recurso. |
| Sino, engrenagem e Sobre Nós | Passou em jsdom | A suíte direcionada do PR teve 21 testes. O teste de teclado abre o único sino, fecha com Escape e devolve foco ao botão sem abrir preferências. |
| Headers do SW e proxy /api | Passou no contrato automatizado | vercel.test.ts validou a configuração versionada. A verificação de cabeçalhos no ambiente publicado fica pendente. |
| Titularidade e autorização após clique | Falha histórica em `2556778`; correção aprovada no #216 (`ef292ea`) | Bridge e Toast revalidam vínculo, titularidade e acesso pela API. Consultar a evidência automatizada da integração abaixo. |
| Logout offline e isolamento entre contas/abas | Falha histórica em `2556778`; correção aprovada no #216 (`ef292ea`) | Barreira redundante IndexedDB/CacheStorage, invalidação por geração e mensagens de suspensão ao SW. Falha simultânea de todos os mecanismos não permite garantia absoluta. |
| Fallback, flags e App Badge elegível | Correções automatizadas aprovadas em #216 e #220; dispositivo real não executado | O badge usa o total elegível da API, não o total do sino. A8/S6/S7 são exclusivamente In-App conforme contrato. Polling de 60 s, backoff, coordenação entre abas e proteção de sessão estão na develop. |
| Push real em foreground/background/fechado, troca de conta e retomada autenticada | Não executado | Requer HTTPS, origem de homologação com Push e dispositivos. Android/Chrome, iOS Safari/PWA e desktop com Push do sistema permanecem pendentes. |
| Contraste, leitor de tela, viewport mobile e regressão de instalação pelo SO | Não executado | A evidência desktop é de execução de Service Worker em navegador, com aceite do protocolo de atualização pelo teste. |

Para repetir o cenário do Service Worker, compilar as duas versões, servi-las na mesma origem local em sequência e usar um perfil Edge limpo. Confirmar o controlador inicial, atualizar o registro, observar o Worker em espera e só então aceitar a atualização. Consultar um endpoint de teste que devolva contagens sucessivas e verificar a ausência do recurso no CacheStorage. Repetir com sessão ativa e em dispositivos instalados com a versão integrada do #216; o cenário histórico não substitui novo teste real.

Na revisão de segurança, validar o dispositivo desvinculado após logout manual, as preferências preservadas e as demais assinaturas intactas. Repetir offline, após expiração sem logout manual, com outra aba e após autenticação em outra conta. O destino e o toast dependem de titularidade e acesso revalidados. O [Jira SCRUM-223](https://squad21.atlassian.net/browse/SCRUM-223) mantém o aceite físico antes da ativação em produção.

## Integração atual

A develop `e144d4ed3c20bcc8669b14ccc57fb93feb862ea7` contém #216 (`ef292ea`) e #220 (`e6739f5`). Reutiliza-se a CI aprovada do #216 e a validação de upgrade SCRUM-239 já realizada; não se repete a validação de migration sem mudança no seu objeto. O relatório de execução desta branch, [evidências automatizadas](scrum-223-evidencias-integracao.md), registra a árvore testada, suites, resultados e ambiente. Resultados jsdom/Node não são homologação de Android, iOS, desktop com Push do sistema, responsividade visual ou instalação pelo SO. A atualização real do SW na versão integrada permanece Não executada enquanto não houver nova evidência.
