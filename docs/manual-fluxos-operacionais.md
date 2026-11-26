# Manual de operação de viagens e coletas

## Solicitações e viagens administrativas

Em **Solicitações → Administrativo**, crie ou acompanhe sua solicitação pelo período de saída pretendida. Quando o gestor aprovar, a solicitação fica disponível em **Viagens → Administrativo → Agendar viagem** para seleção de veículo e motorista. Em **Minhas solicitações**, confira o andamento e os detalhes. O Gestor SVO também acompanha em **Viagens → Administrativo** as viagens que ele próprio solicitou, com dados operacionais reduzidos.

Quando a expiração administrativa estiver habilitada no ambiente, o status **Expirada** indica que se passaram 30 minutos da saída desejada enquanto a solicitação ainda aguardava agendamento. Veja o contador no filtro **Expiradas**. O prazo encerra a possibilidade de agendar aquela solicitação.

## Odômetro na saída e na chegada

Nos ambientes com o odômetro habilitado, abra a viagem ou coleta atribuída a você. Em **Iniciar**, informe o km inicial e use **Tirar foto agora** ou **Carregar foto**. Em **Finalizar**, confira o km inicial, informe o km final e fotografe novamente se a fase ainda estiver aberta. Confira a prévia e aguarde a confirmação do servidor. Em uma coleta SVO compartilhada, o sistema exibe a comprovação da fase quando o deslocamento já tem evidência correspondente.

Se a foto estiver indisponível, selecione **Solicitar autorização sem foto**, explique o motivo e envie. Use **Atualizar pedido** para consultar a decisão. Com aprovação, preencha a quilometragem e confirme a operação. Com recusa, leia a justificativa, envie a foto ou registre novo pedido se houver informação adicional.

O gestor abre **Viagens**, escolhe a operação e seleciona **Pedidos sem foto**. Confira registro, motorista, fase, data e motivo. Informe a justificativa e clique **Aprovar** ou **Recusar**. O detalhe da viagem mostra a evidência registrada. O acesso às imagens é de gestores autorizados; a expiração da foto por retenção preserva o registro da viagem.

## Triagem e agenda SVO

Em **Solicitações → SVO**, registre a chamada interna, abra a triagem e confirme ou recuse com justificativa. A confirmação encaminha a ordem a **Viagens → SVO**. Quando a agenda temporal estiver habilitada, selecione a ordem pendente, o período previsto, o veículo, o motorista e, se necessário, a equipe com seus integrantes. Analise o aviso de intervalo reduzido e confirme somente se o encaixe for viável. O sistema revalida a disponibilidade. Reprograme antes da saída se os recursos precisarem mudar.

O motorista registra a saída, usa **Cheguei ao local** e finaliza após a coleta. Enquanto estiver **No local**, os recursos continuam ocupados. Um integrante acompanha apenas as coletas em que está designado.

### Roteiro de demonstração e homologação

| Etapa | Ação e resultado esperado |
| --- | --- |
| 1. Administrativo | Entre com Solicitante e crie um pedido com o horário desejado. Entre com Gestor de Frota para aprovar um pedido e recusar outro com justificativa. O solicitante acompanha os próprios registros. |
| 2. Agendamento e A6 | Agende com veículo e motorista disponíveis. Antes da saída, reprogramar A6 muda o início e fim previstos e preserva solicitação e recursos. Use o Administrador ou o Gestor de Frota associado à unidade da solicitação. Abra o detalhe para conferir datas solicitadas, planejadas e, depois da execução, reais. [Contrato A6](scrum-231-reprogramacao.md) |
| 3. Triagem e agenda SVO | Registre um chamado interno, confirme duas vezes e confira que existe uma ordem. Ao alocar, compare a capacidade de corpos e a lotação da cabine, que inclui o motorista. Use designação nominal para os integrantes; a equipe, quando pertinente, apoia a organização. Um intervalo de 0 a menos de 20 minutos exige confirmação adicional. Sobreposição de reservas continua bloqueada. [Agenda SVO](bl28-alocacao-veiculo-svo.md) |
| 4. Ocupação e cancelamento | Acompanhe o deslocamento, o estado **No local** e a liberação após a conclusão real. Confirme que os integrantes veem a própria designação ou histórico autorizado. Exercite cancelamento e reprogramação antes da saída e confira estado, aviso e histórico. [Contrato operacional](scrum-166-contrato-backend.md) |
| 5. Odômetro | Registre quilometragem e foto de saída e chegada quando exigidas. No ensaio físico, valide câmera, galeria, prévia, troca, remoção e rede instável. Em uma segunda viagem, simule indisponibilidade e confira justificativa e auditoria na dispensa por gestor da operação. A retenção dos arquivos conta 12 meses da conclusão efetiva e preserva os metadados e a auditoria aplicáveis. [Evidências e acesso](evidencias-odometro.md) |
| 6. Notificações | Abra a central, leia um aviso e confira o destino autorizado. Exercite os sete perfis, preferências, Push permitido e negado e sessão encerrada em dispositivo com suporte. Para o rollout, avance de In-App a Push e só depois às rotinas, com evidência de backup e restauração. [Guia da Fase 2](notificacoes-fase2.md) · [Backup e recuperação](politica-backup-e-recuperacao-db.md) |

Use dados sintéticos e registre perfil, ambiente, SHA, pré-condição, resultado observado e evidência para cada etapa. Leve itens físicos, de acessibilidade e de ambiente publicado à [matriz de homologação](scrum-243-homologacao-fase2.md).
