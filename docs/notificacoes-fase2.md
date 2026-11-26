# Notificações da Fase 2

Revisão de 26/11/2026 sobre develop `9ba559e` e a homologação integrada `91e4f66` do #223. Os eventos SVO e o Service Worker já integram develop. A5–A8 administrativos compõem a integração dos PRs #218 e #219. A disponibilidade depende da etapa de implantação, das flags e das permissões da conta.

## Manual de uso

1. Abra o **sino de notificações**. O contador mostra avisos não lidos e exibe **99+** acima de 99. Abra a central para ver o histórico, filtre os não lidos e avance em **Carregar mais**, quando disponível.
2. Use a ação de leitura no aviso ou **Marcar avisos exibidos como lidos** para agir sobre os itens não lidos da lista carregada. Avisos ainda fora da lista continuam no contador. Selecionar um aviso com destino leva à listagem autorizada. Se o vínculo foi removido, a central mostra o aviso sem os detalhes protegidos.
3. Abra a **engrenagem** para acessar preferências. Onde habilitado, selecione **Ligar alertas** para solicitar permissão ao navegador, ou recuse e continue usando a central. As categorias configuram Push e são preservadas na conta. Para mudar uma permissão negada, ajuste as permissões do site no navegador ou no sistema operacional.
4. Para instalar, use o comando de instalação do navegador no Android ou desktop, quando oferecido. No iPhone/iPad, abra no Safari e escolha **Adicionar à Tela de Início** pelo menu Compartilhar. O Push em iOS depende de instalação, versão compatível e permissão. O App Badge depende de suporte da plataforma. Sem Push, os avisos continuam na central.
5. Use **Sair** em dispositivo compartilhado. O aplicativo suspende a apresentação de avisos desta conta e tenta encerrar a assinatura deste aparelho. Preferências e outros dispositivos permanecem vinculados à conta. Fechar o aplicativo ou deixar a sessão expirar mantém o fluxo de aviso neutro. Após trocar de conta, a apresentação exige a confirmação do vínculo da sessão atual.

Consulte os fluxos de [viagens e coletas](manual-fluxos-operacionais.md) e os [cenários de permissões](scrum-238-contrato-push.md).

## Guia técnico

| Área | Contrato e implementação |
| --- | --- |
| Avisos e leitura | `notificacoes` guarda destinatário, operação, referência, ocorrência, leitura e data. A lista usa cursor opaco `(criado_em,id)`, 20 por padrão e máximo 50. As respostas da [API In-App](scrum-226-api-notificacoes.md) têm `Cache-Control: no-store`. O contador interno retorna `nao_lidas` e `versao`. O App Badge consulta `elegiveis` separadamente. |
| Domínio e fila | [Publicação](scrum-229-publicacao-e-fila.md) grava In-App e, para canais elegíveis, `notificacao_outbox` na transação de negócio. A identidade por ocorrência e destinatário protege retries. O envio acontece após commit. A tag só agrupa alertas exibidos no aparelho. |
| Dispositivos e categorias | [Assinaturas e preferências](scrum-237-envio-push.md) usam `push_subscriptions` e `preferencias_notificacao`. O envio revalida conta, categoria, assinatura e acesso ao registro. Repetir a assinatura ativa com as mesmas chaves preserva a geração. Reativação, troca de chaves e recriação geram novo vínculo. |
| Privacidade | Exclusão do autor, escopo por operação/unidade, acesso por referência e sessão própria. Push usa conteúdo neutro e caminhos internos. Motivos e justificativas ficam na central autenticada quando autorizados. Proteger endpoints e material criptográfico e registrar apenas totais e códigos sanitizados. |
| PWA e App Badge | O Service Worker usa `injectManifest`, precache da aplicação, API `NetworkOnly` e atualização após aceite. A ponte do cliente revalida titularidade e acesso antes de exibir toast ou encaminhar clique e deduplica a ocorrência. A8, S6 e S7 contam no sino, sem Web Push ou incremento próprio do App Badge. |
| Polling | Contador e lista aberta revalidam em janelas periódicas de 60 s. Abas visíveis da mesma conta compartilham o resultado do contador via BroadcastChannel e Web Locks quando disponíveis. A lista aberta revalida mesmo com o total igual. Retorno de foco tem debounce de cinco segundos e falhas usam backoff independente de 5 a 60 s, com variação de até um segundo. |
| Retenção e fila | [Retenção In-App](scrum-242-retencao-notificacoes.md) aplica cortes estritos de mais de 30 dias após a leitura e mais de 90 dias desde a criação para não lidas. Registros nos limites são preservados. Evidências fotográficas têm guarda de 12 meses. Respostas 404/410 tornam a assinatura inelegível para envio. Prazos de expurgo físico de assinaturas inválidas e da outbox terminal aguardam aprovação. Preservar assinaturas ativas, estados pendentes/em processamento, auditoria e deduplicação. |

Os sete perfis são Administrador, Solicitante, Gestor de Frota, Gestor SVO, Motorista da Frota, Motorista SVO e Integrante SVO. Administrador pode operar em ambos os fluxos conforme a referência. Gestor SVO requer vínculo de unidade para SVO e acessa solicitações administrativas próprias. Solicitante consulta as próprias solicitações. O motorista precisa ser o condutor designado e o integrante precisa de vínculo individual válido ou histórico autorizado. Consulte a [matriz de acesso](matriz-de-acesso.md).

### Contratos REST e vínculo Push

As rotas a seguir usam o prefixo `/api/notificacoes` e a identidade da sessão. `GET /push-disponivel` é público e retorna somente `{ ativo }`. `GET /metricas` é reservado ao Administrador.

| Área | Rotas |
| --- | --- |
| Consulta | `GET /`, `GET /:id` (revalida acesso atual), `GET /contador` e `GET /badge`. |
| Leitura idempotente | `PATCH /:id/lida`, `PATCH /ler-todas` e `PATCH /referencia/lida`. A interface envia os IDs exibidos, em lotes de até 1.000. |
| Assinatura | `GET /vapid-public-key`, `POST /subscribe`, `POST /subscribe/status` e `DELETE /unsubscribe`. A consulta de status envia o endpoint no corpo e retorna vínculo somente para uma assinatura ativa da própria conta. |
| Preferências | `GET /preferencias` e `PATCH /preferencias/:codigo`. |

O vínculo opaco acompanha o Push enviado e precisa coincidir com a assinatura confirmada pela sessão. A proteção usa geração e marcador de encerramento redundantes no IndexedDB e CacheStorage. O marcador do CacheStorage guarda somente estado sintético. Logout manual dispara invalidações independentes e uma mensagem de suspensão ao Service Worker. Resposta atrasada de geração anterior é rejeitada. Uma troca de conta precisa confirmar o vínculo da sessão nova antes de liberar apresentação. Veja o [contrato de Push](scrum-238-contrato-push.md) e a [barreira redundante](scrum-239-barreira-push.md).

### Reprogramação administrativa A6

`PATCH /api/viagens/administrativas/:id/reprogramar` recebe `tipo_operacao: "ADMINISTRATIVA"`, `inicio_previsto` e `fim_previsto` ISO 8601 com fuso, `versao_programacao` e `chave_idempotencia` UUID. Administrador e Gestor de Frota autorizado na unidade podem reprogramar uma viagem agendada e ainda sem horários efetivos. O retorno contém a viagem atualizada.

As datas solicitadas continuam na solicitação aprovada. As planejadas representam a reserva vigente, com fallback para as solicitadas no legado. Uma chegada solicitada ausente usa a próxima meia-noite em Brasília. Os horários reais registram a execução física. Uma mudança que preserva o período mantém a versão, e retry com a mesma chave e corpo devolve a viagem atual sem republicar. Versão obsoleta, conflito de agenda ou chave reutilizada com dados divergentes retornam 409. A operação preserva aprovação e recursos designados. Auditoria e notificação acompanham a transação. Consulte a [evidência da SCRUM-231](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/blob/f1804f4c7072c8498000cdd8a0d9205d3c92491d/docs/scrum-231-reprogramacao.md).

### Eventos e rotas

Os 17 tipos são **A1–A10, S1 e S3–S8**. A liderança excluiu S2 em 26/11/2026 e os identificadores foram preservados. A flag de material sensível pertence à operação administrativa. Toda coleta SVO já é sensível por envolver um cadáver e mantém as proteções de LGPD.

**P** significa Push elegível ao App Badge onde suportado. **I** significa In-App com sino interno. O autor da ação é excluído.

| Evento | Destinatário | Canais e destino | Disponibilidade no SHA de referência |
| --- | --- | --- | --- |
| A1 Criação | Gestor Frota e Administrador | I, /solicitacoes | Integrado no #209. |
| A2 Aprovação | Autor autorizado | I + P, /solicitacoes | Integrado no #209. |
| A3 Recusa | Autor autorizado | I + P neutro, /solicitacoes | Integrado no #209. Motivo na central. |
| A4 Expiração | Autor e Gestor Frota | I para ambos, P para autor, /solicitacoes | Integrado no #209. A rotina publica após transição real para EXPIRADA conforme configuração. |
| A5 Agendamento | Motorista Frota designado | I + P, /viagens | Validado em HTTP/PostgreSQL no #219, incluindo rollback. |
| A6 Reprogramação | Motorista Frota e solicitante autorizados | I + P, /viagens ou /solicitacoes, viagem-{id} | Oito cenários HTTP/PostgreSQL no #218. |
| A7 Cancelamento | Motorista Frota e autor autorizado | I + P, /viagens ou /solicitacoes, viagem-{id} | Validado em HTTP/PostgreSQL no #219. |
| A8 Início e fim | Gestor Frota e solicitante autorizado | I, /viagens ou /solicitacoes | Ocorrências distintas, sem incremento independente do App Badge. |
| A9 Pedido de exceção | Gestor Frota e Administrador autorizados | I + P, /viagens | Integrado no #210. |
| A10 Decisão da exceção | Motorista Frota autorizado | I + P neutro, /viagens | Integrado no #210. |
| S1 Em triagem | Gestor SVO associado e Administrador | I + P, /solicitacoes?aba=svo | Integrado no #208. |
| S3 Designação | Motorista SVO e integrante individual | I + P, /viagens ou /minhas-coletas | Integrado no #214. |
| S4 Mudança efetiva | Designados autorizados que permanecem | I + P, /viagens ou /minhas-coletas, ordem-svo-{id} | Integrado no #214, com identidade por ocorrência. |
| S5 Cancelamento | Designados com histórico autorizado | I + P, /viagens ou /minhas-coletas, ordem-svo-{id} | Integrado no #214. |
| S6 Chegada | Gestor SVO associado e Administrador | I sem App Badge independente, /viagens | Integrado no #212. |
| S7 Fim do deslocamento | Gestor SVO associado e Administrador | I sem App Badge independente, /viagens | Integrado no #212. |
| S8 Exceção | Gestor SVO no pedido e motorista SVO na decisão | I + P neutro, /viagens | Integrado no #212, com teste de segregação A9/S8 no #222. |

## Implantação gradual

| Etapa | Pré-condições e verificação | Reversão |
| --- | --- | --- |
| 1. In-App, eventos e RBAC | Gabriel Arruda valida backup, migrations e roles em homologação. Ativar `NOTIFICACOES_ATIVAS` no backend e `VITE_NOTIFICACOES_IN_APP_ATIVAS` no build autorizado. Testar os sete perfis, o contador, lista, leitura, fluxo transacional e isolamento. | Desativar flag do frontend e recompilar. Se necessário, parar novas publicações com a flag do backend. Os avisos persistidos seguem guardados. |
| 2. Push, SW e assinaturas | DevOps confere HTTPS, `PROXY_SECRET`, proxy /api e headers do SW. Configurar o trio VAPID no Render, publicar a chave pública por API e ativar `VITE_WEB_PUSH_ATIVO` no frontend autorizado. Homologar opt-in, clique, revogação, logout e App Badge em dispositivos. | Desativar oferta no build. Para suspender o envio, retirar o trio VAPID do backend com o par original guardado no cofre. Retomar com o mesmo par. A central continua disponível. |
| 3. Preferências, retenção e observabilidade | Validar categorias, métricas agregadas e roles. Começar com `FSPH_RETENCAO_NOTIFICACOES_MODO=simular`. Revisar totais, testar restauração e obter aprovação antes de aplicar. O A4 usa `FSPH_EXPIRACAO_AVISOS_ATIVOS` e `FSPH_API_URL` conforme o guia operacional. | Suspender o job retirando o modo de retenção. Restauro pelo responsável do banco a partir de backup validado, conforme o incidente. |

Referências operacionais para [backup e restauração](politica-backup-e-recuperacao-db.md), [configuração e diagnóstico](scrum-241-implantacao-push.md) e [API e VAPID](scrum-237-envio-push.md). A chave VAPID privada permanece no backend. As flags de amostra seguem desativadas e as variáveis de segredos sem valores reais.

Aplicar as migrations versionadas antes do backend correspondente: `20261124193000` (In-App), `20261124200000` (outbox), `20261124203000` (assinaturas e preferências), `20261126143000` (geração do vínculo) e `20261126180000` (programação A6). O histórico de A6 concede à aplicação leitura e inserção. Concluir a substituição das instâncias antigas antes de liberar reprogramação. Depois de usar a geração Push ou a programação A6, preservar colunas e históricos em reversões da aplicação. Para A6, o rollback destrutivo é recusado após uso e a recuperação de schema exige roll-forward.

O rollout usa Render, Vercel, Neon e GitHub Actions. No Render gratuito, suspensão adia a entrega e a fila retoma quando a API volta. Usar métricas agregadas das últimas 24 horas, idade do pendente mais antigo, falhas de envio e 429/503 para decidir entre continuar ou reverter. As medições em [#220](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/220) são locais. Cotas e latência reais requerem verificação em homologação. A retenção In-App usa 30 dias da leitura ou 90 da criação, com corte estrito. Assinaturas encerradas e outbox terminal dependem de prazos aprovados, preservação da deduplicação e análise de auditoria. [Política de retenção](scrum-242-retencao-notificacoes.md)

## Evidências e pendências

A regressão integrada do #223 passou 269 casos de backend em PostgreSQL 17 descartável e 49 de frontend em jsdom, além de build e typecheck. A rodada final de odômetro passou 13 casos, com a rotina exclusiva de GitHub Actions omitida localmente. O Edge em loopback aplicou uma atualização real do Service Worker em sessão anônima. A rodada de 26/11/2026 complementou o aceite com atualização do Service Worker em /solicitacoes autenticada, viewports de desktop e mobile no Edge e paginação com 21, 40 e 101 avisos. A homologação completa em HTTPS ainda requer Push real em desktop, Android Chrome e iOS Safari/PWA instalado, instalação pelo SO, leitor de tela, carga de abas na escala-alvo e retomada após suspensão em ambiente isolado.

O registro de requisitos, resultados e SHAs está na [matriz NF-01 a NF-28](scrum-243-homologacao-fase2.md). Consulte também o [aceite administrativo](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/219), o [aceite SVO](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/222) e a [integração do PWA](scrum-223-evidencias-integracao.md).
