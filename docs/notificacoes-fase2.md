# Notificações da Fase 2

Revisão de 26/11/2026 sobre a develop `6cbe676` e a integração local `6d0e87e`. A central e as rotinas de backend já têm entregas integradas. A expansão de eventos de viagem e o novo Service Worker seguem em revisão. A disponibilidade no ambiente depende da etapa de implantação e das permissões da conta.

## Manual de uso

1. Abra o **sino de notificações**. O contador mostra avisos não lidos e exibe **99+** acima de 99. Abra a central para ver o histórico, filtre os não lidos e avance em **Carregar mais**, quando disponível.
2. Use a ação de leitura no aviso ou **Marcar avisos exibidos como lidos** para agir sobre os itens não lidos da lista carregada. Avisos ainda fora da lista continuam no contador. Selecionar um aviso com destino leva à listagem autorizada. Se o vínculo foi removido, a central mostra o aviso sem os detalhes protegidos.
3. Abra a **engrenagem** para acessar preferências. Onde habilitado, selecione **Ligar alertas** para solicitar permissão ao navegador, ou recuse e continue usando a central. As categorias configuram Push e são preservadas na conta. Para mudar uma permissão negada, ajuste as permissões do site no navegador ou no sistema operacional.
4. Para instalar, use o comando de instalação do navegador no Android ou desktop, quando oferecido. No iPhone/iPad, abra no Safari e escolha **Adicionar à Tela de Início** pelo menu Compartilhar. O Push em iOS depende de instalação, versão compatível e permissão. O App Badge depende de suporte da plataforma. Sem Push, os avisos continuam na central.
5. Use **Sair** em dispositivo compartilhado. O aplicativo tenta encerrar a assinatura do aparelho, mantendo preferências e as assinaturas de outros dispositivos. Fechar o aplicativo ou a sessão expirar mantém o vínculo. O tratamento integrado de logout offline pelo Service Worker depende da revisão do #216.

Consulte os fluxos de [viagens e coletas](manual-fluxos-operacionais.md) e os [cenários de permissões](scrum-238-contrato-push.md).

## Guia técnico

| Área | Contrato e implementação |
| --- | --- |
| Avisos e leitura | `notificacoes` guarda destinatário, operação, referência, ocorrência, leitura e data. A [API In-App](scrum-226-api-notificacoes.md) oferece lista, contador, leitura individual, pelos IDs exibidos e por referência. Cursor opaco `(criado_em,id)`, 20 por padrão e máximo 50. O backend retorna `nao_lidas` e `versao` com `Cache-Control: no-store`. |
| Domínio e fila | [Publicação](scrum-229-publicacao-e-fila.md) grava In-App e, para canais elegíveis, `notificacao_outbox` na transação de negócio. A identidade por ocorrência e destinatário protege retries. O envio acontece após commit. A tag só agrupa alertas exibidos no aparelho. |
| Dispositivos e categorias | [Assinaturas e preferências](scrum-237-envio-push.md) usam `push_subscriptions` e `preferencias_notificacao`. As rotas são autenticadas e verificam titularidade. O envio revalida conta, categoria, assinatura e acesso ao registro. |
| Privacidade | Exclusão do autor da ação, escopo por operação/unidade, acesso por referência e sessão própria. Push usa conteúdo neutro e caminhos internos. Justificativa ou motivo de S8 só na central autenticada autorizada, na entrega em revisão. Proteger endpoints e material criptográfico e registrar apenas totais e códigos sanitizados. |
| PWA | A develop mantém o PWA da Fase 1. O [#216](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/216) propõe `injectManifest`, App Shell/precache, API `NetworkOnly`, atualização controlada e Badging opcional. Navegação após clique, autorização, logout offline e sincronização entre abas ainda exigem correção e aceite. |
| Rotinas e recuperação | [Retenção In-App](scrum-242-retencao-notificacoes.md) usa mais de 30 dias desde a leitura ou mais de 90 desde a criação, em lotes com revalidação. [Métricas, rollout e logs](scrum-241-implantacao-push.md) descrevem retry limitado, parciais, retomada da fila e códigos sanitizados. 404/410 expiram a assinatura para uso. Os prazos de expurgo físico de assinaturas e da outbox dependem de política. |

Os sete perfis são Administrador, Solicitante, Gestor de Frota, Gestor SVO, Motorista da Frota, Motorista SVO e Integrante SVO. Administrador pode operar em ambos os fluxos conforme a referência. Gestor SVO requer vínculo de unidade para SVO e acessa solicitações administrativas próprias. Solicitante consulta as próprias solicitações. O motorista precisa ser o condutor designado e o integrante precisa de vínculo individual válido ou histórico autorizado. Consulte a [matriz de acesso](matriz-de-acesso.md).

### Eventos e rotas

**P** significa Push elegível ao App Badge onde suportado. **I** significa In-App com sino interno. A elegibilidade do ícone depende do comportamento homologado do Service Worker. Sempre se exclui o autor da ação.

| Evento | Destinatário | Canais e destino | Disponibilidade no SHA de referência |
| --- | --- | --- | --- |
| A1 Criação | Gestor Frota e Administrador | I, /solicitacoes | Integrado no #209. |
| A2 Aprovação | Autor autorizado | I + P, /solicitacoes | Integrado no #209. |
| A3 Recusa | Autor autorizado | I + P neutro, /solicitacoes | Integrado no #209. Motivo na central. |
| A4 Expiração | Autor e Gestor Frota | I para ambos, P para autor, /solicitacoes | Integrado no #209. A rotina publica após transição real para EXPIRADA conforme configuração. |
| A5 Agendamento | Motorista Frota designado | I + P, /viagens | SCRUM-231 em desenvolvimento. |
| A6 Reprogramação | Motorista Frota e autor autorizado | I + P, /viagens ou /solicitacoes, viagem-{id} | SCRUM-231 em desenvolvimento. |
| A7 Cancelamento | Motorista Frota e autor autorizado | I + P, /viagens ou /solicitacoes, viagem-{id} | SCRUM-231 em desenvolvimento. |
| A8 Início e fim | Gestor Frota e autor autorizado | I, /viagens ou /solicitacoes | SCRUM-231 em desenvolvimento. Ocorrências distintas. |
| A9 Pedido de exceção | Gestor Frota e Administrador autorizados | I + P, /viagens | Integrado no #210. |
| A10 Decisão da exceção | Motorista Frota autorizado | I + P neutro, /viagens | Integrado no #210. |
| S1 Em triagem | Gestor SVO associado e Administrador | I + P, /solicitacoes?aba=svo | Integrado no #208. |
| S2 Material sensível | Gestor SVO associado e Administrador | I + P, /solicitacoes?aba=svo | Planejado. Origem de domínio pendente. |
| S3 Designação | Motorista SVO e integrante individual | I + P, /viagens ou /minhas-coletas | #214 em revisão. |
| S4 Mudança efetiva | Designados autorizados que permanecem | I + P, /viagens ou /minhas-coletas, ordem-svo-{id} | #214 em revisão. Identidade e composição pendentes. |
| S5 Cancelamento | Designados com histórico autorizado | I + P, /viagens ou /minhas-coletas, ordem-svo-{id} | #214 em revisão. |
| S6 Chegada | Gestor SVO associado e Administrador | I sem App Badge independente, /viagens | #212 em revisão. |
| S7 Fim do deslocamento | Gestor SVO associado e Administrador | I sem App Badge independente, /viagens | #212 em revisão. |
| S8 Exceção | Gestor SVO no pedido e motorista SVO na decisão | I + P neutro, /viagens | #212 em revisão. |

## Implantação gradual

| Etapa | Pré-condições e verificação | Reversão |
| --- | --- | --- |
| 1. In-App, eventos e RBAC | Gabriel Arruda valida backup, migrations e roles em homologação. Ativar `NOTIFICACOES_ATIVAS` no backend e `VITE_NOTIFICACOES_IN_APP_ATIVAS` no build autorizado. Testar os sete perfis, o contador, lista, leitura, fluxo transacional e isolamento. | Desativar flag do frontend e recompilar. Se necessário, parar novas publicações com a flag do backend. Os avisos persistidos seguem guardados. |
| 2. Push, SW e assinaturas | QA valida #216 e os dispositivos. DevOps confere HTTPS, `PROXY_SECRET`, proxy /api e headers do SW. Configurar o trio VAPID no Render, publicar a chave pública por API e ativar `VITE_WEB_PUSH_ATIVO` no frontend autorizado. Testar opt-in, clique, revogação, logout e App Badge. | Desativar oferta no build. Para suspender o envio, retirar o trio VAPID do backend com o par original guardado no cofre. Retomar com o mesmo par. A central continua disponível. |
| 3. Preferências, retenção e observabilidade | Validar categorias, métricas agregadas e roles. Começar com `FSPH_RETENCAO_NOTIFICACOES_MODO=simular`. Revisar totais, testar restauração e obter aprovação antes de aplicar. O A4 usa `FSPH_EXPIRACAO_AVISOS_ATIVOS` e `FSPH_API_URL` conforme o guia operacional. | Suspender o job retirando o modo de retenção. Restauro pelo responsável do banco a partir de backup validado, conforme o incidente. |

Referências operacionais para [backup e restauração](politica-backup-e-recuperacao-db.md), [configuração e diagnóstico](scrum-241-implantacao-push.md) e [API e VAPID](scrum-237-envio-push.md). A chave VAPID privada permanece no backend. As flags de amostra seguem desativadas e as variáveis de segredos sem valores reais.

O rollout usa Render, Vercel, Neon e GitHub Actions. No Render gratuito, suspensão adia a entrega e a fila retoma quando a API volta. Usar métricas agregadas das últimas 24 horas, idade do pendente mais antigo, falhas de envio e 429/503 para decidir entre continuar ou reverter. As medições em [#220](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/220) são locais. Cotas e latência reais requerem verificação em homologação.

## Evidências e pendências

A [SCRUM-244](https://squad21.atlassian.net/browse/SCRUM-244) complementa os contratos versionados. Os PRs [#219](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/219), [#221](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/221) e [#222](https://github.com/Squad-21-Residencia-em-Software-III/Residencia3/pull/222) concentram os aceites das histórias. O acompanhamento transversal está na [SCRUM-243](https://squad21.atlassian.net/browse/SCRUM-243). O preview visual referido no plano é um arquivo de trabalho local sem publicação compartilhada confirmada.

A aprovação de dispositivo depende de Push real em HTTPS, PWA instalado e checagem em Android, iOS e desktop. S2 depende de confirmação da origem funcional de material sensível. A aprovação de políticas de retenção de assinaturas e outbox segue com a liderança e o responsável pelo banco.
