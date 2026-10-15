import type { Motorista } from '../../types/motorista';

/**
 * DADOS FICTÍCIOS (mock). Não vêm do banco nem da API.
 * Cópia exata dos motoristas do seed do backend, com o nome vindo dos usuários do mesmo seed:
 * src/backend/database/seeds/01_dados_iniciais.js
 * O seed não define `status`, então vale o padrão do banco (DISPONIVEL).
 * A CNH de "Pedro Vencido" está vencida de propósito no seed.
 */
export const MOCK_MOTORISTAS: Motorista[] = [
  { id: 1, usuario_id: 5, nome: 'Max Verstappen', numero_cnh: '33333333333', categoria_cnh: 'B', validade_cnh: '2030-12-31', tipo_motorista: 'FROTA', status: 'DISPONIVEL' },
  { id: 2, usuario_id: 6, nome: 'Fernando Alonso', numero_cnh: '10000000002', categoria_cnh: 'D', validade_cnh: '2030-06-30', tipo_motorista: 'FROTA', status: 'DISPONIVEL' },
  { id: 3, usuario_id: 7, nome: 'Lewis Hamilton', numero_cnh: '10000000003', categoria_cnh: 'B', validade_cnh: '2028-01-15', tipo_motorista: 'FROTA', status: 'DISPONIVEL' },
  { id: 4, usuario_id: 8, nome: 'Rubens Barrichello', numero_cnh: '10000000004', categoria_cnh: 'B', validade_cnh: '2024-01-15', tipo_motorista: 'FROTA', status: 'DISPONIVEL' },
  { id: 5, usuario_id: 9, nome: 'Nelson Piquet', numero_cnh: '10000000005', categoria_cnh: 'B', validade_cnh: '2024-01-15', tipo_motorista: 'SVO', status: 'DISPONIVEL' },
  { id: 6, usuario_id: 10, nome: 'Ayrton Senna', numero_cnh: '10000000006', categoria_cnh: 'B', validade_cnh: '2024-01-15', tipo_motorista: 'FROTA', status: 'DISPONIVEL' },
  { id: 7, usuario_id: 11, nome: 'Michael Schumacher', numero_cnh: '10000000007', categoria_cnh: 'B', validade_cnh: '2024-01-15', tipo_motorista: 'FROTA', status: 'DISPONIVEL' },
  { id: 8, usuario_id: 12, nome: 'Alain Prost', numero_cnh: '10000000008', categoria_cnh: 'B', validade_cnh: '2024-01-15', tipo_motorista: 'SVO', status: 'DISPONIVEL' },
  { id: 9, usuario_id: 13, nome: 'Niki Lauda', numero_cnh: '10000000009', categoria_cnh: 'B', validade_cnh: '2024-01-15', tipo_motorista: 'SVO', status: 'DISPONIVEL' },
];
