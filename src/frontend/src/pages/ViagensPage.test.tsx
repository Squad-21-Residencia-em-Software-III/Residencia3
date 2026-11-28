import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECURSOS_BACKEND } from '../config/recursosBackend';
import { solicitacoesApi } from '../services/api/solicitacoesApi';
import { motoristasApi } from '../services/api/motoristasApi';
import { veiculosApi } from '../services/api/veiculosApi';
import { ApiError } from '../services/api/http';
import { viagensApi } from '../services/api/viagensApi';
import { evidenciasOdometroApi } from '../services/api/evidenciasOdometroApi';
import type { SolicitacaoViagem } from '../types/solicitacao';
import type { Viagem } from '../types/viagem';
import ViagensPage from './ViagensPage';

vi.mock('../services/api/viagensApi', () => ({
  viagensApi: {
    listar: vi.fn(),
    listarMinhasAdministrativas: vi.fn(),
    listarOrdensPendentesSvo: vi.fn(),
    listarAlertasSvo: vi.fn(),
    agendarColetaSvo: vi.fn(),
    reprogramarColetaSvo: vi.fn(),
    criar: vi.fn(),
    iniciar: vi.fn(),
    finalizar: vi.fn(),
    registrarChegadaLocalSvo: vi.fn(),
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
    RECURSOS_BACKEND.agendamentoTemporalSvo = true;
    sessao.perfil = 'ADMINISTRADOR';
    api.listarAlertasSvo.mockResolvedValue([]);
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
    RECURSOS_BACKEND.agendamentoTemporalSvo = false;
  });

  it('desativa operações de coleta e consulta de alertas quando a flag está desligada', async () => {
    RECURSOS_BACKEND.agendamentoTemporalSvo = false;
    abrir('/viagens?aba=svo');
    expect(await screen.findByText(/operações de coleta SVO estão desabilitadas/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Agendar coleta/ })).toBeDisabled();
    expect(api.listarAlertasSvo).not.toHaveBeenCalled();
  });

  it.each(['AGENDADA', 'EM_ANDAMENTO'] as const)('não oferece ações no drawer SVO %s com agenda desativada', async (status) => {
    RECURSOS_BACKEND.agendamentoTemporalSvo = false;
    api.listar.mockResolvedValue([{ ...viagem(7, 'SVO', 'Rua das Flores'), status }]);
    abrir('/viagens?aba=svo');
    await userEvent.click(await screen.findByText('Rua das Flores'));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).queryByRole('button', { name: /Iniciar viagem|Finalizar viagem|Cancelar viagem/ })).not.toBeInTheDocument();
  });

  it('restaura a busca e o status da própria operação ao voltar à aba', async () => {
    const user = userEvent.setup();
    const busca = () => screen.getByPlaceholderText('Buscar por trajeto, condutor ou placa...');
    const status = () => screen.getByLabelText('Filtrar por status');
    abrir();
    await screen.findByText('Hospital de Lagarto');
    await user.type(busca(), 'Lagarto');
    await user.selectOptions(status(), 'AGENDADA');

    await user.click(screen.getByRole('tab', { name: 'SVO' }));
    expect(busca()).toHaveValue('');
    expect(status()).toHaveValue('TODOS');
    await user.type(busca(), 'Flores');
    await user.selectOptions(status(), 'NO_LOCAL');

    await user.click(screen.getByRole('tab', { name: 'Administrativo' }));
    expect(busca()).toHaveValue('Lagarto');
    expect(status()).toHaveValue('AGENDADA');
    await user.click(screen.getByRole('tab', { name: 'SVO' }));
    expect(busca()).toHaveValue('Flores');
    expect(status()).toHaveValue('NO_LOCAL');
  });
  it('busca o destino de coletas ainda sem motorista e sem veículo', async () => {
    const dto = {
      ...viagem(8, 'SVO', 'Rua dos Ipês'), status: 'AGUARDANDO_ALOCACAO',
      motorista_id: null, motorista_nome: null, veiculo_id: null, veiculo_placa: null,
    };
    api.listar.mockResolvedValue([dto as unknown as Viagem]);
    abrir('/viagens?aba=svo');
    await screen.findByText('Rua dos Ipês');
    await userEvent.type(screen.getByPlaceholderText('Buscar por trajeto, condutor ou placa...'), 'Ipês');
    expect(screen.getByText('Rua dos Ipês')).toBeInTheDocument();
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

  it('atualiza a lista após o prazo vencer e permite escolher outra solicitação', async () => {
    const aprovada: SolicitacaoViagem = {
      id: 21, solicitante_id: 3, solicitante_nome: 'Maria', origem: 'Sede', destino: 'Centro',
      finalidade: 'Atendimento', data_saida_desejada: '2099-01-01T12:00:00Z', status: 'APROVADA',
    };
    vi.mocked(solicitacoesApi.listarAprovadas).mockResolvedValueOnce([aprovada, { ...aprovada, id: 22 }])
      .mockResolvedValueOnce([aprovada, { ...aprovada, id: 22 }]);
    vi.mocked(veiculosApi.listar).mockResolvedValueOnce([{
      id: 1, modelo: 'Spin', placa: 'ABC1D23', tipo_frota: 'ADMINISTRATIVA',
      capacidade_maxima: 4, km_atual: 100, status: 'DISPONIVEL',
    }]);
    vi.mocked(motoristasApi.listar).mockResolvedValueOnce([{
      id: 1, nome: 'Marcos', usuario_id: 10, cnh_final: '1234', categoria_cnh: 'B',
      validade_cnh: '2099-12-31', tipo_motorista: 'FROTA', status: 'DISPONIVEL',
    }]);
    api.criar.mockRejectedValueOnce(new ApiError('A solicitação expirou.', 409, [], 'SOLICITACAO_EXPIRADA'));
    abrir();

    await userEvent.click(await screen.findByRole('button', { name: 'Agendar Viagem' }));
    const modal = within(await screen.findByRole('dialog', { name: 'Agendar Viagem' }));
    const seletor = modal.getByLabelText('Solicitação Vinculada *');
    const agendar = modal.getByRole('button', { name: 'Agendar Viagem' });
    expect(seletor).toHaveValue('21');
    await userEvent.click(agendar);

    expect(await modal.findByText('A solicitação expirou.')).toBeInTheDocument();
    expect(solicitacoesApi.listarAprovadas).toHaveBeenCalledTimes(2);
    expect(modal.queryByRole('option', { name: /#21/ })).not.toBeInTheDocument();
    expect(seletor).toHaveValue('');
    expect(agendar).toBeDisabled();
    await userEvent.selectOptions(seletor, '22');
    expect(agendar).toBeEnabled();
  });

  it('Gestor de Frota só vê o Administrativo, sem seletor e sem ordens SVO', async () => {
    sessao.perfil = 'GESTOR_FROTA';
    abrir('/viagens?aba=svo');

    expect(await screen.findByText('Hospital de Lagarto')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(api.listarOrdensPendentesSvo).not.toHaveBeenCalled();
  });

  it('apresenta alertas de atraso e oferece reprogramação ao gestor SVO', async () => {
    sessao.perfil = 'GESTOR_SVO';
    api.listar.mockResolvedValue([viagem(7, 'SVO', 'Rua das Flores, 10')]);
    api.listarAlertasSvo.mockResolvedValue([{ id: 1, ordem_em_atraso_id: 6, ordem_afetada_id: 7,
      inicio_previsto_afetada: '2099-01-01T16:20:00Z' }]);
    abrir();
    expect(await screen.findByText(/coleta #6 está atrasada e afeta a coleta #7/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reagendar coleta' })).toBeInTheDocument();
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

describe('ViagensPage: status e ações da coleta SVO por perfil (SCRUM-110)', () => {
  const coleta = (status: Viagem['status']): Viagem => ({
    ...viagem(7, 'SVO', 'Rua das Flores, 10'),
    status,
    solicitacao_id: 31,
  });
  const linhaDaColeta = () => screen.getByText('Rua das Flores, 10').closest('tr')!;

  beforeEach(() => {
    vi.clearAllMocks();
    api.listar.mockReset();
    api.registrarChegadaLocalSvo.mockReset();
    RECURSOS_BACKEND.agendamentoTemporalSvo = true;
    sessao.perfil = 'ADMINISTRADOR';
    api.listarAlertasSvo.mockResolvedValue([]);
    api.listarOrdensPendentesSvo.mockResolvedValue([]);
    vi.mocked(veiculosApi.listar).mockResolvedValue([]);
    vi.mocked(veiculosApi.listarOcupacaoSvo).mockResolvedValue([]);
    vi.mocked(motoristasApi.listar).mockResolvedValue([]);
  });

  afterEach(() => {
    RECURSOS_BACKEND.agendamentoTemporalSvo = false;
  });

  it.each([
    ['EM_ANDAMENTO', 'A caminho'],
    ['NO_LOCAL', 'No local'],
    ['CONCLUIDA', 'Concluída'],
  ] as const)('apresenta a coleta SVO %s como "%s"', async (status, rotulo) => {
    api.listar.mockResolvedValue([coleta(status)]);
    abrir('/viagens?aba=svo');

    expect(await screen.findByText('Rua das Flores, 10')).toBeInTheDocument();
    expect(within(linhaDaColeta()).getByText(rotulo)).toBeInTheDocument();
  });

  it('Motorista SVO inicia a coleta agendada e finaliza a coleta a caminho ou no local', async () => {
    sessao.perfil = 'MOTORISTA_SVO';

    api.listar.mockResolvedValue([coleta('AGENDADA')]);
    const agendada = render(
      <MemoryRouter>
        <ViagensPage />
      </MemoryRouter>,
    );
    await screen.findByText('Rua das Flores, 10');
    expect(within(linhaDaColeta()).getByRole('button', { name: /Iniciar/ })).toBeInTheDocument();
    agendada.unmount();

    for (const status of ['EM_ANDAMENTO', 'NO_LOCAL'] as const) {
      api.listar.mockResolvedValue([coleta(status)]);
      const tela = render(
        <MemoryRouter>
          <ViagensPage />
        </MemoryRouter>,
      );
      await screen.findByText('Rua das Flores, 10');
      expect(within(linhaDaColeta()).getByRole('button', { name: /Finalizar/ }), status).toBeInTheDocument();
      tela.unmount();
    }
  });

  it('Motorista SVO não vê ações na coleta concluída', async () => {
    sessao.perfil = 'MOTORISTA_SVO';
    api.listar.mockResolvedValue([coleta('CONCLUIDA')]);
    abrir();

    await screen.findByText('Rua das Flores, 10');
    expect(within(linhaDaColeta()).queryByRole('button', { name: /Iniciar|Finalizar|Cancelar/ })).not.toBeInTheDocument();
  });

  it.each(['GESTOR_SVO', 'ADMINISTRADOR'] as const)(
    '%s acompanha a coleta no local sem Iniciar nem Finalizar',
    async (perfil) => {
      sessao.perfil = perfil;
      api.listar.mockResolvedValue([coleta('NO_LOCAL')]);
      abrir('/viagens?aba=svo');

      await screen.findByText('Rua das Flores, 10');
      expect(within(linhaDaColeta()).getByText('No local')).toBeInTheDocument();
      expect(within(linhaDaColeta()).queryByRole('button', { name: /Iniciar|Finalizar/ })).not.toBeInTheDocument();

      await userEvent.click(screen.getByText('Rua das Flores, 10'));
      const drawer = await screen.findByRole('dialog');
      expect(within(drawer).queryByRole('button', { name: /Iniciar viagem|Finalizar viagem/ })).not.toBeInTheDocument();
    },
  );

  it.each(['GESTOR_SVO', 'ADMINISTRADOR'] as const)(
    '%s não inicia coleta SVO agendada',
    async (perfil) => {
      sessao.perfil = perfil;
      api.listar.mockResolvedValue([coleta('AGENDADA')]);
      abrir('/viagens?aba=svo');

      await screen.findByText('Rua das Flores, 10');
      expect(within(linhaDaColeta()).queryByRole('button', { name: /Iniciar/ })).not.toBeInTheDocument();
    },
  );

  it('viagem administrativa mantém Finalizar para quem executa a frota administrativa', async () => {
    api.listar.mockResolvedValue([
      { ...viagem(3, 'ADMINISTRATIVA', 'Hospital de Lagarto'), status: 'EM_ANDAMENTO' },
    ]);
    abrir();

    const linha = (await screen.findByText('Hospital de Lagarto')).closest('tr')!;
    expect(within(linha).getByRole('button', { name: /Finalizar/ })).toBeInTheDocument();
    expect(within(linha).queryByText('A caminho')).not.toBeInTheDocument();
  });

  it.each(['GESTOR_SVO', 'ADMINISTRADOR', 'GESTOR_FROTA', 'MOTORISTA_FROTA', 'SOLICITANTE', 'INTEGRANTE_SVO'])(
    '%s não registra a chegada na lista ou nos detalhes',
    async (perfil) => {
      sessao.perfil = perfil;
      api.listar.mockResolvedValue([coleta('EM_ANDAMENTO')]);
      abrir('/viagens?aba=svo');
      if (['GESTOR_SVO', 'ADMINISTRADOR'].includes(perfil)) {
        await screen.findByText('Rua das Flores, 10');
        await userEvent.click(within(linhaDaColeta()).getByRole('button', { name: 'Ver detalhes da viagem' }));
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
      }
      expect(screen.queryByRole('button', { name: 'Cheguei ao local' })).not.toBeInTheDocument();
      expect(api.registrarChegadaLocalSvo).not.toHaveBeenCalled();
    },
  );

  it.each(['AGENDADA', 'NO_LOCAL', 'CONCLUIDA', 'CANCELADA'] as const)(
    'Motorista SVO não registra chegada com status %s',
    async (status) => {
      sessao.perfil = 'MOTORISTA_SVO';
      api.listar.mockResolvedValue([coleta(status)]);
      abrir();
      await screen.findByText('Rua das Flores, 10');
      await userEvent.click(within(linhaDaColeta()).getByRole('button', { name: 'Ver detalhes da viagem' }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cheguei ao local' })).not.toBeInTheDocument();
    },
  );

  it('sincroniza lista e drawer após confirmar o PATCH, sem depender de recarregar a lista', async () => {
    sessao.perfil = 'MOTORISTA_SVO';
    api.listar.mockResolvedValueOnce([coleta('EM_ANDAMENTO')]).mockRejectedValueOnce(new Error('GET indisponível'));
    let confirmar!: (viagemAtualizada: Viagem) => void;
    api.registrarChegadaLocalSvo.mockReturnValueOnce(new Promise((resolve) => { confirmar = resolve; }));
    abrir();

    await screen.findByText('Rua das Flores, 10');
    const linha = within(linhaDaColeta());
    const chegadaNaLista = linha.getByRole('button', { name: 'Cheguei ao local' });
    const detalhes = linha.getByRole('button', { name: 'Ver detalhes da viagem' });
    detalhes.focus();
    await userEvent.keyboard('{Enter}');
    const drawer = within(await screen.findByRole('dialog'));
    const chegadaNoDrawer = drawer.getByRole('button', { name: 'Cheguei ao local' });

    act(() => {
      fireEvent.click(chegadaNoDrawer);
      fireEvent.click(chegadaNaLista);
    });

    expect(api.registrarChegadaLocalSvo).toHaveBeenCalledExactlyOnceWith(7);
    expect(drawer.getByText('A caminho')).toBeInTheDocument();
    expect(linha.getByText('A caminho')).toBeInTheDocument();
    expect(drawer.getByRole('button', { name: 'Registrando chegada…' })).toBeDisabled();
    expect(detalhes.closest('[inert]')).not.toBeNull();
    expect(linha.getByText('Registrando chegada…', { selector: 'button' })).toBeDisabled();

    await act(async () => confirmar(coleta('NO_LOCAL')));
    expect(drawer.getByText('No local')).toBeInTheDocument();
    expect(drawer.getByText('Chegada ao local registrada.')).toBeInTheDocument();
    expect(drawer.queryByRole('button', { name: 'Cheguei ao local' })).not.toBeInTheDocument();
    expect(drawer.getByRole('button', { name: 'Finalizar viagem' })).toBeEnabled();
    expect(linha.getByText('No local')).toBeInTheDocument();
    expect(linha.queryByRole('button', { name: 'Finalizar' })).not.toBeInTheDocument();
    expect(api.listar).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(linha.getByRole('button', { name: 'Finalizar' })).toBeEnabled();
    await userEvent.click(detalhes);
    expect(within(await screen.findByRole('dialog')).getByText('No local')).toBeInTheDocument();
  });

  it.each([
    new ApiError('Sua sessão expirou.', 401),
    new ApiError('Acesso negado.', 403),
    new ApiError('Não foi possível conectar ao servidor.', 0),
    new ApiError('O servidor demorou a responder. Tente novamente.', 0),
  ])('exibe a falha %s com o status original e libera o botão', async (error) => {
    sessao.perfil = 'MOTORISTA_SVO';
    api.listar.mockResolvedValue([coleta('EM_ANDAMENTO')]);
    api.registrarChegadaLocalSvo.mockRejectedValueOnce(error);
    abrir();

    await userEvent.click(await screen.findByRole('button', { name: 'Cheguei ao local' }));
    expect(await screen.findByText(error.message)).toBeInTheDocument();
    expect(within(linhaDaColeta()).getByText('A caminho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cheguei ao local' })).toBeEnabled();
  });

  it('revalida a coleta com o servidor após receber 409', async () => {
    sessao.perfil = 'MOTORISTA_SVO';
    api.listar.mockResolvedValueOnce([coleta('EM_ANDAMENTO')]).mockResolvedValueOnce([coleta('NO_LOCAL')]);
    api.registrarChegadaLocalSvo.mockRejectedValueOnce(new ApiError('A coleta mudou de status.', 409));
    abrir();

    await userEvent.click(await screen.findByRole('button', { name: 'Cheguei ao local' }));
    expect(await screen.findByText('A coleta mudou de status.')).toBeInTheDocument();
    expect(within(linhaDaColeta()).getByText('No local')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cheguei ao local' })).not.toBeInTheDocument();
    expect(api.listar).toHaveBeenCalledTimes(2);
  });

  it('preserva o status e apresenta a falha de atualização após um conflito', async () => {
    sessao.perfil = 'MOTORISTA_SVO';
    api.listar.mockResolvedValueOnce([coleta('EM_ANDAMENTO')]).mockRejectedValueOnce(new Error('Sem conexão'));
    api.registrarChegadaLocalSvo.mockRejectedValueOnce(new ApiError('A coleta mudou de status.', 409));
    abrir();

    await userEvent.click(await screen.findByRole('button', { name: 'Cheguei ao local' }));
    expect(await screen.findByText(/Não foi possível atualizar o status/)).toBeInTheDocument();
    expect(within(linhaDaColeta()).getByText('A caminho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cheguei ao local' })).toBeEnabled();
  });

  it('remove a ordem da lista quando o PATCH retorna 404 e a consulta confirma a ausência', async () => {
    sessao.perfil = 'MOTORISTA_SVO';
    api.listar.mockResolvedValueOnce([coleta('EM_ANDAMENTO')]).mockResolvedValueOnce([]);
    api.registrarChegadaLocalSvo.mockRejectedValueOnce(new ApiError('Coleta inexistente.', 404));
    abrir();

    await userEvent.click(await screen.findByRole('button', { name: 'Cheguei ao local' }));
    expect(await screen.findByText('Coleta inexistente.')).toBeInTheDocument();
    expect(screen.queryByText('Rua das Flores, 10')).not.toBeInTheDocument();
  });

  it('exibe uma mensagem segura quando a API falha internamente', async () => {
    sessao.perfil = 'MOTORISTA_SVO';
    api.listar.mockResolvedValue([coleta('EM_ANDAMENTO')]);
    api.registrarChegadaLocalSvo.mockRejectedValueOnce(new ApiError('Detalhes internos do servidor', 500));
    abrir();

    await userEvent.click(await screen.findByRole('button', { name: 'Cheguei ao local' }));
    expect(await screen.findByText(/O servidor não conseguiu confirmar a chegada/)).toBeInTheDocument();
    expect(screen.queryByText('Detalhes internos do servidor')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cheguei ao local' })).toBeEnabled();
  });

  const opcoesDoFiltroDeStatus = () =>
    Array.from(
      (screen.getByLabelText('Filtrar por status') as HTMLSelectElement).querySelectorAll('option'),
    ).map((opcao) => opcao.textContent);

  it('filtro de status da aba SVO oferece "A caminho" e "No local"', async () => {
    api.listar.mockResolvedValue([coleta('NO_LOCAL')]);
    abrir('/viagens?aba=svo');

    await screen.findByText('Rua das Flores, 10');
    expect(opcoesDoFiltroDeStatus()).toEqual(
      expect.arrayContaining(['A caminho', 'No local']),
    );
  });

  it('filtro de status da aba Administrativo não oferece "No local" nem "A caminho"', async () => {
    api.listar.mockResolvedValue([
      { ...viagem(3, 'ADMINISTRATIVA', 'Hospital de Lagarto'), status: 'EM_ANDAMENTO' },
    ]);
    abrir();

    await screen.findByText('Hospital de Lagarto');
    const opcoes = opcoesDoFiltroDeStatus();
    expect(opcoes).toContain('Em Andamento');
    expect(opcoes).not.toContain('No local');
    expect(opcoes).not.toContain('A caminho');
  });
});

vi.mock('../services/api/evidenciasOdometroApi', () => ({
  evidenciasOdometroApi: { enviar: vi.fn(), consultar: vi.fn(), arquivo: vi.fn(), configuracao: vi.fn() },
}));

describe('ViagensPage: fotos do odômetro no detalhe (SCRUM-207)', () => {
  const concluida = { ...viagem(7, 'ADMINISTRATIVA', 'Hospital de Lagarto'), status: 'CONCLUIDA' as const, km_inicial: 100, km_final: 150 };

  beforeEach(() => {
    vi.clearAllMocks();
    sessao.perfil = 'GESTOR_FROTA';
    api.listar.mockResolvedValue([concluida]);
    api.listarAlertasSvo.mockResolvedValue([]);
    vi.mocked(evidenciasOdometroApi.configuracao).mockResolvedValue({ fotos_disponiveis: true, excecoes_disponiveis: false });
    vi.mocked(evidenciasOdometroApi.consultar).mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    RECURSOS_BACKEND.fotosOdometro = false;
    sessao.perfil = 'ADMINISTRADOR';
  });

  it('desligado, o detalhe não oferece as fotos', async () => {
    abrir();
    fireEvent.click(await screen.findByTitle('Ver detalhes da viagem'));
    expect(await screen.findByText('Viagem #7')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fotos do odômetro/ })).not.toBeInTheDocument();
  });

  it('Gestor de Frota abre as fotos da viagem administrativa', async () => {
    RECURSOS_BACKEND.fotosOdometro = true;
    abrir();
    fireEvent.click(await screen.findByTitle('Ver detalhes da viagem'));
    fireEvent.click(await screen.findByRole('button', { name: /Fotos do odômetro/ }));
    expect(await screen.findByText(/Fotos do odômetro · Viagem administrativa #7/)).toBeInTheDocument();
    expect(evidenciasOdometroApi.consultar).toHaveBeenCalledWith(expect.objectContaining({ id: 7, tipo_operacao: 'ADMINISTRATIVA' }));
  });
});
