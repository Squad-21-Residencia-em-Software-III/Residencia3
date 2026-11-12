import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AbastecimentoPage from './AbastecimentoPage';
import { veiculosApi } from '../services/api/veiculosApi';
import { motoristasApi } from '../services/api/motoristasApi';
import { abastecimentosApi } from '../services/api/abastecimentosApi';

vi.mock('../services/api/veiculosApi', () => ({
  veiculosApi: {
    listar: vi.fn(),
  },
}));

vi.mock('../services/api/motoristasApi', () => ({
  motoristasApi: {
    listar: vi.fn(),
    buscarMeuPerfil: vi.fn(),
  },
}));

vi.mock('../services/api/abastecimentosApi', () => ({
  abastecimentosApi: {
    listarTodos: vi.fn(),
    criar: vi.fn(),
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    usuario: { id: 1, nome: 'Gestor', perfil: 'GESTOR_FROTA' },
    temPerfil: () => true,
  }),
}));

describe('AbastecimentoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve calcular a média da frota considerando todos os veículos (mesmo com mais de 6)', async () => {
    // 7 veículos com 2 abastecimentos cada
    const veiculos = Array.from({ length: 7 }, (_, i) => ({
      id: i + 1,
      placa: `PLACA${i + 1}`,
      modelo: `Modelo ${i + 1}`,
      tipo_frota: 'ADMINISTRATIVA' as const,
      status: 'DISPONIVEL' as const,
      capacidade_maxima: 5,
      km_atual: 50000,
    }));

    // Cada veículo faz 100km com 10L = 10.0 km/L, exceto o último que faz 100km com 20L = 5.0 km/L
    // Média de todos 7 veículos: (6 * 10 + 5) / 7 = 65 / 7 = 9.3 km/L
    // Se considerasse apenas os 6 primeiros: 10.0 km/L.
    const abastecimentos: any[] = [];
    veiculos.forEach((v, i) => {
      abastecimentos.push({
        id: (i + 1) * 10,
        veiculo_id: v.id,
        motorista_id: 1,
        data_abastecimento: '2026-11-01',
        quilometragem: 1000,
        litros: 10,
        valor_total: 60,
        veiculo_placa: v.placa,
        veiculo_modelo: v.modelo,
        veiculo_tipo_frota: 'ADMINISTRATIVA',
      });
      abastecimentos.push({
        id: (i + 1) * 10 + 1,
        veiculo_id: v.id,
        motorista_id: 1,
        data_abastecimento: '2026-11-05',
        quilometragem: 1100, // +100km
        litros: i === 6 ? 20 : 10, // o 7º veículo gasta 20L
        valor_total: 60,
        veiculo_placa: v.placa,
        veiculo_modelo: v.modelo,
        veiculo_tipo_frota: 'ADMINISTRATIVA',
      });
    });

    vi.mocked(veiculosApi.listar).mockResolvedValue(veiculos);
    vi.mocked(motoristasApi.listar).mockResolvedValue([]);
    vi.mocked(abastecimentosApi.listarTodos).mockResolvedValue(abastecimentos);

    render(<AbastecimentoPage />);

    await waitFor(() => {
      // Deve conter 9,3 km/L comprovando que o 7º veículo foi incluído no cálculo geral!
      expect(screen.getByText(/9,3 km\/L/i)).toBeInTheDocument();
    });
  });

  it('deve apresentar estado de erro quando a API falhar', async () => {
    vi.mocked(veiculosApi.listar).mockRejectedValue(new Error('Serviço indisponível'));
    vi.mocked(motoristasApi.listar).mockResolvedValue([]);
    vi.mocked(abastecimentosApi.listarTodos).mockResolvedValue([]);

    render(<AbastecimentoPage />);

    await waitFor(() => {
      expect(screen.getByText(/Falha na comunicação com o servidor/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeInTheDocument();
    });
  });
});

