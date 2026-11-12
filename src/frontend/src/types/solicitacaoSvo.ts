/**
 * Espelha as respostas de /solicitacoes-svo (BL26 / BL27).
 * Não adicionar campos que a API não retorna.
 */
export type StatusSolicitacaoSvo =
  'EM_TRIAGEM' | 'CONFIRMADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'RECUSADA' | 'CANCELADA';

export type StatusOrdemSvo =
  'AGUARDANDO_ALOCACAO' | 'ALOCADA' | 'EM_DESLOCAMENTO' | 'CONCLUIDA' | 'CANCELADA';

export interface SolicitacaoSvo {
  id: number;
  registrante_id: number;
  dados_solicitante: string;
  local_ocorrencia: string;
  material_sensivel: boolean;
  status: StatusSolicitacaoSvo;
  observacoes?: string | null;
  criado_em?: string;
  confirmado_por?: number | null; // nulo em dados legados e quando volta à triagem
  confirmado_em?: string | null;
}

/** Ordem de coleta gerada na confirmação; nasce sem veículo, motorista ou equipe. */
export interface OrdemSvo {
  id: number;
  solicitacao_id: number;
  status: StatusOrdemSvo;
  veiculo_id: number | null;
  motorista_id: number | null;
  equipe_id: number | null;
  capacidade_utilizada: number;
}

/** GET /solicitacoes-svo/:id: a solicitação com a ordem ativa, quando houver. */
export interface SolicitacaoSvoDetalhada extends SolicitacaoSvo {
  ordem: OrdemSvo | null;
}

/** GET /solicitacoes-svo?pagina=&limite=&status= (limite máximo 100). */
export interface ListaSolicitacoesSvo {
  dados: SolicitacaoSvo[];
  paginacao: {
    pagina: number;
    limite: number;
    total: number;
    totalPaginas: number;
  };
}

/** PATCH /solicitacoes-svo/:id/confirmar */
export interface ConfirmacaoSvo {
  solicitacao: SolicitacaoSvo;
  ordem: OrdemSvo;
}

export const LABELS_STATUS_SOLICITACAO_SVO: Record<StatusSolicitacaoSvo, string> = {
  EM_TRIAGEM: 'Em triagem',
  CONFIRMADA: 'Confirmada',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  RECUSADA: 'Recusada',
  CANCELADA: 'Cancelada',
};

export const LABELS_STATUS_ORDEM_SVO: Record<StatusOrdemSvo, string> = {
  AGUARDANDO_ALOCACAO: 'Aguardando alocação',
  ALOCADA: 'Alocada',
  EM_DESLOCAMENTO: 'Em deslocamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};
