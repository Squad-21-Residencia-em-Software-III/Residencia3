/**
 * Espelha a tabela `abastecimentos` do banco
 * (migration 20261014000001_create_initial_schema.js).
 * Não adicionar à persistência colunas que não existam na modelagem oficial.
 */

export interface Abastecimento {
  id: number;
  veiculo_id: number; // FK veiculos.id
  motorista_id: number; // FK motoristas.id
  fornecedor_id?: number | null; // FK fornecedores.id
  data_abastecimento: string; // date (ex: 2026-10-22)
  quilometragem: number; // integer
  litros: number; // decimal(10,2)
  valor_total: number; // decimal(10,2)
  posto_combustivel?: string | null; // varchar(150)

  // Campos calculados / joins de exibição para a interface (Figma)
  veiculo_placa?: string;
  veiculo_modelo?: string;
  motorista_nome?: string;
  valor_litro?: number; // valor_total / litros
  consumo_kml?: number; // km rodados / litros
  status?: 'CONFIRMADO' | 'PENDENTE';
}

export interface NovoAbastecimentoInput {
  veiculo_id: number;
  motorista_id: number;
  fornecedor_id?: number | null;
  data_abastecimento: string;
  quilometragem: number;
  litros: number;
  valor_total: number;
  posto_combustivel?: string;
}
