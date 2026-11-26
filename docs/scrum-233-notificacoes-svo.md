# SCRUM-233 · Alertas do SVO

A criação de solicitação SVO publica S1 na transação de registro via SCRUM-229. O autor é excluído. Administradores ativos e gestores SVO ativos vinculados à unidade SVO recebem o aviso na central. A fila verifica acesso e preferência atuais antes da entrega Push.

A referência é SOLICITACAO_SVO e a categoria Push é SVO. O Push usa texto neutro e direciona à triagem. A publicação depende de NOTIFICACOES_ATIVAS, desligada por padrão.

S2 permanece bloqueado. Embora o modelo persista solicitacoes_svo.material_sensivel, o formulário atual não fornece esse valor como fonte funcional confirmada. A confirmação de domínio e a entrega no formulário são condições para implementar o gatilho.
