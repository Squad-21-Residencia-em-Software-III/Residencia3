# SCRUM-242 · Retenção de notificações

A liderança aprovou a entrega incremental da SCRUM-242 para retenção In-App. O job aplica os prazos documentados em SCRUM-224 e SCRUM-242. Notificações lidas ficam por 30 dias após a leitura e as não lidas ficam por 90 dias após a criação. Registros exatamente no limite são preservados. Cada exclusão revalida a elegibilidade na própria operação PostgreSQL para proteger leituras concorrentes. A simulação só conta candidatos. A execução em lotes pode ser repetida sem excluir novamente registros já processados. O modo definitivo permanece desativado por padrão e requer autorização para operação em produção.

A role de retenção lê as colunas necessárias ao filtro e pode excluir notificações. A aplicação e a rotina de expiração permanecem sem esse DELETE.

As histórias confirmam que inscrições inválidas ou expiradas e estados terminais do outbox serão expurgáveis. Os documentos disponíveis não especificam o prazo dessas duas classes nem a janela exigida para auditoria e deduplicação. Até a definição formal, essas tabelas permanecem fora do job de expurgo. Gabriel deve aplicar o provisionamento no ambiente real após aprovação da liderança.
