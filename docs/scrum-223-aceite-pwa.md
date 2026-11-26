# SCRUM-223 · Aceite de PWA e notificações

Em 26/11/2026, a validação usou a develop `6cbe676`, o HEAD `2556778` do [#216](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/216) e a integração local `6d0e87e`. A SCRUM-240 já está disponível no [#199](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/199).

| Cenário | Ambiente e resultado | Evidência ou impedimento |
| --- | --- | --- |
| App Shell anterior → injectManifest | Passou em Edge desktop headless, com perfil limpo e servidor estático em loopback | A versão anterior controlou a página. A versão nova aguardou ativação, ativou após SKIP_WAITING e manteve /login ao terminar. |
| API fora do cache | Passou no mesmo Edge | App Shell precacheado. Dois GETs a /api/qa-probe chegaram ao servidor com respostas sequenciais 1 e 2. CacheStorage sem o recurso. |
| Sino, engrenagem e Sobre Nós | Passou em jsdom | A suíte direcionada do PR teve 21 testes. O teste de teclado abre o único sino, fecha com Escape e devolve foco ao botão sem abrir preferências. |
| Headers do SW e proxy /api | Passou no contrato automatizado | vercel.test.ts validou a configuração versionada. A verificação de cabeçalhos no ambiente publicado fica pendente. |
| Titularidade e autorização após clique | Falhou na revisão do HEAD 2556778 | BridgeNotificacoesSw deriva o destino do payload e navega antes da confirmação do acesso atual. A marcação de leitura é assíncrona e não supre essa confirmação. |
| Logout offline e isolamento entre contas/abas | Falhou na revisão do HEAD 2556778 | A pendência de logout está no armazenamento da página. O SW não consulta um estado compartilhado e durável antes de tratar o Push. |
| Fallback, flags e App Badge elegível | Pendente de correções e aceite em dispositivo | O teste unitário atual cobre lógica básica. O contador do sino também inclui eventos In-App. A atualização independente do ícone para A8/S6/S7 precisa ser excluída. |
| Push real em foreground/background/fechado, troca de conta e retomada autenticada | Não executado | Requer HTTPS, origem de homologação com Push e dispositivos. Android/Chrome, iOS Safari/PWA e desktop com Push do sistema permanecem pendentes. |
| Contraste, leitor de tela, viewport mobile e regressão de instalação pelo SO | Não executado | A evidência desktop é de execução de Service Worker em navegador, com aceite do protocolo de atualização pelo teste. |

Para repetir o cenário do Service Worker, compilar as duas versões, servi-las na mesma origem local em sequência e usar um perfil Edge limpo. Confirmar o controlador inicial, atualizar o registro, observar o Worker em espera e só então aceitar a atualização. Consultar um endpoint de teste que devolva contagens sucessivas e verificar a ausência do recurso no CacheStorage. Repetir com sessão ativa e em dispositivos instalados quando o #216 estiver pronto.

Na revisão de segurança, validar o dispositivo desvinculado após logout manual, as preferências preservadas e as demais assinaturas intactas. Repetir offline, após expiração sem logout manual, com outra aba e após autenticação em outra conta. O destino e o toast dependem de titularidade e acesso revalidados. O [Jira SCRUM-223](https://squad21.atlassian.net/browse/SCRUM-223) depende da correção e da revisão independente do #216.
