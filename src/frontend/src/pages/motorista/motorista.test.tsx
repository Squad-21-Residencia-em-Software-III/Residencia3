import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECURSOS_BACKEND } from '../../config/recursosBackend';
import { AppRoutes } from '../../routes';
import { abastecimentosApi } from '../../services/api/abastecimentosApi';
import { ApiError } from '../../services/api/http';
import { motoristasApi } from '../../services/api/motoristasApi';
import { veiculosApi } from '../../services/api/veiculosApi';
import { viagensApi } from '../../services/api/viagensApi';
import type { Veiculo } from '../../types/veiculo';
import type { Viagem } from '../../types/viagem';
import { formatarQuando, hojeLocal } from './formatarQuando';

vi.mock('../../services/api/viagensApi', () => ({
  viagensApi: { listar: vi.fn(), iniciar: vi.fn(), finalizar: vi.fn(), registrarChegadaLocalSvo: vi.fn() },
}));
vi.mock('../../services/api/veiculosApi', () => ({ veiculosApi: { listar: vi.fn() } }));
vi.mock('../../services/api/motoristasApi', () => ({
  motoristasApi: { listar: vi.fn(), buscarMeuPerfil: vi.fn() },
}));
vi.mock('../../services/api/abastecimentosApi', () => ({
  abastecimentosApi: { criar: vi.fn(), listarTodos: vi.fn() },
}));
vi.mock('../../services/api/dashboardApi', () => ({
  dashboardApi: { consultar: vi.fn().mockRejectedValue(new Error('sem acesso')) },
}));
vi.mock('../../services/api/solicitacoesApi', () => ({
  solicitacoesApi: { listar: vi.fn().mockResolvedValue([]) },
}));

const sessao = vi.hoisted(() => ({ perfil: 'MOTORISTA_FROTA', logout: vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    usuario: { id: 5, nome: 'João Santos', perfil: sessao.perfil },
    carregando: false,
    logout: sessao.logout,
    temPerfil: (...perfis: string[]) => perfis.includes(sessao.perfil),
  }),
}));

const api = vi.mocked(viagensApi);
const recursosOriginais = { ...RECURSOS_BACKEND };

function telaDeCelular(celular: boolean) {
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: celular,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

const viagem = (id: number, dados: Partial<Viagem> = {}): Viagem => ({
  id,
  solicitacao_id: id,
  tipo_operacao: 'ADMINISTRATIVA',
  origem: 'Sede Aracaju',
  destino: `Destino ${id}`,
  finalidade: null,
  solicitante_nome: null,
  veiculo_id: 1,
  veiculo_modelo: 'Fiat Mobi',
  veiculo_placa: 'ABC1D23',
  motorista_id: 1,
  motorista_nome: 'João Santos',
  km_inicial: null,
  status: 'AGENDADA',
  ...dados,
});

const coleta = (id: number, dados: Partial<Viagem> = {}) =>
  viagem(id, { tipo_operacao: 'SVO', origem: null, ...dados });

const veiculo = (id: number, dados: Partial<Veiculo> = {}): Veiculo => ({
  id,
  placa: `AAA${id}B23`,
  modelo: `Modelo ${id}`,
  tipo_frota: 'ADMINISTRATIVA',
  capacidade_maxima: 4,
  km_atual: 45000,
  status: 'RESERVADO',
  ...dados,
});

/** A próxima consulta de viagens fica sem resposta até o teste liberar. */
function segurarProximaLista() {
  let responder: (lista: Viagem[]) => void = () => undefined;
  let falhar: (erro: Error) => void = () => undefined;
  api.listar.mockReturnValueOnce(new Promise((resolve, reject) => { responder = resolve; falhar = reject; }));
  return {
    responder: (lista: Viagem[]) => act(async () => responder(lista)),
    falhar: (erro: Error) => act(async () => falhar(erro)),
  };
}

const voltarAoAplicativo = () => act(() => { document.dispatchEvent(new Event('visibilitychange')); });

async function iniciarViagem() {
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar viagem' }));
  await userEvent.type(screen.getByPlaceholderText('Último km: 45000'), '45010');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar Saída' }));
  await screen.findByText('Viagem iniciada.');
}

function abrir(rota: string) {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  telaDeCelular(true);
  sessao.perfil = 'MOTORISTA_FROTA';
  RECURSOS_BACKEND.fotosOdometro = false;
  RECURSOS_BACKEND.agendamentoTemporalSvo = true;
  api.listar.mockResolvedValue([]);
  vi.mocked(veiculosApi.listar).mockResolvedValue([veiculo(1)]);
  vi.mocked(motoristasApi.buscarMeuPerfil).mockResolvedValue({ id: 9 } as never);
  vi.mocked(abastecimentosApi.listarTodos).mockResolvedValue([]);
  vi.mocked(abastecimentosApi.criar).mockResolvedValue({ id: 1 } as never);
});

afterEach(() => {
  Object.assign(RECURSOS_BACKEND, recursosOriginais);
  vi.unstubAllGlobals();
});

describe('Escolha do layout', () => {
  it('motorista no celular usa a barra inferior com as quatro telas dele', async () => {
    const { unmount } = abrir('/inicio');
    const nav = await screen.findByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Viagens', 'Veículo', 'Início', 'Abastecer',
    ]);
    // A Conta é um botão e vem por último: o Início é o terceiro de cinco
    expect(within(nav).getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      'Viagens', 'Veículo', 'Início', 'Abastecer', 'Conta',
    ]);
    expect(screen.queryByRole('button', { name: 'Abrir menu de navegação' })).not.toBeInTheDocument();
    expect(document.documentElement.dataset.layout).toBe('motorista');
    unmount();
    expect(document.documentElement.dataset.layout).toBeUndefined();
  });

  it('motorista no computador continua com as telas padrão', async () => {
    telaDeCelular(false);
    abrir('/viagens');
    expect(await screen.findByText('Total de Viagens')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir menu de navegação' })).toBeInTheDocument();
  });

  it.each(['ADMINISTRADOR', 'GESTOR_FROTA', 'SOLICITANTE'])('%s no celular não muda', async (perfil) => {
    sessao.perfil = perfil;
    abrir('/inicio');
    expect(await screen.findByRole('button', { name: 'Abrir menu de navegação' })).toBeInTheDocument();
    expect(document.documentElement.dataset.layout).toBeUndefined();
  });

  it('motorista continua sem acesso às telas da gestão', async () => {
    abrir('/multas');
    expect(await screen.findByText('403')).toBeInTheDocument();
  });

  it('sai da conta pela barra inferior', async () => {
    abrir('/inicio');
    await userEvent.click(await screen.findByRole('button', { name: 'Conta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
    expect(sessao.logout).toHaveBeenCalledOnce();
  });
});

describe('Início e Viagens', () => {
  it('destaca a próxima viagem pelo horário e inicia com o km informado', async () => {
    api.listar.mockResolvedValue([
      viagem(2, { inicio_previsto: '2030-01-02T10:00:00' }),
      viagem(1, { inicio_previsto: '2030-01-01T10:00:00' }),
    ]);
    abrir('/inicio');
    const destaque = await screen.findByRole('region', { name: 'Próxima viagem' });
    expect(within(destaque).getByText('Destino 1')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Iniciar viagem' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar viagem' }));
    const janela = screen.getByRole('dialog');
    await userEvent.type(within(janela).getByPlaceholderText('Último km: 45000'), '45010');
    await userEvent.click(within(janela).getByRole('button', { name: 'Confirmar Saída' }));
    await waitFor(() => expect(api.iniciar).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 1 }), 45010, undefined,
    ));
    expect(await screen.findByText('Viagem iniciada.')).toBeInTheDocument();
  });

  it('com viagem em andamento, só oferece finalizar e não deixa iniciar outra', async () => {
    api.listar.mockResolvedValue([
      viagem(1, { status: 'EM_ANDAMENTO', km_inicial: 45000 }),
      viagem(2),
    ]);
    abrir('/viagens');
    expect(await screen.findByRole('button', { name: 'Finalizar viagem' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próximas (1)' }));
    expect(screen.getByText('Finalize a viagem atual para iniciar esta.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar viagem' })).not.toBeInTheDocument();
  });

  it('separa o histórico, sem ações nas encerradas', async () => {
    api.listar.mockResolvedValue([
      viagem(1, { status: 'CONCLUIDA', km_inicial: 100, km_final: 130 }),
      viagem(2, { status: 'CANCELADA' }),
    ]);
    abrir('/viagens');
    await userEvent.click(await screen.findByRole('button', { name: 'Histórico' }));
    expect(screen.getByText('30 km')).toBeInTheDocument();
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Iniciar|Finalizar/ })).not.toBeInTheDocument();
  });

  it('finaliza e volta a mostrar o momento atual', async () => {
    api.listar.mockResolvedValueOnce([viagem(1, { status: 'EM_ANDAMENTO', km_inicial: 45000 }), viagem(2)]);
    api.listar.mockResolvedValue([viagem(1, { status: 'CONCLUIDA', km_inicial: 45000, km_final: 45020 }), viagem(2)]);
    abrir('/viagens');
    await userEvent.click(await screen.findByRole('button', { name: 'Agora (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar viagem' }));
    await userEvent.type(screen.getByPlaceholderText('Maior que 45000'), '45020');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar chegada' }));
    expect(await screen.findByRole('button', { name: 'Iniciar viagem' })).toBeInTheDocument();
    expect(api.finalizar).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 1 }), 45020, undefined);
    expect(screen.getByRole('button', { name: 'Próximas (1)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('abre os detalhes sem as ações de gestão', async () => {
    api.listar.mockResolvedValue([viagem(1)]);
    abrir('/viagens');
    await userEvent.click(await screen.findByRole('button', { name: 'Ver detalhes: Destino 1' }));
    const detalhes = await screen.findByRole('dialog');
    expect(within(detalhes).getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    expect(within(detalhes).queryByRole('button', { name: /Baixar Ficha|Cancelar viagem/ })).not.toBeInTheDocument();
  });

  it.each(['/inicio', '/viagens'])('em %s, a próxima viagem vem depois das outras, junto da barra', async (rota) => {
    api.listar.mockResolvedValue([
      viagem(2, { inicio_previsto: '2030-01-02T10:00:00' }),
      viagem(1, { inicio_previsto: '2030-01-01T10:00:00' }),
    ]);
    abrir(rota);
    const proxima = await screen.findByRole('region', { name: 'Próxima viagem' });
    const depois = screen.getByRole('region', { name: 'Mais tarde' });
    expect(within(proxima).getByText('Destino 1')).toBeInTheDocument();
    expect(within(depois).getByText('Destino 2')).toBeInTheDocument();
    expect(depois.compareDocumentPosition(proxima) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('inicia uma viagem de mais tarde pelos detalhes', async () => {
    api.listar.mockResolvedValue([viagem(1), viagem(2)]);
    abrir('/viagens');
    await userEvent.click(within(await screen.findByRole('region', { name: 'Mais tarde' })).getByRole('button'));
    const detalhes = await screen.findByRole('dialog');
    await userEvent.click(within(detalhes).getByRole('button', { name: 'Iniciar' }));
    expect(await screen.findByRole('dialog', { name: 'Iniciar Viagem #2' })).toBeInTheDocument();
  });

  it('com outra em andamento, os detalhes também não oferecem iniciar', async () => {
    api.listar.mockResolvedValue([viagem(1, { status: 'EM_ANDAMENTO' }), viagem(2)]);
    abrir('/inicio');
    await userEvent.click(within(await screen.findByRole('region', { name: 'Próximas' })).getByRole('button'));
    const detalhes = await screen.findByRole('dialog');
    expect(within(detalhes).getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    expect(within(detalhes).queryByRole('button', { name: 'Iniciar' })).not.toBeInTheDocument();
  });

  it('sozinha na tela, a viagem mostra rota e dados informados, sem campos vazios', async () => {
    api.listar.mockResolvedValue([
      viagem(1, { status: 'EM_ANDAMENTO', km_inicial: 45000, solicitante_nome: 'Mariana Souza', fim_previsto: null }),
    ]);
    abrir('/inicio');
    expect(await screen.findByText('Sede Aracaju')).toBeInTheDocument();
    expect(screen.getByText('45.000 km')).toBeInTheDocument();
    expect(screen.getByText('Mariana Souza')).toBeInTheDocument();
    expect(screen.queryByText('Retorno previsto')).not.toBeInTheDocument();
    expect(screen.queryByText('Finalidade')).not.toBeInTheDocument();
  });

  it('sem viagem no momento, mostra as últimas', async () => {
    api.listar.mockResolvedValue([viagem(1, { status: 'CONCLUIDA', data_hora_efetiva_chegada: '2026-11-01T10:00:00' })]);
    abrir('/inicio');
    expect(await screen.findByText('Nenhuma viagem para você agora')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Últimas viagens' })).getByText('Destino 1')).toBeInTheDocument();
  });

  it('sem nada em andamento, leva às próximas', async () => {
    api.listar.mockResolvedValue([viagem(1)]);
    abrir('/viagens');
    await userEvent.click(await screen.findByRole('button', { name: 'Agora' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ver próximas (1)' }));
    expect(screen.getByRole('button', { name: 'Iniciar viagem' })).toBeInTheDocument();
  });

  it('mostra o erro de carga e permite tentar de novo', async () => {
    api.listar.mockRejectedValueOnce(new ApiError('Sem conexão.', 0));
    api.listar.mockResolvedValue([viagem(1)]);
    abrir('/inicio');
    await userEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Destino 1')).toBeInTheDocument();
  });

  it('a falha ao consultar o veículo não esconde as viagens', async () => {
    vi.mocked(veiculosApi.listar).mockRejectedValue(new Error('falhou'));
    api.listar.mockResolvedValue([viagem(1)]);
    abrir('/inicio');
    expect(await screen.findByText('Destino 1')).toBeInTheDocument();
  });

  it('atualiza a lista quando o motorista volta ao aplicativo', async () => {
    abrir('/inicio');
    await screen.findByText('Nenhuma viagem para você agora');
    api.listar.mockResolvedValue([viagem(1)]);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(await screen.findByText('Destino 1')).toBeInTheDocument();
  });

  it.each(['/inicio', '/viagens'])('%s: resposta antiga da lista não desfaz a saída já registrada', async (rota) => {
    api.listar.mockResolvedValueOnce([viagem(1)]);
    abrir(rota);
    await screen.findByRole('button', { name: 'Iniciar viagem' });
    const antiga = segurarProximaLista();
    voltarAoAplicativo();

    api.listar.mockResolvedValue([viagem(1, { status: 'EM_ANDAMENTO', km_inicial: 45010 })]);
    await iniciarViagem();
    await antiga.responder([viagem(1)]);

    expect(screen.getByRole('button', { name: 'Finalizar viagem' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar viagem' })).not.toBeInTheDocument();
  });

  it('falha antiga da lista não vira erro sobre a lista atual', async () => {
    api.listar.mockResolvedValueOnce([viagem(1)]);
    abrir('/inicio');
    await screen.findByRole('button', { name: 'Iniciar viagem' });
    const antiga = segurarProximaLista();
    voltarAoAplicativo();

    api.listar.mockResolvedValue([viagem(1, { status: 'EM_ANDAMENTO', km_inicial: 45010 })]);
    await iniciarViagem();
    await antiga.falhar(new ApiError('Sem conexão.', 0));

    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalizar viagem' })).toBeInTheDocument();
  });

  it('se a consulta depois da saída falhar, a resposta antiga não esconde o erro', async () => {
    api.listar.mockResolvedValueOnce([viagem(1)]);
    abrir('/inicio');
    await screen.findByRole('button', { name: 'Iniciar viagem' });
    const antiga = segurarProximaLista();
    voltarAoAplicativo();

    api.listar.mockRejectedValueOnce(new ApiError('Sem conexão.', 0));
    await iniciarViagem();
    await antiga.responder([viagem(1)]);

    api.listar.mockResolvedValue([viagem(1, { status: 'EM_ANDAMENTO', km_inicial: 45010 })]);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('button', { name: 'Finalizar viagem' })).toBeInTheDocument();
  });

  it('com duas atualizações pendentes, vale a mais nova, em qualquer ordem de resposta', async () => {
    abrir('/inicio');
    await screen.findByText('Nenhuma viagem para você agora');
    const primeira = segurarProximaLista();
    voltarAoAplicativo();
    const segunda = segurarProximaLista();
    voltarAoAplicativo();

    await primeira.responder([viagem(1)]);
    expect(screen.getByText('Destino 1')).toBeInTheDocument();
    await segunda.responder([viagem(2)]);
    expect(screen.getByText('Destino 2')).toBeInTheDocument();

    const terceira = segurarProximaLista();
    voltarAoAplicativo();
    const quarta = segurarProximaLista();
    voltarAoAplicativo();
    await quarta.responder([viagem(4)]);
    await terceira.responder([viagem(3)]);
    expect(screen.getByText('Destino 4')).toBeInTheDocument();
    expect(screen.queryByText('Destino 3')).not.toBeInTheDocument();
  });
});

describe('Coletas SVO', () => {
  beforeEach(() => {
    sessao.perfil = 'MOTORISTA_SVO';
  });

  it('a caminho, registra a chegada uma vez e passa a oferecer só finalizar', async () => {
    let confirmar: (v: Viagem) => void = () => undefined;
    api.registrarChegadaLocalSvo.mockReturnValueOnce(new Promise((resolve) => { confirmar = resolve; }));
    const emCurso = coleta(7, { status: 'EM_ANDAMENTO', km_inicial: 10 });
    api.listar.mockResolvedValue([emCurso]);
    abrir('/inicio');

    await userEvent.click(await screen.findByRole('button', { name: 'Cheguei ao local' }));
    expect(screen.getByRole('button', { name: 'Registrando chegada…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finalizar coleta' })).toBeDisabled();
    await act(async () => confirmar({ ...emCurso, status: 'NO_LOCAL' }));

    expect(api.registrarChegadaLocalSvo).toHaveBeenCalledExactlyOnceWith(7);
    expect(screen.queryByRole('button', { name: /Cheguei|Registrando/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalizar coleta' })).toBeEnabled();
  });

  it('resposta antiga da lista não desfaz a chegada, e a próxima atualização volta a valer', async () => {
    const emCurso = coleta(7, { status: 'EM_ANDAMENTO', km_inicial: 10 });
    api.listar.mockResolvedValueOnce([emCurso]);
    api.registrarChegadaLocalSvo.mockResolvedValueOnce({ ...emCurso, status: 'NO_LOCAL' });
    abrir('/inicio');
    await screen.findByRole('button', { name: 'Cheguei ao local' });
    const antiga = segurarProximaLista();
    voltarAoAplicativo();
    // No lugar da consulta descartada, sai outra
    const nova = segurarProximaLista();

    await userEvent.click(screen.getByRole('button', { name: 'Cheguei ao local' }));
    await screen.findByText('Chegada ao local registrada.');
    await antiga.responder([emCurso]);
    expect(screen.queryByRole('button', { name: 'Cheguei ao local' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalizar coleta' })).toBeEnabled();

    await nova.responder([{ ...emCurso, status: 'NO_LOCAL' }, coleta(8)]);
    expect(screen.getByText('Destino 8')).toBeInTheDocument();
  });

  it('a chegada de uma coleta não descarta a saída de outra', async () => {
    const primeira = coleta(7, { status: 'EM_ANDAMENTO', km_inicial: 10 });
    let confirmarChegada: (v: Viagem) => void = () => undefined;
    api.registrarChegadaLocalSvo.mockReturnValueOnce(new Promise((resolve) => { confirmarChegada = resolve; }));
    api.listar.mockResolvedValueOnce([primeira, coleta(8)]);
    abrir('/viagens');
    await userEvent.click(await screen.findByRole('button', { name: 'Cheguei ao local' }));

    await userEvent.click(screen.getByRole('button', { name: 'Próximas (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar coleta' }));
    await userEvent.type(screen.getByPlaceholderText('Último km: 45000'), '45010');
    const depoisDaSaida = segurarProximaLista();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar Saída' }));
    await waitFor(() => expect(api.listar).toHaveBeenCalledTimes(2));

    const atual = [{ ...primeira, status: 'NO_LOCAL' as const }, coleta(8, { status: 'EM_ANDAMENTO', km_inicial: 45010 })];
    api.listar.mockResolvedValue(atual);
    await act(async () => confirmarChegada(atual[0]));
    await depoisDaSaida.responder([primeira, atual[1]]);

    expect(await screen.findByRole('button', { name: 'Agora (2)' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Cheguei ao local' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Iniciar coleta' })).not.toBeInTheDocument();
  });

  it('ordens do mesmo deslocamento: outra em andamento não bloqueia a saída', async () => {
    api.listar.mockResolvedValue([coleta(1, { status: 'NO_LOCAL' }), coleta(2)]);
    abrir('/viagens');
    await userEvent.click(await screen.findByRole('button', { name: 'Próximas (1)' }));
    expect(screen.getByRole('button', { name: 'Iniciar coleta' })).toBeEnabled();
  });

  it('avisa a coleta ainda não liberada', async () => {
    api.listar.mockResolvedValue([coleta(1, { inicio_previsto: '2030-01-01T10:00:00', liberada_em: null })]);
    abrir('/inicio');
    expect(await screen.findByText('Aguardando liberação')).toBeInTheDocument();
  });

  it('sem a agenda SVO ativa, não oferece ações', async () => {
    RECURSOS_BACKEND.agendamentoTemporalSvo = false;
    api.listar.mockResolvedValue([coleta(1)]);
    abrir('/inicio');
    expect(await screen.findByText(/operações de coleta SVO estão desabilitadas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Iniciar|Finalizar|Cheguei/ })).not.toBeInTheDocument();
  });
});

describe('Abastecer e Veículo', () => {
  async function preencher() {
    await userEvent.type(await screen.findByLabelText('Km do painel'), '45100');
    await userEvent.type(screen.getByLabelText('Litros'), '40,5');
    await userEvent.type(screen.getByLabelText('R$ por litro'), '6,00');
    await userEvent.type(screen.getByLabelText('Posto'), ' Posto Central ');
  }

  it('usa o teclado numérico e envia o abastecimento do veículo do motorista', async () => {
    abrir('/abastecimento');
    await preencher();
    expect(screen.getByLabelText('Km do painel')).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByLabelText('Litros')).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByText(/243,00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar abastecimento' }));
    expect(abastecimentosApi.criar).toHaveBeenCalledExactlyOnceWith({
      veiculo_id: 1, motorista_id: 9, data_abastecimento: hojeLocal(), quilometragem: 45100,
      litros: 40.5, valor_total: 243, posto_combustivel: 'Posto Central',
    });
    expect(await screen.findByText('Abastecimento registrado.')).toBeInTheDocument();
    expect(screen.getByLabelText('Litros')).toHaveValue('');
  });

  it('não envia litros inválidos e mantém o que foi digitado quando o servidor recusa', async () => {
    abrir('/abastecimento');
    await preencher();
    await userEvent.type(screen.getByLabelText('Litros'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar abastecimento' }));
    expect(screen.getByText('Informe os litros. Ex.: 45,5')).toBeInTheDocument();
    expect(abastecimentosApi.criar).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Litros'), '{Backspace}');
    vi.mocked(abastecimentosApi.criar).mockRejectedValueOnce(new ApiError('Quilometragem menor.', 400));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar abastecimento' }));
    expect(await screen.findByText('Quilometragem menor.')).toBeInTheDocument();
    expect(screen.getByLabelText('Km do painel')).toHaveValue('45100');
  });

  it('abre os últimos abastecimentos do veículo', async () => {
    vi.mocked(abastecimentosApi.listarTodos).mockResolvedValue([
      { id: 1, veiculo_id: 1, motorista_id: 9, data_abastecimento: '2026-11-20', quilometragem: 1, litros: 10, valor_total: 60, posto_combustivel: 'Posto Sul' },
    ]);
    abrir('/abastecimento');
    await userEvent.click(await screen.findByRole('button', { name: 'Últimos abastecimentos' }));
    expect(within(screen.getByRole('dialog')).getByText('Posto Sul')).toBeInTheDocument();
    expect(abastecimentosApi.criar).not.toHaveBeenCalled();
  });

  it('com mais de um veículo, começa pelo que está em uso', async () => {
    vi.mocked(veiculosApi.listar).mockResolvedValue([veiculo(1), veiculo(2, { status: 'EM_USO' })]);
    abrir('/abastecimento');
    expect(await screen.findByRole('button', { name: /Modelo 2/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('explica quando não há veículo vinculado', async () => {
    vi.mocked(veiculosApi.listar).mockResolvedValue([]);
    abrir('/abastecimento');
    expect(await screen.findByText('Sem veículo para abastecer')).toBeInTheDocument();
  });

  it('o veículo mostra a viagem com ele e o último abastecimento, mesmo se um deles falhar', async () => {
    api.listar.mockResolvedValue([viagem(1), viagem(2, { status: 'EM_ANDAMENTO' }), viagem(3, { veiculo_id: 8 })]);
    vi.mocked(abastecimentosApi.listarTodos).mockResolvedValueOnce([
      { id: 1, veiculo_id: 1, motorista_id: 9, data_abastecimento: '2026-11-20', quilometragem: 1, litros: 10.5, valor_total: 60 },
    ]);
    const { unmount } = abrir('/veiculos');
    expect(await screen.findByText('Destino 2')).toBeInTheDocument();
    expect(screen.getByText(/20\/11 · 10,5 L · R\$\s60,00/)).toBeInTheDocument();
    unmount();

    api.listar.mockRejectedValue(new Error('falhou'));
    abrir('/veiculos');
    expect(await screen.findByText('Modelo 1')).toBeInTheDocument();
  });

  it('do veículo, leva ao abastecimento dele', async () => {
    vi.mocked(veiculosApi.listar).mockResolvedValue([veiculo(1, { status: 'EM_USO' }), veiculo(2)]);
    abrir('/veiculos');
    await userEvent.click((await screen.findAllByRole('button', { name: 'Abastecer' }))[1]);
    expect(await screen.findByRole('button', { name: /Modelo 2/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Datas', () => {
  const agora = new Date(2026, 10, 23, 22, 30);

  it('mostra o dia de forma direta', () => {
    expect(formatarQuando('2026-11-23T08:05:00', agora)).toBe('Hoje, 08:05');
    expect(formatarQuando('2026-11-24T08:05:00', agora)).toBe('Amanhã, 08:05');
    expect(formatarQuando('2026-11-22T08:05:00', agora)).toBe('Ontem, 08:05');
    expect(formatarQuando('2026-12-01T08:05:00', agora)).toBe('01/12, 08:05');
    expect(formatarQuando(null, agora)).toBe('');
  });

  it('à noite, hoje continua sendo hoje', () => {
    expect(hojeLocal(agora)).toBe('2026-11-23');
  });
});
