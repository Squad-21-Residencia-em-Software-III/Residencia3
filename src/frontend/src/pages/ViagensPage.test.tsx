import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECURSOS_BACKEND } from '../config/recursosBackend';
import { motoristasApi } from '../services/api/motoristasApi';
import { veiculosApi } from '../services/api/veiculosApi';
import { viagensApi } from '../services/api/viagensApi';
import type { Viagem } from '../types/viagem';
import ViagensPage from './ViagensPage';

vi.mock('../services/api/viagensApi', () => ({
  viagensApi: {
    listar: vi.fn(),
    listarMinhasAdministrativas: vi.fn(),
    listarOrdensPendentesSvo: vi.fn(),
    agendarColetaSvo: vi.fn(),
    criar: vi.fn(),
    iniciar: vi.fn(),
    finalizar: vi.fn(),
    cancelar: vi.fn(),
  },
}));
vi.mock('../services/api/veiculosApi', () => ({
  veiculosApi: { listar: vi.fn(), listarOcupacaoSvo: vi.fn() },
}));
vi.mock('../services/api/motoristasApi', () => ({ motoristasApi: { listar: vi.fn() } }));
vi.mock('../services/api/solicitacoesApi', () => ({
  solicitacoesApi: { listarAprovadas: vi.fn().mockResolvedValue([]) },
}));

const sessao = vi.hoisted(() => ({ perfil: 'ADMINISTRADOR' }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    usuario: { id: 1, nome: 'Usuário', perfil: sessao.perfil },
    temPerfil: (...perfis: string[]) => perfis.includes(sessao.perfil),
  }),
}));

const viagem = (id: number, tipo: Viagem['tipo_operacao'], destino: string): Viagem => ({
  id,
  solicitacao_id: id,
  tipo_operacao: tipo,
  origem: tipo === 'SVO' ? null : 'Sede FSPH',
  destino,
  finalidade: null,
  solicitante_nome: null,
  veiculo_id: 1,
  veiculo_modelo: 'Fiat Ducato',
  veiculo_placa: 'ABC1D23',
  motorista_id: 1,
  motorista_nome: 'João Motorista',
  km_inicial: null,
  status: 'AGENDADA',
});

const api = vi.mocked(viagensApi);

function abrir(url = '/viagens') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <ViagensPage />
    </MemoryRouter>,
  );
}

describe('ViagensPage: abas Administrativo/SVO (SCRUM-171)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessao.perfil = 'ADMINISTRADOR';
    // Viagem administrativa e ordem SVO com o mesmo id: cada uma só na sua aba
    api.listar.mockResolvedValue([
      viagem(7, 'ADMINISTRATIVA', 'Hospital de Lagarto'),
      viagem(7, 'SVO', 'Rua das Flores, 10'),
    ]);
    api.listarOrdensPendentesSvo.mockResolvedValue([
      {
        ordem_id: null,
        solicitacao_id: 31,
        local_ocorrencia: 'Av. Beira Mar, 500',
        material_sensivel: true,
        confirmado_em: '2026-11-16T10:00:00.000Z',
      },
    ]);
    vi.mocked(veiculosApi.listar).mockResolvedValue([]);
    vi.mocked(veiculosApi.listarOcupacaoSvo).mockResolvedValue([]);
    vi.mocked(motoristasApi.listar).mockResolvedValue([]);
  });

  afterEach(() => {
    RECURSOS_BACKEND.minhasViagensAdministrativas = false;
  });

  it('Administrador alterna entre as abas sem misturar registros de mesmo id', async () => {
    abrir();

    expect(await screen.findByText('Hospital de Lagarto')).toBeInTheDocument();
    expect(screen.queryByText('Rua das Flores, 10')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agendar Viagem/ })).toBeInTheDocument();
    // Ordens pendentes só na aba SVO
    expect(screen.queryByText('Aguardando agendamento')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /SVO/ }));

    expect(await screen.findByText('Rua das Flores, 10')).toBeInTheDocument();
    expect(screen.queryByText('Hospital de Lagarto')).not.toBeInTheDocument();
    // Em SVO não existe "Nova Viagem" genérico; o caminho é Agendar coleta
    expect(screen.queryByRole('button', { name: /Agendar Viagem/ })).not.toBeInTheDocument();
    expect(await screen.findByText('Av. Beira Mar, 500')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agendar coleta/ })).toBeInTheDocument();
  });

  it('Gestor de Frota só vê o Administrativo, sem seletor e sem ordens SVO', async () => {
    sessao.perfil = 'GESTOR_FROTA';
    abrir('/viagens?aba=svo');

    expect(await screen.findByText('Hospital de Lagarto')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(api.listarOrdensPendentesSvo).not.toHaveBeenCalled();
  });

  it('Gestor SVO vê as coletas e as ordens pendentes, sem agendar viagem administrativa', async () => {
    sessao.perfil = 'GESTOR_SVO';
    api.listar.mockResolvedValue([viagem(7, 'SVO', 'Rua das Flores, 10')]);
    abrir();

    expect(await screen.findByText('Rua das Flores, 10')).toBeInTheDocument();
    expect(await screen.findByText('Av. Beira Mar, 500')).toBeInTheDocument();
    // Sem a consulta própria do backend (SCRUM-179) não há aba Administrativo
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(api.listarMinhasAdministrativas).not.toHaveBeenCalled();
  });

  it('Gestor SVO acompanha só as próprias viagens administrativas, sem ações', async () => {
    RECURSOS_BACKEND.minhasViagensAdministrativas = true;
    sessao.perfil = 'GESTOR_SVO';
    api.listarMinhasAdministrativas.mockResolvedValue([
      viagem(3, 'ADMINISTRATIVA', 'Secretaria de Saúde'),
    ]);
    abrir('/viagens?aba=administrativo');

    expect(await screen.findByText('Secretaria de Saúde')).toBeInTheDocument();
    expect(api.listarMinhasAdministrativas).toHaveBeenCalled();
    expect(screen.getByText(/só as viagens administrativas das solicitações feitas por você/)).toBeInTheDocument();
    const linha = screen.getByText('Secretaria de Saúde').closest('tr')!;
    expect(within(linha).queryByRole('button', { name: /Iniciar|Cancelar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Agendar Viagem/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Motorista|Veículo|Odômetro/ })).not.toBeInTheDocument();
  });

  it('Motorista SVO vê as próprias coletas, sem ordens pendentes', async () => {
    sessao.perfil = 'MOTORISTA_SVO';
    api.listar.mockResolvedValue([viagem(7, 'SVO', 'Rua das Flores, 10')]);
    abrir();

    expect(await screen.findByText('Rua das Flores, 10')).toBeInTheDocument();
    expect(screen.queryByText('Aguardando agendamento')).not.toBeInTheDocument();
    expect(api.listarOrdensPendentesSvo).not.toHaveBeenCalled();
  });

  it('o atalho de Solicitações SVO abre o agendamento da ordem', async () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/viagens', search: '?aba=svo', state: { agendarSolicitacaoSvoId: 31 } }]}
      >
        <ViagensPage />
      </MemoryRouter>,
    );

    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText('Agendar coleta SVO')).toBeInTheDocument();
    expect(within(modal).getByText('Solicitação SVO #31')).toBeInTheDocument();
    await waitFor(() => expect(veiculosApi.listar).toHaveBeenCalled());
  });
});
