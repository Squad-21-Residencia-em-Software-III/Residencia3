const env = import.meta.env;

// Compatibilidade temporária com os nomes documentados em docs/configuracao-recursos-operacionais.md.
function flagAtiva(atual: string | undefined, legado: string | undefined): boolean {
  if (atual !== undefined && legado !== undefined && atual !== legado) return false;
  return (atual ?? legado) === 'true';
}

const recursosOperacionais = {
  mapasInternos: flagAtiva(env.VITE_MAPAS_INTERNOS_ATIVOS, env.VITE_FASE3_MAPAS_INTERNOS),
  multiplasParadas: flagAtiva(env.VITE_MULTIPLAS_PARADAS_ATIVAS, env.VITE_FASE3_MULTIPLAS_PARADAS),
  mapasSvo: flagAtiva(env.VITE_MAPAS_SVO_ATIVOS, env.VITE_FASE3_MAPAS_SVO),
  portalSvo: flagAtiva(env.VITE_PORTAL_SVO_ATIVO, env.VITE_FASE3_PORTAL_SVO),
  acompanhamentoExterno: flagAtiva(env.VITE_ACOMPANHAMENTO_EXTERNO_SVO_ATIVO, env.VITE_FASE3_ACOMPANHAMENTO_EXTERNO),
  gpsObrigatorio: flagAtiva(env.VITE_GPS_OBRIGATORIO_ATIVO, env.VITE_FASE3_GPS_OBRIGATORIO),
  capturaPeriodica: flagAtiva(env.VITE_CAPTURA_PERIODICA_GPS_ATIVA, env.VITE_FASE3_CAPTURA_PERIODICA),
};

/**
 * Contratos da SCRUM-166. A implantação do frontend e do backend deve acompanhar a migration
 * de estado da agenda revisada pela frente DB, conforme docs/scrum-166-contrato-backend.md.
 */
export const RECURSOS_BACKEND = {
  ...recursosOperacionais,
  emergenciaGps: recursosOperacionais.gpsObrigatorio && flagAtiva(env.VITE_EMERGENCIA_GPS_ATIVA, env.VITE_FASE3_EMERGENCIA_GPS),
  confirmacaoAutomatica: recursosOperacionais.multiplasParadas && recursosOperacionais.capturaPeriodica &&
    flagAtiva(env.VITE_CONFIRMACAO_AUTOMATICA_PARADAS_ATIVA, env.VITE_FASE3_CONFIRMACAO_AUTOMATICA),

  /**
   * SCRUM-178: `PATCH /solicitacoes-svo/:id/recusar` com `{ motivo_recusa }` e status RECUSADA.
   * Serviço: `solicitacoesSvoApi.recusar`.
   */
  recusaSvo: true,

  /**
   * SCRUM-308: cadastro e edição de CNH na aba Motoristas (`POST`/`PATCH /motoristas`). Desligado até a
   * confirmação institucional da matriz; ligue junto com MOTORISTAS_ESCRITA_ATIVA no backend.
   */
  escritaMotoristas: env.VITE_MOTORISTAS_ESCRITA_ATIVA === 'true',

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
  agendamentoTemporalSvo: import.meta.env.VITE_AGENDA_SVO_ATIVA === 'true',

  /**
   * SCRUM-182: `GET /viagens/ordens-svo/pendentes`, ordens AGUARDANDO_ALOCACAO paginadas.
   * Desligado, a lista verifica o estado real da ordem no detalhe de cada solicitação confirmada. Serviço: `viagensApi.listarOrdensPendentesSvo`.
   */
  ordensPendentesSvo: true,

  /**
   * SCRUM-238: alertas no aparelho (Web Push). Depende do banco (SCRUM-236), do back (SCRUM-237) e
   * do service worker (SCRUM-239), conforme docs/scrum-238-contrato-push.md. Desligado, as
   * preferências do aplicativo ficam como antes. Serviço: `notificacoesPushApi`.
   */
  webPush: import.meta.env.VITE_WEB_PUSH_ATIVO === 'true',

  /**
   * SCRUM-203: fotos do odômetro na saída e na chegada. Depende do back (SCRUM-208/209), do banco
   * (SCRUM-210) e do armazenamento privado (SCRUM-211), conforme docs/scrum-203-contrato-backend.md.
   * Desligado, iniciar e finalizar funcionam como antes, sem foto e sem `evidencia_id`.
   * Serviço: `evidenciasOdometroApi`.
   */
  fotosOdometro: import.meta.env.VITE_FOTOS_ODOMETRO_ATIVAS === 'true',

  /**
   * SCRUM-227: Central de Notificações In-App (sino, dropdown, leitura e polling econômico).
   * Depende dos endpoints do backend (SCRUM-226) e da tabela `notificacoes` (SCRUM-225), conforme
   * docs/contrato-notificacoes-in-app.md. Desligado, nenhuma chamada `/api/notificacoes/*` é feita.
   * Serviço: `notificacoesApi`.
   */
  notificacoesInApp: import.meta.env.VITE_NOTIFICACOES_IN_APP_ATIVAS === 'true',
};

export type RecursoBackend = keyof typeof RECURSOS_BACKEND;

export const recursoAtivo = (recurso: RecursoBackend): boolean => RECURSOS_BACKEND[recurso];
