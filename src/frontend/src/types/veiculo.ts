/**
 * Espelha a tabela `veiculos` do banco (ver docs/dicionario-de-dados.md).
 * Não adicionar campos que não existam na tabela.
 */
export type StatusVeiculo = 'DISPONIVEL' | 'EM_USO' | 'MANUTENCAO';
export type TipoFrota = 'ADMINISTRATIVA' | 'SVO';

export interface Veiculo {
  id: number;
  placa: string; // varchar(10), único
  modelo: string; // varchar(100)
  tipo_frota: TipoFrota;
  capacidade_maxima: number; // inteiro >= 0
  status: StatusVeiculo; // padrão no banco: DISPONIVEL
}
