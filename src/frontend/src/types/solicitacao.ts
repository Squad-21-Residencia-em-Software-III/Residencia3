/**
 * Espelha a tabela `solicitacoes_viagem` do banco (migrations 20261014000001 e 20261104133113).
 * `solicitante_nome` vem de `usuarios.nome` via `solicitante_id`.
 */

export type StatusSolicitacao =
  | 'PENDENTE_APROVACAO'
  | 'APROVADA'
  | 'AGENDADA'
  | 'CONCLUIDA'
  | 'RECUSADA'
  | 'CANCELADA';

export const LABELS_STATUS_SOLICITACAO: Record<StatusSolicitacao, string> = {
  PENDENTE_APROVACAO: 'Pendente',
  APROVADA: 'Aprovada',
  AGENDADA: 'Agendada',
  CONCLUIDA: 'Concluída',
  RECUSADA: 'Recusada',
  CANCELADA: 'Cancelada',
};

export interface SolicitacaoViagem {
  id: number;
  solicitante_id: number;
  solicitante_nome: string; // join com usuarios.nome
  origem: string; // varchar(255)
  destino: string; // varchar(255)
  finalidade: string; // text
  data_saida_desejada: string; // timestamp (ISO string YYYY-MM-DDTHH:mm:ss)
  data_chegada_desejada?: string | null; // timestamp
  status: StatusSolicitacao; // padrão: PENDENTE_APROVACAO
  motivo_recusa?: string | null; // preenchido apenas quando status = RECUSADA
  unidade_id?: number | null; // nula nas solicitações anteriores à escolha de unidade
  unidade_nome?: string | null; // join com unidades.nome
}

export type NovaSolicitacaoInput = Omit<SolicitacaoViagem, 'id' | 'status' | 'motivo_recusa'>;

/** Corpo de POST /solicitacoes-viagem; o solicitante vem do usuário autenticado. */
export interface NovaSolicitacaoApiInput {
  unidade_id: number;
  origem: string;
  destino: string;
  finalidade: string;
  data_saida_desejada: string;
  data_chegada_desejada?: string;
}

/** Resposta de GET /solicitacoes-viagem/:id/disponibilidade. */
export interface DisponibilidadeSolicitacao {
  veiculos_disponiveis: { id: number }[];
  motoristas_disponiveis: { id: number }[];
}
