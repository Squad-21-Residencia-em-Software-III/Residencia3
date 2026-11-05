// Espelha a constraint chk_solicitacoes_viagem_status
export const LISTA_STATUS_SOLICITACAO_VIAGEM = [
  'PENDENTE_APROVACAO',
  'APROVADA',
  'AGENDADA',
  'CONCLUIDA',
  'RECUSADA',
  'CANCELADA',
] as const;

export type StatusSolicitacaoViagem = (typeof LISTA_STATUS_SOLICITACAO_VIAGEM)[number];
