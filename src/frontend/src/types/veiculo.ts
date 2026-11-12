/**
 * Espelha a tabela `veiculos` do banco (ver docs/dicionario-de-dados.md).
 * Não adicionar campos que não existam na tabela.
 */
// Status controlado pelo backend (viagemService): RESERVADO ao criar viagem, EM_USO ao iniciar.
export type StatusVeiculo = 'DISPONIVEL' | 'RESERVADO' | 'EM_USO' | 'MANUTENCAO';
export type TipoFrota = 'ADMINISTRATIVA' | 'SVO';

export interface Veiculo {
  id: number;
  placa: string; // varchar(10), único
  modelo: string; // varchar(100)
  tipo_frota: TipoFrota;
  capacidade_maxima: number; // inteiro >= 0
  km_atual: number; // odômetro atual, atualizado ao finalizar viagem
  status: StatusVeiculo; // padrão no banco: DISPONIVEL
}

export type NovoVeiculoInput = Omit<Veiculo, 'id' | 'status'>;

/** Resposta de GET /veiculos/svo/ocupacao: ocupação atual dos veículos SVO (BL30). */
export interface OcupacaoVeiculoSvo {
  id: number;
  placa: string;
  modelo: string;
  capacidade_maxima: number;
  status: StatusVeiculo;
  capacidade_utilizada: number; // soma das ordens SVO ALOCADA/EM_DESLOCAMENTO
  vagas_disponiveis: number; // capacidade_maxima - capacidade_utilizada
}
