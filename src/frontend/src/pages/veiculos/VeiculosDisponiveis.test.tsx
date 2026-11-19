import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { veiculosApi } from '../../services/api/veiculosApi';
import type { Veiculo } from '../../types/veiculo';
import { VeiculosDisponiveis } from './VeiculosDisponiveis';

vi.mock('../../services/api/veiculosApi', () => ({ veiculosApi: { listar: vi.fn() } }));

const base: Veiculo = {
  id: 1,
  placa: 'ABC1D23',
  modelo: 'Fiat Doblò',
  tipo_frota: 'ADMINISTRATIVA',
  capacidade_maxima: 7,
  km_atual: 1000,
  status: 'DISPONIVEL',
};

describe('VeiculosDisponiveis: capacidade conforme a frota', () => {
  it('frota administrativa em lugares; SVO em corpos transportados, nunca em lugares', async () => {
    vi.mocked(veiculosApi.listar).mockResolvedValue([
      base,
      { ...base, id: 2, modelo: 'Fiat Ducato', tipo_frota: 'SVO', capacidade_maxima: 4 },
      { ...base, id: 3, modelo: 'Renault Master', tipo_frota: 'SVO', capacidade_maxima: 1 },
    ]);

    render(<VeiculosDisponiveis />);

    expect(await screen.findByText('7 lugares')).toBeInTheDocument();
    expect(screen.getByText('Transporte de até 4 corpos')).toBeInTheDocument();
    expect(screen.getByText('Transporte de até 1 corpo')).toBeInTheDocument();
    expect(screen.queryByText('4 lugares')).not.toBeInTheDocument();
    // Sem dados sensíveis
    expect(screen.queryByText('ABC1D23')).not.toBeInTheDocument();
  });
});
