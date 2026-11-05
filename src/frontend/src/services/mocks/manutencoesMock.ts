import type { Manutencao } from '../../types/manutencao';

/**
 * Dados fictícios (mock) para desenvolvimento e testes no frontend.
 * Espelha as manutenções cadastradas nos seeds do backend.
 */
export const MOCK_MANUTENCOES: Manutencao[] = [
  {
    id: 1,
    veiculo_id: 3,
    fornecedor_id: 2,
    tipo_manutencao: 'CORRETIVA',
    data_manutencao: '2026-10-20',
    descricao: 'Troca de pastilhas de freio e alinhamento',
    custo: 850.0,
    status: 'CONCLUIDA',
    veiculo_placa: 'GHI3F45',
    veiculo_modelo: 'Renault Master',
    fornecedor_nome: 'Oficina Roda Presa',
  },
  {
    id: 2,
    veiculo_id: 3,
    fornecedor_id: 2,
    tipo_manutencao: 'CORRETIVA',
    data_manutencao: '2026-10-26',
    descricao: 'Reparo no sistema de injeção eletrônica',
    custo: 1420.0,
    status: 'EM_ANDAMENTO',
    veiculo_placa: 'GHI3F45',
    veiculo_modelo: 'Renault Master',
    fornecedor_nome: 'Oficina Roda Presa',
  },
  {
    id: 3,
    veiculo_id: 1,
    fornecedor_id: 2,
    tipo_manutencao: 'PREVENTIVA',
    data_manutencao: '2026-10-10',
    descricao: 'Revisão periódica de 10.000 km, troca de óleo e filtros',
    custo: 420.0,
    status: 'CONCLUIDA',
    veiculo_placa: 'ABC1D23',
    veiculo_modelo: 'Fiat Mobi',
    fornecedor_nome: 'Oficina Roda Presa',
  },
  {
    id: 4,
    veiculo_id: 2,
    fornecedor_id: 2,
    tipo_manutencao: 'PREVENTIVA',
    data_manutencao: '2026-10-15',
    descricao: 'Troca de velas de ignição e balanceamento',
    custo: 310.0,
    status: 'CONCLUIDA',
    veiculo_placa: 'DEF2E34',
    veiculo_modelo: 'Chevrolet Onix',
    fornecedor_nome: 'Oficina Roda Presa',
  },
];
