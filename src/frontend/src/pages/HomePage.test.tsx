import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from './HomePage';
import { dashboardApi } from '../services/api/dashboardApi';
import { solicitacoesApi } from '../services/api/solicitacoesApi';

vi.mock('../services/api/dashboardApi', () => ({
  dashboardApi: {
    consultar: vi.fn(),
  },
}));

vi.mock('../services/api/solicitacoesApi', () => ({
  solicitacoesApi: {
    listar: vi.fn(),
    criar: vi.fn(),
  },
}));

describe('HomePage (Central de Operações)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dashboardApi.consultar).mockResolvedValue({
      periodo: { inicio: null, fim: null },
      solicitacoes_pendentes: 3,
      viagens_em_andamento: 2,
      veiculos_disponiveis: { total: 5, administrativa: 4, svo: 1 },
      alertas: { total: 2, veiculos_em_manutencao: 1, motoristas_cnh_vencida: 1 },
    });

    vi.mocked(solicitacoesApi.listar).mockResolvedValue([
      {
        id: 42,
        solicitante_id: 1,
        solicitante_nome: 'Carlos Enfermeiro',
        origem: 'Base Central',
        destino: 'Hospital Regional',
        finalidade: 'Transporte de insumos',
        data_saida_desejada: '2026-11-10T09:00:00Z',
        status: 'PENDENTE_APROVACAO',
      } as any,
    ]);
  });

  it('deve renderizar os indicadores da API REST e a fila de solicitações pendentes', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Carlos Enfermeiro')).toBeInTheDocument();
      expect(screen.getByText('Base Central → Hospital Regional')).toBeInTheDocument();
    });

    expect(screen.getByText('Central de Operações da Frota')).toBeInTheDocument();
    expect(screen.getByText('Solicitações pendentes')).toBeInTheDocument();
    expect(screen.getByText('Viagens em andamento')).toBeInTheDocument();
    expect(screen.getByText('Veículos no pátio')).toBeInTheDocument();
    expect(screen.getByText('Alertas da operação')).toBeInTheDocument();
    expect(screen.getByText('Fila de Aprovação')).toBeInTheDocument();
    expect(screen.getByText('Bloqueios & Regularidade')).toBeInTheDocument();
  });
});

