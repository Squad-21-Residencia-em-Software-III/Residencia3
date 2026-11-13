import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const sessao = vi.hoisted(() => ({ perfil: 'GESTOR_FROTA' }));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    usuario: { id: 1, nome: 'Gestor', perfil: sessao.perfil },
    temPerfil: (...perfis: string[]) => perfis.includes(sessao.perfil),
  }),
}));

describe('VeiculosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessao.perfil = 'GESTOR_FROTA';
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

  it('Solicitante vê só modelo, capacidade e frota, sem placa, km nem ações', async () => {
    sessao.perfil = 'SOLICITANTE';
    // A API devolve a lista reduzida para o Solicitante
    vi.mocked(veiculosApi.listar).mockResolvedValue([
      { id: 3, modelo: 'Fiat Doblò', capacidade_maxima: 7, tipo_frota: 'ADMINISTRATIVA' } as never,
    ]);

    render(
      <MemoryRouter>
        <VeiculosPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Fiat Doblò')).toBeInTheDocument();
    expect(screen.getByText('Veículos disponíveis')).toBeInTheDocument();
    expect(screen.getByText('7 lugares')).toBeInTheDocument();
    expect(screen.getByText('Administrativa')).toBeInTheDocument();
    expect(screen.queryByText(/Total na Frota/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Placa/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Km/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Novo Veículo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('Gestor SVO só edita veículos da frota SVO e cadastra só na frota SVO', async () => {
    sessao.perfil = 'GESTOR_SVO';
    vi.mocked(veiculosApi.listar).mockResolvedValue([
      { id: 1, placa: 'BRA2E19', modelo: 'Van Administrativa', tipo_frota: 'ADMINISTRATIVA', status: 'DISPONIVEL', capacidade_maxima: 5, km_atual: 1000 },
      { id: 2, placa: 'SVO1A23', modelo: 'Rabecão', tipo_frota: 'SVO', status: 'DISPONIVEL', capacidade_maxima: 4, km_atual: 2000 },
    ]);

    render(
      <MemoryRouter>
        <VeiculosPage />
      </MemoryRouter>
    );

    const linhaAdm = (await screen.findByText('Van Administrativa')).closest('tr')!;
    const linhaSvo = screen.getByText('Rabecão').closest('tr')!;
    expect(within(linhaAdm).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(within(linhaSvo).getByRole('button', { name: 'Editar' })).toBeInTheDocument();

    // No cadastro, a frota fica fixa em SVO
    await userEvent.click(screen.getByRole('button', { name: /Novo Veículo/i }));
    const frota = await screen.findByLabelText(/Tipo de Frota/i);
    expect(frota).toHaveValue('SVO');
    expect(frota).toBeDisabled();
  });
});
