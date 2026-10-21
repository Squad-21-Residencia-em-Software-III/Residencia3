import type { Veiculo } from '../../types/veiculo';

/**
 * DADOS FICTÍCIOS (mock). Não vêm do banco nem da API.
 * Cópia exata dos veículos do seed do backend:
 * src/backend/database/seeds/01_dados_iniciais.js
 * Será substituído por chamada à API quando houver endpoint de listagem.
 */
export const MOCK_VEICULOS: Veiculo[] = [
  { id: 1, placa: 'ABC1D23', modelo: 'Fiat Mobi', tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 4, status: 'DISPONIVEL' },
  { id: 2, placa: 'DEF2E34', modelo: 'Chevrolet Onix', tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 4, status: 'DISPONIVEL' },
  { id: 3, placa: 'GHI3F45', modelo: 'Renault Master', tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 12, status: 'MANUTENCAO' },
  { id: 4, placa: 'JKL4G56', modelo: 'Fiat Ducato (SVO)', tipo_frota: 'SVO', capacidade_maxima: 2, status: 'DISPONIVEL' },
  { id: 5, placa: 'MNO5H67', modelo: 'Renault Master (SVO)', tipo_frota: 'SVO', capacidade_maxima: 2, status: 'DISPONIVEL' },
];
