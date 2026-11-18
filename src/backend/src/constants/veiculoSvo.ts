// RN11: cada veículo SVO comporta, no máximo, quatro óbitos simultâneos
export const CAPACIDADE_MAXIMA_SVO = 4;

// RN10: um veículo SVO só recebe novas ordens nestes status. É a mesma regra de
// GET /api/veiculos/svo/disponiveis. MANUTENCAO e EM_USO ficam de fora.
export const STATUS_VEICULO_SVO_ALOCAVEL = ['DISPONIVEL', 'RESERVADO'] as const;

// Ordens SVO que ocupam vagas no veículo (RN11/RN12)
export const STATUS_ORDEM_SVO_OCUPA_VAGA = ['ALOCADA', 'EM_DESLOCAMENTO'] as const;
