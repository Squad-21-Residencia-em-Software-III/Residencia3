# BL28 — Alocação de veículo SVO à ordem de coleta

A BL28 exige um veículo disponível para o período solicitado e com capacidade suficiente para a coleta. [SCRUM-33](https://squad21.atlassian.net/browse/SCRUM-33) · [SCRUM-103](https://squad21.atlassian.net/browse/SCRUM-103) · [Regras de agenda aprovadas na SCRUM-166](https://squad21.atlassian.net/browse/SCRUM-166)

## API e persistência

- `POST /api/viagens` com `tipo_operacao: "SVO"` recebe `solicitacao_id`, `veiculo_id`, `motorista_id`, `inicio_previsto` e `fim_previsto`. Os IDs são inteiros positivos. A solicitação deve estar `CONFIRMADA` e ter a ordem `AGUARDANDO_ALOCACAO` gerada na triagem. O HTTP 200 retorna essa mesma ordem em `ALOCADA`.
- Administradores e gestores associados à unidade SVO podem alocar. O serviço valida o perfil para a operação SVO, e a rota exige o vínculo com a unidade para `GESTOR_SVO`. O motorista responsável registra a execução.
- `alocarOrdemSvo` valida frota SVO, bloqueia veículos em manutenção e confere motorista SVO e CNH válida para o fim da coleta. Dentro da transação, o serviço coordena a agenda com um lock transacional do PostgreSQL e bloqueia as linhas relevantes antes de gravar. A atualização da ordem e da solicitação, as designações aplicáveis, a fila e a auditoria integram a transação.
- `POST /api/viagens/ordens-svo/:id/reprogramar` reutiliza a validação para ordens `ALOCADA`, permitindo trocar o veículo ou o período. Preserva o ID da ordem e os integrantes da mesma equipe quando a lista é omitida. O serviço atualiza os estados dos recursos, reavalia a fila e audita a reprogramação.

Implementação em [viagemService.ts](../src/backend/src/services/viagemService.ts), [viagemRoutes.ts](../src/backend/src/routes/viagemRoutes.ts) e [viagemSchemas.ts](../src/backend/src/validators/viagemSchemas.ts).

## Disponibilidade e ocupação

- `validarAgendaSvo` exige início futuro e término posterior. Sobreposição de veículo, motorista, equipe ou integrante designado gera `409 CONFLITO_AGENDA`. O fluxo também verifica reservas administrativas para veículo e motorista.
- Intervalos consecutivos podem compartilhar o horário de fim e início. Uma folga de 0 a menos de 20 minutos exige confirmação adicional e auditoria. O token expira após cinco minutos e vincula a confirmação ao autor, à ordem, aos recursos, ao período e aos conflitos avaliados. Sobreposição continua bloqueada mesmo com confirmação.
- Um veículo `EM_USO` pode receber uma reserva futura compatível se a coleta em curso ainda estiver dentro do período previsto. `EM_DESLOCAMENTO` e `NO_LOCAL` mantêm os recursos ocupados até a conclusão real. Se a coleta em curso ultrapassar o fim previsto, a agenda recusa nova alocação incompatível e a fila mantém bloqueadas as coletas afetadas. A fila reavalia a prioridade e a disponibilidade para liberar a próxima coleta elegível, sem registrar a saída.
- `GET /api/veiculos/svo/disponiveis` consulta a disponibilidade operacional no instante da chamada. A elegibilidade para o período solicitado é decidida na alocação ou no reagendamento.

Implementação em [agendaSvoService.ts](../src/backend/src/services/agendaSvoService.ts), [disponibilidadeService.ts](../src/backend/src/services/disponibilidadeService.ts), [filaSvoService.ts](../src/backend/src/services/filaSvoService.ts), [statusOrdemSvo.ts](../src/backend/src/constants/statusOrdemSvo.ts) e [veiculoModel.ts](../src/backend/src/models/veiculoModel.ts).

## Capacidade de óbitos e lotação da cabine

- `capacidade_utilizada` aceita de 1 a 4 óbitos e tem padrão 1. A API retorna 400 para entrada fora da faixa. O serviço também aplica o limite cadastrado em `capacidade_maxima` e rejeita capacidade insuficiente com 409. A agenda impede o uso simultâneo incompatível do veículo. Reservas em períodos distintos são avaliadas individualmente.
- A equipe é opcional e pode ser alocada sem escala cadastrada. Quando indicada, exige integrantes elegíveis com vínculo ativo, validados por período. A quantidade de integrantes é limitada a `lotacao_cabine - 1` para reservar o assento do motorista. A capacidade de óbitos é independente da lotação.

Implementação em [viagemSchemas.ts](../src/backend/src/validators/viagemSchemas.ts), [viagemService.ts](../src/backend/src/services/viagemService.ts) e [designacoesSvoService.ts](../src/backend/src/services/designacoesSvoService.ts).

## Evidências e homologação

| Critério | Cobertura automatizada |
|---|---|
| Frota, manutenção, limites do veículo, duas reservas de três óbitos em períodos distintos e reagendamento | [viagemService.test.ts](../src/backend/src/tests/viagemService.test.ts) |
| IDs, teto da API, autenticação, perfis e vínculo com a unidade | [viagemRoutes.test.ts](../src/backend/src/tests/viagemRoutes.test.ts) e [viagemService.test.ts](../src/backend/src/tests/viagemService.test.ts) |
| Sobreposição, folgas, token, atraso e `NO_LOCAL` | [agendaSvoService.test.ts](../src/backend/src/tests/agendaSvoService.test.ts) e [filaSvoService.test.ts](../src/backend/src/tests/filaSvoService.test.ts) |
| Reserva da vaga do motorista e designações individuais | [designacoesSvoService.test.ts](../src/backend/src/tests/designacoesSvoService.test.ts) |
| Disputa simulada entre alocação e edição da capacidade | [capacidadeSvoConcorrencia.test.ts](../src/backend/src/tests/capacidadeSvoConcorrencia.test.ts) |

Para a revisão independente de QA, restam a validação integrada do agendamento e do reagendamento e a homologação de concorrência e rollback em PostgreSQL real. O escopo desta revisão usa testes com mocks. Consulte também o [roteiro de validação do banco](validacao-banco-scrum-166-183.md) e o [contrato da SCRUM-196](scrum-196-contrato-banco.md).
