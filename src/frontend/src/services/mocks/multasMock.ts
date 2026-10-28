import type { Multa } from '../../types/multa';

/**
 * DADOS FICTÍCIOS (mock), alinhados ao seed oficial (01_dados_iniciais.js)
 * e aos IDs de veículos/motoristas dos demais mocks.
 */
export const MOCK_MULTAS: Multa[] = [
  {
    id: 1,
    veiculo_id: 1,
    veiculo_placa: 'ABC1D23',
    veiculo_modelo: 'Fiat Mobi',
    motorista_id: 1,
    motorista_nome: 'Max Verstappen',
    id_infracao: 'A123456789',
    orgao_autuador: 'SMTT',
    data_infracao: '2026-10-15T14:30',
    data_vencimento: '2026-11-20',
    status_pagamento: 'PENDENTE',
    valor: 130.16,
    descricao: 'Excesso de velocidade',
    pontos: 4,
  },
  {
    id: 2,
    veiculo_id: 2,
    veiculo_placa: 'DEF2E34',
    veiculo_modelo: 'Chevrolet Onix',
    motorista_id: 2,
    motorista_nome: 'Fernando Alonso',
    id_infracao: 'B987654321',
    orgao_autuador: 'PRF',
    data_infracao: '2026-09-28T09:10',
    data_vencimento: '2026-10-30',
    status_pagamento: 'PAGO',
    valor: 195.23,
    descricao: 'Avanço de sinal vermelho',
    pontos: 7,
  },
  {
    id: 3,
    veiculo_id: 3,
    veiculo_placa: 'GHI3F45',
    veiculo_modelo: 'Renault Master',
    motorista_id: null,
    motorista_nome: null,
    id_infracao: null,
    orgao_autuador: 'Detran',
    data_infracao: '2026-10-02T18:45',
    data_vencimento: '2026-11-05',
    status_pagamento: 'PENDENTE',
    valor: 88.38,
    descricao: 'Estacionamento em local proibido (motorista a identificar)',
    pontos: 3,
  },
];
