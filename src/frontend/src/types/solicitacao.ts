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
  data_chegada_desejada?: string; // timestamp
  status: StatusSolicitacao; // padrão: PENDENTE_APROVACAO
  motivo_recusa?: string | null; // preenchido apenas quando status = RECUSADA
}

export type NovaSolicitacaoInput = Omit<SolicitacaoViagem, 'id' | 'status' | 'motivo_recusa'>;
