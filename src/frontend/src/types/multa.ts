/**
 * Espelha a tabela `multas` do banco
 * (migrations 20261014000001, 20261024200606 e 20261026141312/20261026150236).
 * `motorista_id` é anulável: o vínculo é feito "quando aplicável" (RF10 / RN17).
 */
export type StatusPagamentoMulta = 'PENDENTE' | 'PAGO' | 'CANCELADO';

export const STATUS_MULTA: StatusPagamentoMulta[] = ['PENDENTE', 'PAGO', 'CANCELADO'];

export const LABELS_STATUS_MULTA: Record<StatusPagamentoMulta, string> = {
  PENDENTE: 'Pendente',
  PAGO: 'Paga',
  CANCELADO: 'Cancelada',
};

export interface Multa {
  id: number;
  veiculo_id: number; // FK veiculos.id
  motorista_id?: number | null; // FK motoristas.id (opcional)
  id_infracao?: string | null; // varchar(255) - código do Detran
  orgao_autuador?: string | null; // varchar(255)
  data_infracao: string; // timestamp (ISO, ex: 2026-10-15T14:30)
  data_vencimento?: string | null; // date (AAAA-MM-DD)
  status_pagamento: StatusPagamentoMulta; // padrão: PENDENTE
  valor: number; // decimal(10,2), > 0
  descricao?: string | null; // text
  pontos: number; // integer, >= 0

  // Campos de exibição (joins), não existem na tabela
  veiculo_placa?: string;
  veiculo_modelo?: string;
  motorista_nome?: string | null;
}

export interface NovaMultaInput {
  veiculo_id: number;
  motorista_id?: number | null;
  id_infracao?: string;
  orgao_autuador?: string;
  data_infracao: string;
  data_vencimento?: string | null;
  status_pagamento: StatusPagamentoMulta;
  valor: number;
  descricao?: string;
  pontos: number;
}

export type AtualizarMultaInput = Partial<NovaMultaInput>;
