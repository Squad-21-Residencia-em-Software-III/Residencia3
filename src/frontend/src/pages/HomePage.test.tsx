import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from './HomePage';
import { dashboardApi } from '../services/api/dashboardApi';
import { solicitacoesApi } from '../services/api/solicitacoesApi';
import { useAuth } from '../contexts/AuthContext';
import { PERFIS } from '../types/usuario';
import type { Perfil, Usuario } from '../types/usuario';

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }));

function logarComo(perfil: Perfil) {
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, nome: 'Ana Paula Lima', email: 'ana@exemplo.com', perfil } as Usuario,
    carregando: false,
    login: vi.fn(),
    logout: vi.fn(),
    temPerfil: (...perfis: Perfil[]) => perfis.includes(perfil),
  });
}

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
    logarComo(PERFIS.GESTOR_FROTA);
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

  it('deve exibir "Fila limpa" quando a API retornar lista vazia de solicitações', async () => {
    vi.mocked(solicitacoesApi.listar).mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Fila limpa')).toBeInTheDocument();
      expect(screen.getByText('Nenhuma solicitação aguardando despacho no momento.')).toBeInTheDocument();
    });
  });

  it('deve exibir mensagem de erro e botão de tentar novamente quando a listagem de solicitações falhar, sem exibir "Fila limpa"', async () => {
    vi.mocked(solicitacoesApi.listar).mockRejectedValueOnce(new Error('Network error'));

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Falha na comunicação')).toBeInTheDocument();
      expect(screen.getByText('Não foi possível carregar a fila de solicitações pendentes.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeInTheDocument();
    });

    expect(screen.queryByText('Fila limpa')).not.toBeInTheDocument();
  });

  it('deve exibir alerta com opção de tentar novamente quando as métricas do dashboard falharem', async () => {
    vi.mocked(dashboardApi.consultar).mockRejectedValueOnce(new Error('Falha no servidor'));

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Não foi possível carregar os indicadores operacionais da frota.')
      ).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /Tentar novamente/i }).length).toBeGreaterThan(0);
    });
  });

  it('Solicitante não vê o painel gerencial nem consulta o dashboard', async () => {
    logarComo(PERFIS.SOLICITANTE);
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Olá, Ana')).toBeInTheDocument();
    expect(screen.queryByText('Central de Operações da Frota')).not.toBeInTheDocument();
    expect(screen.queryByText('Solicitações pendentes')).not.toBeInTheDocument();
    expect(screen.queryByText('Fila de Aprovação')).not.toBeInTheDocument();
    expect(dashboardApi.consultar).not.toHaveBeenCalled();
    expect(solicitacoesApi.listar).not.toHaveBeenCalled();
    // Só os atalhos do perfil
    expect(screen.getByText('Nova Solicitação')).toBeInTheDocument();
    expect(screen.queryByText('Registrar Abastecimento')).not.toBeInTheDocument();
    expect(screen.queryByText('Gestão de Veículos')).not.toBeInTheDocument();
  });

  it('Gestor SVO vê os indicadores, mas não a fila de aprovação da frota administrativa', async () => {
    logarComo(PERFIS.GESTOR_SVO);
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Central de Operações da Frota')).toBeInTheDocument();
    await waitFor(() => expect(dashboardApi.consultar).toHaveBeenCalled());
    expect(screen.queryByText('Fila de Aprovação')).not.toBeInTheDocument();
    expect(solicitacoesApi.listar).not.toHaveBeenCalled();
  });

  it('Motorista vê só os atalhos que pode usar', async () => {
    logarComo(PERFIS.MOTORISTA_FROTA);
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Registrar Abastecimento')).toBeInTheDocument();
    expect(screen.getByText('Gestão de Veículos')).toBeInTheDocument();
    expect(screen.queryByText('Nova Solicitação')).not.toBeInTheDocument();
    expect(screen.queryByText('Ver Agenda')).not.toBeInTheDocument();
    expect(dashboardApi.consultar).not.toHaveBeenCalled();
  });
});

