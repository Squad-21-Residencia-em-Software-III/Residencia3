/**
 * Contratos da SCRUM-166. A implantação do frontend e do backend deve acompanhar a migration
 * de estado da agenda revisada pela frente DB, conforme docs/scrum-166-contrato-backend.md.
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
  agendamentoTemporalSvo: true,

  /**
   * SCRUM-182: `GET /viagens/ordens-svo/pendentes`, ordens AGUARDANDO_ALOCACAO paginadas.
   * Desligado, a lista verifica o estado real da ordem no detalhe de cada solicitação confirmada. Serviço: `viagensApi.listarOrdensPendentesSvo`.
   */
  ordensPendentesSvo: true,
};

export type RecursoBackend = keyof typeof RECURSOS_BACKEND;

export const recursoAtivo = (recurso: RecursoBackend): boolean => RECURSOS_BACKEND[recurso];
