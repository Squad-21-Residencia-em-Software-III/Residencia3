/**
 * Partes do front da SCRUM-166 que dependem de entregas do backend ou do banco ainda não
 * integradas na develop.
 *
 * Com o recurso desligado, a tela usa só o que a API atual oferece e não envia campos que o
 * servidor ainda ignoraria (nada de sucesso falso). Quando o PR do back correspondente for
 * aprovado, basta mudar o valor para `true` aqui; o contrato esperado está em cada item e no
 * serviço indicado.
 */
export const RECURSOS_BACKEND = {
  /**
   * SCRUM-178: `PATCH /solicitacoes-svo/:id/recusar` com `{ motivo_recusa }` e status RECUSADA.
   * Serviço: `solicitacoesSvoApi.recusar`.
   */
  recusaSvo: true,

  /**
   * SCRUM-179: `GET /viagens/minhas`, viagens administrativas das solicitações do próprio usuário
   * (Gestor SVO acompanha só as próprias). Serviço: `viagensApi.listarMinhasAdministrativas`.
   */
  minhasViagensAdministrativas: true,

  /**
   * SCRUM-175 (banco) + SCRUM-181 (back): coluna `veiculos.lotacao_cabine` (pessoas na cabine,
   * motorista incluído), validada no cadastro e na edição de veículos SVO.
   */
  lotacaoCabine: true,

  /**
   * SCRUM-176 (banco) + SCRUM-182 (back): agendamento da coleta com `inicio_previsto` e
   * `fim_previsto`, bloqueio de sobreposição (409) e confirmação de intervalo menor que 20 min.
   * Serviço: `viagensApi.agendarColetaSvo`.
   */
  agendamentoTemporalSvo: false,

  /**
   * SCRUM-182: `GET /viagens/ordens-svo/pendentes`, ordens AGUARDANDO_ALOCACAO paginadas.
   * Desligado, a lista verifica o estado real da ordem no detalhe de cada solicitação confirmada. Serviço: `viagensApi.listarOrdensPendentesSvo`.
   */
  ordensPendentesSvo: true,
};

export type RecursoBackend = keyof typeof RECURSOS_BACKEND;

export const recursoAtivo = (recurso: RecursoBackend): boolean => RECURSOS_BACKEND[recurso];
