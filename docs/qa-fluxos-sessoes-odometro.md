# QA de sessão, fluxos operacionais e odômetro

Rodada local de **26/11/2026**, sobre a develop `94b63e4`. API Express em loopback, PostgreSQL 17 descartável migrado com 32 migrations existentes, contas sintéticas e Edge desktop headless. O ensaio de odômetro usou o build `3b91968` com fotos habilitadas e armazenamento PostgreSQL. A mudança desse build é restrita à altura da central de notificações.

## Perfil, recurso e ação

| Perfil | Recurso e ação | Resultado observado | Evidência |
| --- | --- | --- | --- |
| Administrador | Consultar e gerir as duas operações. Ler a central de outro usuário. | Rotas de gestão autorizadas em ambas as operações. Aviso de outra conta retorna 404 e fica fora da listagem. | `matrizAcesso`, `notificacaoPostgres` e contrato SCRUM-226. |
| Gestor de Frota | Analisar e agendar solicitações administrativas. Reprogramar A6. | Recusa exige motivo. O titular consultou a justificativa e o agendamento retornou 201. A6 cobriu unidade, versão e concorrência. | Edge/HTTP, `reprogramacaoAdministrativaPostgres`. |
| Gestor SVO | Confirmar chamado próprio, gerir a coleta e consultar a frota administrativa. | Confirmação repetida devolveu uma ordem. Alocação removeu a ordem da lista de pendentes. A consulta administrativa expôs o DTO reduzido. A gravação na frota administrativa foi negada com 403. Sem vínculo com a unidade, rotas SVO foram negadas. | Edge/HTTP, `matrizAcesso`, `avisosSvoS3S5Postgres`. |
| Solicitante | Criar solicitação e acompanhar registros próprios. | A flag de material sensível persistiu no pedido administrativo. O titular leu status e justificativa. As rotas de aprovação e gestão são restritas por perfil. | Edge/HTTP, `matrizAcesso`. |
| Motorista da Frota | Iniciar e concluir a viagem atribuída. Vincular foto de outra viagem. | Saída e chegada HTTP 200 e fotos ativas no PostgreSQL. O backend recusou foto de outra viagem, foto usada e fase incompatível. | Edge, `evidenciaOdometroPostgres`. |
| Motorista SVO | Operar coleta atribuída e compartilhar evidência dentro do deslocamento. | Acesso por condutor atual. As ordens do mesmo deslocamento usaram a evidência comum, com a retenção contada do encerramento efetivo. | `evidenciaOdometroPostgres`, `avisosSvoS3S5Postgres`. |
| Integrante SVO | Consultar suas coletas e avisos conforme a designação. | A rota pessoal é exclusiva do perfil. Gestão e transições foram negadas pela matriz. O contrato de odômetro reserva a consulta de arquivos à gestão autorizada. Aviso ocultou conteúdo após retirada da designação. | `matrizAcesso`, `notificacaoAcessoPostgres`. |

## Sessões e jornadas exercitadas

- Sessão real. Login e refresh retornaram 200. O logout retornou 204 e expirou o cookie. Sem cookie, o refresh retornou 401. A troca de senha revogou access e refresh anteriores, com 401 em ambos. A nova sessão acessou `/api/auth/me` com HTTP 200 e o DTO omitiu os campos de credenciais. Os testes de token, autenticação e HTTP cobriram expiração, assinatura, validação de origem das rotas com cookie, CORS e cabeçalhos.
- Chamado interno SVO. No Edge, registro, confirmação e nova confirmação passaram. A API confirmou um único registro na fila, agendou com recursos sintéticos livres e retirou a ordem da fila pendente. Motivo vazio e recusa fora do estado permitido retornaram 400 e 409.
- Navegação autenticada. O Edge verificou ordem e seleção inicial, alternância, recarga e redirecionamento legado em Solicitações, Viagens e Veículos para Administrador, Gestor SVO e Gestor de Frota. As quatro larguras de 320 a 428 px da triagem SVO couberam na janela.
- Filtros. Dois testes reproduziram a perda da busca ao voltar à aba em Viagens e Veículos. Com a correção, os valores de cada operação permanecem enquanto o módulo está aberto, com o estado mantido em memória. As quatro suítes de páginas e rotas passaram com 68 testes, e o build TypeScript/Vite passou.
- Odômetro. O modal coube entre 320 e 428 px. O controle de captura declarou `capture="environment"` e o de arquivo ficou separado. O Edge selecionou JPEG sintético, mostrou a prévia e removeu a imagem. A jornada seguinte fez upload nas duas fases e concluiu a viagem com km 12.000 e 12.010. A API e a base confirmaram as duas fotos. O ensaio reaproveitou o contrato de fotos e a interface integrados.
- As sete suítes de backend de base passaram com 660 testes e um omitido do cron reservado ao GitHub Actions. As 13 suítes de frontend passaram com 187 testes. O recorte de reprogramação, notificações operacionais e triagem passou com 51 testes. A matriz de rotas revisada passou com 576 testes dos sete perfis e checagens de vínculo. Esses recortes se sobrepõem.

## Aceite complementar

Em homologação autorizada, siga o [manual operacional](manual-fluxos-operacionais.md), a [matriz de acesso](matriz-de-acesso.md) e o [guia de odômetro](operacao-odometro-e-agenda-svo.md). Registre perfil, ambiente, SHA, resultado esperado, observado e evidência sanitizada por caso. A revisão defensiva de consultas parametrizadas e renderização complementa os testes de origem e sessão. Ensaios de intrusão, validação institucional com contas reais e homologação física de câmera, galeria, permissão, teclado virtual e rede móvel permanecem **Não executado**.

Para a bancada móvel, repita saída e chegada em Android/Chrome e iOS/Safari com fotos fictícias. Confira cancelamento do seletor, permissão negada, formato aceito pelo contrato, perda de rede durante upload, reenvio e submissão única. Valide foto obrigatória e dispensa por gestor autorizado, incluindo duas ordens SVO do mesmo deslocamento e uma ordem separada.
