# SCRUM-242 · Retenção de notificações

A liderança aprovou a entrega incremental da SCRUM-242 para retenção In-App. O job aplica os prazos documentados em SCRUM-224 e SCRUM-242. Notificações lidas ficam por 30 dias após a leitura e as não lidas ficam por 90 dias após a criação. Registros exatamente no limite são preservados. Cada exclusão revalida a elegibilidade na própria operação PostgreSQL para proteger leituras concorrentes. A simulação só conta candidatos. A execução em lotes pode ser repetida sem excluir novamente registros já processados. O modo definitivo permanece desativado por padrão e requer autorização para operação em produção.

A role de retenção lê as colunas necessárias ao filtro e pode excluir notificações. A aplicação e a rotina de expiração permanecem sem esse DELETE.

As histórias confirmam que inscrições inválidas ou expiradas e estados terminais do outbox serão expurgáveis. Os documentos disponíveis não especificam o prazo dessas duas classes nem a janela exigida para auditoria e deduplicação. Até a definição formal, essas tabelas permanecem fora do job de expurgo. Gabriel deve aplicar o provisionamento no ambiente real após aprovação da liderança.

## Simulação complementar de assinaturas e outbox

O inventário retorna uma contagem total e uma contagem anterior ao corte por estado em um único SELECT. O relógio é compartilhado pelos dois cortes, em dias de 24 horas. Linhas exatamente no limite ficam fora da contagem de registros antigos. O resultado não contém identificadores, endpoints, chaves, payloads ou erros brutos.

Para comparar cenários, compile o backend e execute em um banco isolado com uma role dedicada somente à leitura. Informe os dois prazos explicitamente.

```sh
npm run build
npm run notificacoes:inventario-push -- --assinaturas=90 --outbox=180
```

A role precisa de CONNECT no banco, USAGE no schema e SELECT por coluna em `push_subscriptions (status, ativa, atualizado_em)` e `notificacao_outbox (status, processado_em)`. A suíte executa com esses privilégios e confirma que leitura de endpoints, leitura de payloads e DELETE permanecem vedados. Uma categoria ausente no resultado tem zero linhas. Para comparar duas execuções, use os mesmos prazos e registre o horário de observação e as contagens agregadas.

| Dados | Ponto de partida para discussão | Marco usado pela simulação | Motivo |
| --- | --- | --- | --- |
| Assinaturas inválidas, revogadas ou expiradas | 90 dias | Última atualização da assinatura inativa | Permite comparar invalidações 404/410, revogações e recadastros ao longo de três meses. Qualquer atualização recente reinicia o relógio da simulação. |
| Outbox terminal | 180 dias | Conclusão registrada em `processado_em` | Dá visibilidade a falhas intermitentes e replays tardios. A janela de deduplicação precisa ser confirmada antes de eventual expurgo. |
| Assinaturas ativas e outbox `PENDENTE` ou `PROCESSANDO` | Preservar | Sem corte | O envio depende de assinaturas ativas e dos estados de trabalho, inclusive após suspensão e retry. |

Em equilíbrio, a estimativa é a taxa diária de transição para cada estado multiplicada pelos dias da janela. Com 10 assinaturas encerradas e 200 itens terminais por dia, a simulação de 90/180 dias equivale a aproximadamente 900 assinaturas e 36.000 itens terminais dentro das janelas. São números ilustrativos. Colete contagens diárias por estado no ambiente autorizado e meça o tamanho médio das linhas e dos índices antes de estimar espaço em disco.

A idade do registro é um indicador de volume. Antes de aprovar um expurgo, defina o prazo de replay, a janela de auditoria e os bloqueios de preservação. No outbox, as restrições por usuário/chave e por evento/destinatário/ocorrência sustentam a idempotência. O expurgo só poderá ocorrer após a janela aprovada ou com uma chave de deduplicação preservada em outro registro cuja restauração também tenha sido validada. Retentativas usam o item existente, e reprocessar um terminal precisa manter a identidade da ocorrência. Investigações e preservações institucionais prevalecem sobre qualquer prazo. A liderança deve aprovar prazos e critérios de guarda de forma expressa.

### Reprodução da rotina In-App

No PostgreSQL descartável `127.0.0.1/frotas_teste`, execute `retencaoNotificacoes.test.ts` com `NOTIFICACOES_POSTGRES_TESTS=1`. A suíte cobre privilégio mínimo da role de retenção, limites de 30/90 dias, simulação, concorrência, lotes, falha e reexecução. Para ensaiar o job hospedado, use uma cópia isolada do workflow com uma credencial de teste. Rode primeiro `simular`, execute `aplicar` em lotes apenas sobre as fixtures e confirme que a segunda aplicação remove zero registros. Provoque uma falha em um lote posterior, confira a persistência do lote confirmado e repita após restaurar a conexão. A agenda versionada é diária às 03h23 de Fortaleza. A execução hospedada e o provisionamento institucional dependem de ambiente autorizado.
