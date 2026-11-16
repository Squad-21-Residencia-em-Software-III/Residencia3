import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgendaPage from './AgendaPage';
import { useAuth } from '../contexts/AuthContext';
import { veiculosApi } from '../services/api/veiculosApi';
import { viagensApi } from '../services/api/viagensApi';
import { PERFIS } from '../types/usuario';
import type { Veiculo } from '../types/veiculo';
import type { Viagem } from '../types/viagem';
import { formatarDataIso } from '../utils/agenda';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../services/api/viagensApi', () => ({
  viagensApi: {
    listar: vi.fn(),
  },
}));

vi.mock('../services/api/veiculosApi', () => ({
  veiculosApi: {
    listar: vi.fn(),
  },
}));

const hojeIso = formatarDataIso(new Date());

const mockVeiculos: Veiculo[] = [
  {
    id: 1,
    placa: 'QRM-1020',
    modelo: 'Renault Master',
    tipo_frota: 'ADMINISTRATIVA',
    capacidade_maxima: 15,
    km_atual: 10000,
    status: 'EM_USO',
  },
  {
    id: 2,
    placa: 'QRM-2030',
    modelo: 'Fiat Ducato',
    tipo_frota: 'SVO',
    capacidade_maxima: 2,
    km_atual: 25000,
    status: 'DISPONIVEL',
  },
];

const mockViagens: Viagem[] = [
  {
    id: 12,
    solicitacao_id: 40,
    tipo_operacao: 'ADMINISTRATIVA',
    origem: 'FSPH Sede - Aracaju',
    destino: 'Hemose - Aracaju',
    finalidade: 'Entrega de insumos',
    solicitante_nome: 'Maria Gestora',
    inicio_previsto: `${hojeIso}T08:00:00`,
    fim_previsto: `${hojeIso}T10:30:00`,
    veiculo_id: 1,
    veiculo_modelo: 'Renault Master',
    veiculo_placa: 'QRM-1020',
    motorista_id: 3,
    motorista_nome: 'Carlos Motorista',
    km_inicial: 10000,
    km_final: null,
    data_hora_efetiva_saida: `${hojeIso}T08:05:00`,
    data_hora_efetiva_chegada: null,
    status: 'EM_ANDAMENTO',
  },
];

describe('AgendaPage: integração com API, estados e DrawerDetalhesViagem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      usuario: {
        id: 1,
        nome: 'Admin Teste',
        email: 'admin@fsph.se.gov.br',
        perfil: PERFIS.ADMINISTRADOR,
        tipo_usuario: 'ADMINISTRADOR',
        ativo: true,
      },
      carregando: false,
      login: vi.fn(),
      logout: vi.fn(),
      temPerfil: () => true,
    });
  });

  it('exibe toda a frota na lateral, projeta viagens e abre DrawerDetalhesViagem ao clicar', async () => {
    vi.mocked(viagensApi.listar).mockResolvedValueOnce(mockViagens);
    vi.mocked(veiculosApi.listar).mockResolvedValueOnce(mockVeiculos);

    render(<AgendaPage />);

    expect(screen.getByText('Carregando agenda operacional da frota...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Renault Master')).toBeInTheDocument();
    });

    // Veículo livre sem viagem também aparece na lateral
    expect(screen.getByText('Fiat Ducato')).toBeInTheDocument();
    expect(screen.getByText('Livre')).toBeInTheDocument();

    // Clica no bloco da viagem para abrir o DrawerDetalhesViagem
    const user = userEvent.setup();
    await user.click(screen.getByText('FSPH Sede → Hemose'));

    expect(screen.getByText('Viagem #12')).toBeInTheDocument();
    expect(screen.getByText('Entrega de insumos')).toBeInTheDocument();
  });

  it('exibe erro e permite tentar novamente quando a API falhar', async () => {
    vi.mocked(viagensApi.listar).mockRejectedValueOnce(new Error('Falha de rede'));
    vi.mocked(veiculosApi.listar).mockResolvedValueOnce([]);

    render(<AgendaPage />);

    await waitFor(() => {
      expect(screen.getByText('Falha de rede')).toBeInTheDocument();
    });

    vi.mocked(viagensApi.listar).mockResolvedValueOnce([]);
    vi.mocked(veiculosApi.listar).mockResolvedValueOnce([]);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => {
      expect(screen.getByText('Nenhum veículo ou viagem para exibir')).toBeInTheDocument();
    });
  });

  it('alterna entre Hoje, Semana e Mês e seleciona um dia no calendário mensal', async () => {
    vi.mocked(viagensApi.listar).mockResolvedValueOnce(mockViagens);
    vi.mocked(veiculosApi.listar).mockResolvedValueOnce(mockVeiculos);

    render(<AgendaPage />);

    await waitFor(() => {
      expect(screen.getByText('Renault Master')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Semana' }));
    expect(
      screen.getByText(/Passe o mouse sobre os blocos para ver o horário e rota/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mês' }));
    expect(screen.getByText('1 viagem')).toBeInTheDocument();

    // Clicar no dia com viagem volta para a grade do dia
    await user.click(screen.getByText('1 viagem'));
    expect(screen.getByText(/Grade 24h \(SVO contínuo/i)).toBeInTheDocument();
  });

  it('exibe apenas veículos SVO na lateral quando o usuário logado for GESTOR_SVO', async () => {
    vi.mocked(useAuth).mockReturnValue({
      usuario: {
        id: 2,
        nome: 'Gestor SVO',
        email: 'svo@fsph.se.gov.br',
        perfil: PERFIS.GESTOR_SVO,
        tipo_usuario: 'GESTOR_SVO',
        ativo: true,
      },
      carregando: false,
      login: vi.fn(),
      logout: vi.fn(),
      temPerfil: () => true,
    });
    vi.mocked(viagensApi.listar).mockResolvedValueOnce([]);
    vi.mocked(veiculosApi.listar).mockResolvedValueOnce(mockVeiculos);

    render(<AgendaPage />);

    await waitFor(() => {
      expect(screen.getByText('Fiat Ducato')).toBeInTheDocument();
    });

    expect(screen.queryByText('Renault Master')).not.toBeInTheDocument();
  });
});
