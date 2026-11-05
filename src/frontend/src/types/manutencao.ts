/**
 * Espelha a tabela `manutencoes` do banco
 * (migrations 20261014000001_create_initial_schema.js e 20261026143858_regras_tabela_manutencoes.js).
 */

export type TipoManutencao = 'PREVENTIVA' | 'CORRETIVA';
export type StatusManutencao = 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA';

export interface Manutencao {
  id: number;
  veiculo_id: number;
  fornecedor_id?: number | null;
  tipo_manutencao: TipoManutencao;
  data_manutencao: string;
  descricao: string;
  custo: number;
  status: StatusManutencao;

  // Joins/detalhes opcionais para exibição
  veiculo_placa?: string;
  veiculo_modelo?: string;
  fornecedor_nome?: string;
}

export interface NovaManutencaoInput {
  veiculo_id: number;
  fornecedor_id?: number | null;
  tipo_manutencao: TipoManutencao;
  data_manutencao: string;
  descricao: string;
  custo: number;
  status: StatusManutencao;
  atualizar_status_veiculo?: boolean;
}
