import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VeiculosPage from './VeiculosPage';
import { veiculosApi } from '../services/api/veiculosApi';

vi.mock('../services/api/veiculosApi', () => ({
  veiculosApi: {
    listar: vi.fn(),
    criar: vi.fn(),
    atualizar: vi.fn(),
  },
}));

vi.mock('../services/api/abastecimentosApi', () => ({
  abastecimentosApi: {
    criar: vi.fn(),
    listarPorVeiculo: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/api/multasApi', () => ({
  multasApi: {
    criar: vi.fn(),
    listar: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/api/manutencoesApi', () => ({
  manutencoesApi: {
    listarPorVeiculo: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/api/motoristasApi', () => ({
  motoristasApi: {
    listar: vi.fn().mockResolvedValue([]),
    buscarMeuPerfil: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    usuario: { id: 1, nome: 'Gestor', perfil: 'GESTOR_FROTA' },
    temPerfil: () => true,
  }),
}));

describe('VeiculosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(veiculosApi.listar).mockResolvedValue([
      {
        id: 1,
        placa: 'BRA2E19',
        modelo: 'Ambulância UTI Móvel',
        tipo_frota: 'ADMINISTRATIVA',
        status: 'DISPONIVEL',
        capacidade_maxima: 5,
        km_atual: 45000,
      },
    ]);
  });

  it('deve listar veículos na tabela e exibir os cartões de status', async () => {
    render(
      <MemoryRouter>
        <VeiculosPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('BRA2E19')).toBeInTheDocument();
      expect(screen.getByText('Ambulância UTI Móvel')).toBeInTheDocument();
    });

    expect(screen.getByText(/Total na Frota/i)).toBeInTheDocument();
    expect(screen.getByText(/Disponíveis/i)).toBeInTheDocument();
  });
});
