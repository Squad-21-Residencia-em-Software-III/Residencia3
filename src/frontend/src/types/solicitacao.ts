/**
 * Espelha a tabela `solicitacoes_viagem` do banco (migration 20261014000001_create_initial_schema.js).
 * `solicitante_nome` vem de `usuarios.nome` via `solicitante_id`.
 */

export type StatusSolicitacao = 'PENDENTE_APROVACAO' | 'APROVADA' | 'REJEITADA' | 'CANCELADA';

export const LABELS_STATUS_SOLICITACAO: Record<StatusSolicitacao, string> = {
  PENDENTE_APROVACAO: 'Pendente',
  APROVADA: 'Aprovada',
  REJEITADA: 'Rejeitada',
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
}

export interface ViagemResumoDashboard {
  id: number;
  hora: string;
  origem: string;
  destino: string;
  veiculo_modelo: string;
  veiculo_placa: string;
  motorista_nome: string;
}
