import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/api/http';
import { equipesSvoApi } from '../../services/api/equipesSvoApi';
import { solicitacoesSvoApi } from '../../services/api/solicitacoesSvoApi';
import { veiculosApi } from '../../services/api/veiculosApi';
import type { DisponibilidadeEquipesSvo } from '../../types/equipeSvo';
import type { Motorista } from '../../types/motorista';
import type { SolicitacaoSvo } from '../../types/solicitacaoSvo';
import type { Perfil } from '../../types/usuario';
import type { Veiculo } from '../../types/veiculo';
import { ModalNovaViagem } from './ModalNovaViagem';

const auth = vi.hoisted(() => ({ perfil: 'GESTOR_SVO' as string }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ usuario: { id: 4, perfil: auth.perfil } }),
}));
vi.mock('../../services/api/solicitacoesSvoApi', () => ({
  solicitacoesSvoApi: { listarTodas: vi.fn() },
}));
vi.mock('../../services/api/equipesSvoApi', () => ({
  equipesSvoApi: { listarDisponiveis: vi.fn() },
}));
vi.mock('../../services/api/veiculosApi', () => ({
  veiculosApi: { listarOcupacaoSvo: vi.fn() },
}));

const solicitacoesApi = vi.mocked(solicitacoesSvoApi);
const equipesApi = vi.mocked(equipesSvoApi);
const ocupacaoApi = vi.mocked(veiculosApi);

const solicitacao = (id: number): SolicitacaoSvo => ({
  id,
  registrante_id: 4,
  dados_solicitante: `Familiar ${id}`,
  local_ocorrencia: `Rua ${id}, Aracaju`,
  material_sensivel: false,
  status: 'CONFIRMADA',
});

const veiculoSvo: Veiculo = {
  id: 10,
  placa: 'JKL4G56',
  modelo: 'Fiat Ducato',
  tipo_frota: 'SVO',
  capacidade_maxima: 2,
  km_atual: 1000,
  status: 'DISPONIVEL',
};
const veiculoFrota: Veiculo = { ...veiculoSvo, id: 11, placa: 'ABC1D23', modelo: 'Fiat Uno', tipo_frota: 'ADMINISTRATIVA' };

const motoristaSvo: Motorista = {
  id: 20,
  usuario_id: 5,
  nome: 'Marcos Oliveira',
  numero_cnh: '123',
  categoria_cnh: 'D',
  validade_cnh: '2030-01-01',
  tipo_motorista: 'SVO',
  status: 'DISPONIVEL',
};

const disponibilidade = (equipes: DisponibilidadeEquipesSvo['equipes']): DisponibilidadeEquipesSvo => ({
  periodo: { inicio: '2026-11-13T21:00:00.000Z', fim: '2026-11-13T22:00:00.000Z' },
  equipes,
});

function renderizar(perfil: Perfil = 'GESTOR_SVO') {
  auth.perfil = perfil;
  const onSalvar = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <ModalNovaViagem
      solicitacoesAprovadas={[]}
      veiculos={[veiculoSvo, veiculoFrota]}
      motoristas={[motoristaSvo]}
      onClose={onClose}
      onSalvar={onSalvar}
    />,
  );
  return { onSalvar, onClose };
}

const botaoAgendar = () => screen.getByRole('button', { name: 'Agendar Viagem' });

// Espera a lista de solicitações e o seletor de equipes saírem do carregamento
async function aguardarDadosSvo() {
  await screen.findByLabelText('Solicitação SVO Vinculada *');
  await screen.findByLabelText('Equipe SVO (opcional)');
}

describe('ModalNovaViagem (operação SVO)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    solicitacoesApi.listarTodas.mockResolvedValue([solicitacao(7), solicitacao(8)]);
    equipesApi.listarDisponiveis.mockResolvedValue(
      disponibilidade([
        { id: 1, nome_equipe: 'Equipe Plantão SVO - A' },
        { id: 2, nome_equipe: 'Equipe Plantão SVO - B' },
      ]),
    );
    ocupacaoApi.listarOcupacaoSvo.mockResolvedValue([
      {
        id: 10,
        placa: 'JKL4G56',
        modelo: 'Fiat Ducato',
        capacidade_maxima: 2,
        status: 'DISPONIVEL',
        capacidade_utilizada: 1,
        vagas_disponiveis: 1,
      },
    ]);
  });

  it('carrega as solicitações SVO confirmadas e as equipes disponíveis no período da coleta', async () => {
    renderizar();

    expect(await screen.findByRole('option', { name: '#7 — Rua 7, Aracaju' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '#8 — Rua 8, Aracaju' })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Equipe Plantão SVO - A' })).toBeInTheDocument();

    expect(solicitacoesApi.listarTodas).toHaveBeenCalledWith('CONFIRMADA');
    const { inicio, fim } = equipesApi.listarDisponiveis.mock.calls[0][0];
    expect(new Date(fim).getTime() - new Date(inicio).getTime()).toBe(60 * 60_000);
  });

  it('envia o equipe_id quando uma equipe é selecionada', async () => {
    const { onSalvar, onClose } = renderizar();
    await aguardarDadosSvo();

    await userEvent.selectOptions(screen.getByLabelText('Solicitação SVO Vinculada *'), '8');
    await userEvent.selectOptions(screen.getByLabelText('Equipe SVO (opcional)'), '2');
    await waitFor(() => expect(botaoAgendar()).toBeEnabled());
    await userEvent.click(botaoAgendar());

    await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(1));
    expect(onSalvar).toHaveBeenCalledWith({
      tipo_operacao: 'SVO',
      solicitacao_id: 8,
      veiculo_id: 10,
      motorista_id: 20,
      equipe_id: 2,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('envia a operação SVO sem equipe_id quando nenhuma equipe é escolhida', async () => {
    const { onSalvar } = renderizar();
    await aguardarDadosSvo();

    await waitFor(() => expect(botaoAgendar()).toBeEnabled());
    await userEvent.click(botaoAgendar());

    await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(1));
    const payload = onSalvar.mock.calls[0][0];
    expect(payload).toMatchObject({ tipo_operacao: 'SVO', solicitacao_id: 7, veiculo_id: 10, motorista_id: 20 });
    expect(payload).not.toHaveProperty('equipe_id');
  });

  it('avisa quando a consulta de equipes falha, mas permite agendar sem equipe', async () => {
    equipesApi.listarDisponiveis.mockRejectedValue(new ApiError('Erro interno do servidor', 500));
    const { onSalvar } = renderizar();

    expect(
      await screen.findByText(/Não foi possível carregar as equipes disponíveis: Erro interno do servidor/),
    ).toBeInTheDocument();
    await waitFor(() => expect(botaoAgendar()).toBeEnabled());
    await userEvent.click(botaoAgendar());

    await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(1));
    expect(onSalvar.mock.calls[0][0]).not.toHaveProperty('equipe_id');
  });

  it('mantém o agendamento sem equipe quando nenhuma equipe está disponível', async () => {
    equipesApi.listarDisponiveis.mockResolvedValue(disponibilidade([]));
    const { onSalvar } = renderizar();

    expect(await screen.findByText(/Nenhuma equipe disponível no período/)).toBeInTheDocument();
    await waitFor(() => expect(botaoAgendar()).toBeEnabled());
    await userEvent.click(botaoAgendar());

    await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(1));
    expect(onSalvar.mock.calls[0][0]).not.toHaveProperty('equipe_id');
  });

  it('bloqueia o envio enquanto as solicitações SVO carregam', async () => {
    solicitacoesApi.listarTodas.mockReturnValue(new Promise(() => {}));
    renderizar();

    expect(await screen.findByText(/Carregando solicitações SVO/)).toBeInTheDocument();
    expect(botaoAgendar()).toBeDisabled();
  });

  it('avisa e bloqueia o envio quando não há solicitações confirmadas', async () => {
    solicitacoesApi.listarTodas.mockResolvedValue([]);
    renderizar();

    expect(await screen.findByText(/Não há solicitações SVO confirmadas aguardando alocação/)).toBeInTheDocument();
    expect(botaoAgendar()).toBeDisabled();
  });

  it('explica a falha ao listar solicitações e bloqueia o envio', async () => {
    solicitacoesApi.listarTodas.mockRejectedValue(new ApiError('Você não tem permissão para acessar este recurso', 403));
    renderizar();

    expect(await screen.findByText(/Não foi possível carregar as solicitações SVO: Você não tem permissão/)).toBeInTheDocument();
    expect(botaoAgendar()).toBeDisabled();
  });
});

describe('ModalNovaViagem (tipos de operação por perfil)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    solicitacoesApi.listarTodas.mockResolvedValue([solicitacao(7)]);
    equipesApi.listarDisponiveis.mockResolvedValue(disponibilidade([]));
    ocupacaoApi.listarOcupacaoSvo.mockResolvedValue([]);
  });

  it('Gestor SVO vê somente a operação SVO, já selecionada', async () => {
    renderizar('GESTOR_SVO');

    expect(screen.getByRole('option', { name: /Serviço de Verificação de Óbito/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Frota Administrativa/ })).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Solicitação SVO Vinculada *')).toBeInTheDocument();
  });

  it('Gestor de Frota não vê a operação SVO e nada de SVO é consultado', () => {
    renderizar('GESTOR_FROTA');

    expect(screen.getByRole('option', { name: /Frota Administrativa/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Serviço de Verificação de Óbito/ })).not.toBeInTheDocument();
    expect(solicitacoesApi.listarTodas).not.toHaveBeenCalled();
    expect(equipesApi.listarDisponiveis).not.toHaveBeenCalled();
  });

  it('Administrador vê as duas operações', () => {
    renderizar('ADMINISTRADOR');

    expect(screen.getByRole('option', { name: /Frota Administrativa/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Serviço de Verificação de Óbito/ })).toBeInTheDocument();
  });
});
