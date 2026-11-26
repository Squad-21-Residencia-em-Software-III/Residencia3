import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERFIS } from '../types/usuario';
import type { Usuario } from '../types/usuario';
import type { NotificacaoInApp } from '../types/notificacao';
import {
  DEBOUNCE_FOCO_NOTIFICACOES_MS,
  INTERVALO_POLLING_NOTIFICACOES_MS,
  NotificacoesProvider,
  useMarcarReferenciaLida,
  useNotificacoes,
} from './NotificacoesContext';

const mockUseAuth = vi.fn();
const mockUseOnlineStatus = vi.fn();
const mockListar = vi.fn();
const mockContador = vi.fn();
const mockObter = vi.fn();
const mockBadge = vi.fn();
const mockLerEstado = vi.fn();
const mockAtualizarBadge = vi.fn();
const vinculo = 'A'.repeat(43);

vi.mock('../sw/estadoPush', () => ({
  lerEstadoPush: () => mockLerEstado(),
  atualizarBadgeDoVinculo: (...args: unknown[]) => mockAtualizarBadge(...args),
}));
const mockMarcarLida = vi.fn();
const mockMarcarTodasLidas = vi.fn();
const mockMarcarReferenciaLida = vi.fn();

vi.mock('./AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => mockUseOnlineStatus(),
}));

vi.mock('../services/api/notificacoesApi', () => ({
  notificacoesApi: {
    obter: (...args: unknown[]) => mockObter(...args),
    badge: (...args: unknown[]) => mockBadge(...args),
    listar: (...args: unknown[]) => mockListar(...args),
    contador: (...args: unknown[]) => mockContador(...args),
    marcarLida: (...args: unknown[]) => mockMarcarLida(...args),
    marcarTodasLidas: (...args: unknown[]) => mockMarcarTodasLidas(...args),
    marcarReferenciaLida: (...args: unknown[]) => mockMarcarReferenciaLida(...args),
  },
}));

const USUARIO_PADRAO: Usuario = {
  id: 7,
  nome: 'Gestor Teste',
  email: 'gestor@fsph.se.gov.br',
  perfil: PERFIS.GESTOR_FROTA,
  tipo_usuario: 'GESTOR_FROTA',
  ativo: true,
};

function criarNotificacao(id: number, lida = false): NotificacaoInApp {
  return {
    id,
    tipo: 'VIAGEM_AGENDADA',
    titulo: `Viagem #${id} agendada`,
    mensagem: 'Veículo alocado para saída.',
    severidade: 'info',
    operacao: 'Administrativo',
    referencia_tipo: 'VIAGEM_FROTA',
    referencia_id: id,
    url_destino: '/viagens',
    lida_em: lida ? '2026-11-24T12:00:00.000Z' : null,
    criado_em: '2026-11-24T11:00:00.000Z',
  };
}

function wrapper(ativoOverride = true) {
  return ({ children }: { children: ReactNode }) => (
    <NotificacoesProvider ativoOverride={ativoOverride}>{children}</NotificacoesProvider>
  );
}

describe('NotificacoesContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T18:00:00.000Z'));
    mockUseAuth.mockReturnValue({ usuario: USUARIO_PADRAO });
    mockUseOnlineStatus.mockReturnValue(true);
    mockContador.mockResolvedValue({ nao_lidas: 2, versao: 'v1' });
    mockListar.mockResolvedValue({ itens: [], proximo_cursor: null, nao_lidas: 0, versao: 'v1' });
    mockMarcarLida.mockResolvedValue({ id: 1, nao_lidas: 1, versao: 'v2' });
    mockMarcarTodasLidas.mockResolvedValue({ atualizadas: 2, nao_lidas: 0, versao: 'v3' });
    mockMarcarReferenciaLida.mockResolvedValue({ atualizadas: 1, nao_lidas: 0, versao: 'v4' });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('não dispara requisições quando a feature flag está desativada', async () => {
    const { result } = renderHook(() => useNotificacoes(), { wrapper: wrapper(false) });

    await act(async () => {
      await result.current.carregarLista();
      vi.advanceTimersByTime(INTERVALO_POLLING_NOTIFICACOES_MS * 2);
    });

    expect(mockContador).not.toHaveBeenCalled();
    expect(mockListar).not.toHaveBeenCalled();
    expect(result.current.recursoHabilitado).toBe(false);
  });

  it('executa polling econômico a cada 60s apenas com aba visível e respeita debounce no focus', async () => {
    renderHook(() => useNotificacoes(), { wrapper: wrapper(true) });

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockContador).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => {
      vi.advanceTimersByTime(INTERVALO_POLLING_NOTIFICACOES_MS);
    });
    expect(mockContador).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => {
      vi.advanceTimersByTime(INTERVALO_POLLING_NOTIFICACOES_MS);
    });
    expect(mockContador).toHaveBeenCalledTimes(2);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    expect(mockContador).toHaveBeenCalledTimes(3);

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_FOCO_NOTIFICACOES_MS + 100);
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
    });
    expect(mockContador).toHaveBeenCalledTimes(4);
  });

  it('envia IDs exibidos e preserva itens carregados durante um rollback', async () => {
    mockListar
      .mockResolvedValueOnce({
        itens: [criarNotificacao(10), criarNotificacao(8)],
        proximo_cursor: 'cursor-8',
        nao_lidas: 2,
        versao: 'v1',
      })
      .mockResolvedValueOnce({
        itens: [criarNotificacao(5, true)],
        proximo_cursor: null,
        nao_lidas: 2,
        versao: 'v1',
      });

    const { result } = renderHook(() => useNotificacoes(), { wrapper: wrapper(true) });

    await act(async () => {
      await result.current.carregarLista();
    });

    // Simula falha concorrente em marcarTodasLidas enquanto outra página carrega
    let rejeitarLerTodas!: (erro: Error) => void;
    mockMarcarTodasLidas.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejeitarLerTodas = reject;
        }),
    );

    let promessaLerTodas!: Promise<void>;
    act(() => {
      promessaLerTodas = result.current.marcarTodasLidas();
    });
    expect(mockMarcarTodasLidas).toHaveBeenCalledWith([10, 8]);

    // Enquanto marcarTodasLidas está em voo, usuário carrega mais itens
    await act(async () => {
      await result.current.carregarMais();
    });
    expect(result.current.itens.map((i) => i.id)).toEqual([10, 8, 5]);

    // marcarTodasLidas falha: deve reverter apenas os IDs 10 e 8, mantendo o item 5 carregado concorrentemente
    await act(async () => {
      rejeitarLerTodas(new Error('Erro temporário'));
      await promessaLerTodas;
    });
    expect(result.current.itens.map((i) => i.id)).toEqual([10, 8, 5]);
    expect(result.current.itens.find((i) => i.id === 10)?.lida_em).toBeNull();
    expect(result.current.itens.find((i) => i.id === 8)?.lida_em).toBeNull();
    expect(result.current.itens.find((i) => i.id === 5)?.lida_em).not.toBeNull();

    // Sucesso com nova notificação chegada durante a requisição (nao_lidas = 1)
    mockMarcarTodasLidas.mockResolvedValueOnce({ atualizadas: 2, nao_lidas: 1, versao: 'v2' });
    await act(async () => {
      await result.current.marcarTodasLidas();
    });
    expect(result.current.naoLidas).toBe(1);
  });

  it('revalida a central aberta mesmo quando a versão do contador permanece igual', async () => {
    mockContador
      .mockResolvedValueOnce({ nao_lidas: 1, versao: 'v1' })
      .mockResolvedValueOnce({ nao_lidas: 1, versao: 'v1' });
    mockListar.mockResolvedValue({
      itens: [criarNotificacao(1)],
      proximo_cursor: null,
      nao_lidas: 1,
      versao: 'v1',
    });

    const { result } = renderHook(() => useNotificacoes(), { wrapper: wrapper(true) });

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockListar).not.toHaveBeenCalled();

    // Central fechada: mudança de versão NÃO dispara carregarLista
    await act(async () => {
      await result.current.atualizarContador();
    });
    expect(mockListar).not.toHaveBeenCalled();

    // Central aberta: revalida o conteúdo mesmo com o contador estável
    act(() => {
      result.current.definirCentralAberta(true);
    });
    await act(async () => {
      await result.current.atualizarContador();
    });
    expect(mockListar).toHaveBeenCalledTimes(1);
  });

  it('preserva leitura confirmada quando a leitura em massa concorrente falha', async () => {
    mockListar.mockResolvedValueOnce({ itens: [criarNotificacao(1)], nao_lidas: 1 });
    const { result } = renderHook(() => useNotificacoes(), { wrapper: wrapper(true) });
    await act(async () => result.current.carregarLista());
    let rejeitar!: (erro: Error) => void;
    mockMarcarTodasLidas.mockReturnValueOnce(new Promise((_, reject) => { rejeitar = reject; }));
    let lote!: Promise<void>;
    act(() => { lote = result.current.marcarTodasLidas(); });
    await act(async () => result.current.marcarLida(1));
    await act(async () => { rejeitar(new Error('falha')); await lote; });
    expect(result.current.itens[0]?.lida_em).not.toBeNull();
  });

  it('descarta respostas obsoletas de paginação e de outra sessão da mesma conta', async () => {
    let versaoSessao = 1;
    mockUseAuth.mockImplementation(() => ({ usuario: USUARIO_PADRAO, versaoSessao }));
    mockListar.mockResolvedValueOnce({ itens: [criarNotificacao(10)], proximo_cursor: 'antigo', nao_lidas: 1 });
    const { result, rerender } = renderHook(() => useNotificacoes(), { wrapper: wrapper(true) });
    await act(async () => result.current.carregarLista());
    let resolver!: (resposta: unknown) => void;
    mockListar.mockReturnValueOnce(new Promise((resolve) => { resolver = resolve; }));
    let pagina!: Promise<void>;
    act(() => { pagina = result.current.carregarMais(); });
    mockListar.mockResolvedValueOnce({ itens: [{ ...criarNotificacao(10), acesso_revogado: true }], proximo_cursor: 'novo' });
    await act(async () => result.current.carregarLista({ forcar: true }));
    await act(async () => { resolver({ itens: [criarNotificacao(5)], proximo_cursor: 'obsoleto' }); await pagina; });
    expect(result.current.proximoCursor).toBe('novo');
    expect(result.current.itens).toEqual([expect.objectContaining({ id: 10, acesso_revogado: true })]);
    mockListar.mockReturnValueOnce(new Promise((resolve) => { resolver = resolve; }));
    act(() => { pagina = result.current.carregarLista(); });
    versaoSessao += 1;
    rerender();
    await act(async () => { resolver({ itens: [criarNotificacao(99)], proximo_cursor: 'anterior' }); await pagina; });
    expect(result.current.itens).toEqual([]);
    expect(result.current.proximoCursor).toBeNull();
  });

  it('deduplica toast em primeiro plano por id e limpa todo o estado no logout', async () => {
    let usuarioAtual: Usuario | null = USUARIO_PADRAO;
    mockUseAuth.mockImplementation(() => ({ usuario: usuarioAtual }));

    const { result, rerender } = renderHook(() => useNotificacoes(), { wrapper: wrapper(true) });

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.naoLidas).toBe(2);

    act(() => {
      result.current.notificarEmPrimeiroPlano({
        id: 99,
        titulo: 'Coleta urgente',
        mensagem: 'Nova ordem SVO disponível.',
      });
    });
    expect(result.current.toastAtivo?.id).toBe(99);

    act(() => {
      result.current.fecharToast();
    });
    expect(result.current.toastAtivo).toBeNull();

    act(() => {
      result.current.notificarEmPrimeiroPlano({
        id: 99,
        titulo: 'Coleta urgente',
        mensagem: 'Duplicado',
      });
    });
    expect(result.current.toastAtivo).toBeNull();

    usuarioAtual = null;
    rerender();
    expect(result.current.naoLidas).toBe(0);
    expect(result.current.itens).toEqual([]);
    expect(result.current.toastAtivo).toBeNull();
  });

  it('useMarcarReferenciaLida marca referencia uma unica vez por entidade e funciona fora do provider', async () => {
    const { rerender } = renderHook(
      ({ tipo, id }: { tipo: string | null; id: number | null }) =>
        useMarcarReferenciaLida(tipo, id),
      {
        initialProps: { tipo: 'VIAGEM_FROTA', id: 42 },
        wrapper: wrapper(true),
      },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockMarcarReferenciaLida).toHaveBeenCalledTimes(1);
    expect(mockMarcarReferenciaLida).toHaveBeenCalledWith('VIAGEM_FROTA', 42);

    // Rerender com mesma referência não duplica chamada
    rerender({ tipo: 'VIAGEM_FROTA', id: 42 });
    expect(mockMarcarReferenciaLida).toHaveBeenCalledTimes(1);

    // Nova referência dispara nova chamada
    rerender({ tipo: 'ORDEM_SVO', id: 99 });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockMarcarReferenciaLida).toHaveBeenCalledWith('ORDEM_SVO', 99);

    // Fora do provider não lança erro
    expect(() => renderHook(() => useMarcarReferenciaLida('SOLICITACAO_VIAGEM', 10))).not.toThrow();
  });

  it('tenta de novo após falha e volta a marcar ao reabrir a mesma referência', async () => {
    mockMarcarReferenciaLida.mockRejectedValueOnce(new Error('conexão interrompida'));
    const { rerender } = renderHook(({ id }: { id: number | null }) => useMarcarReferenciaLida('ORDEM_SVO', id), {
      initialProps: { id: 42 as number | null }, wrapper: wrapper(true),
    });

    await act(async () => { await Promise.resolve(); });
    expect(mockMarcarReferenciaLida).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mockMarcarReferenciaLida).toHaveBeenCalledTimes(2);
    rerender({ id: null });
    rerender({ id: 42 });
    await act(async () => { await Promise.resolve(); });
    expect(mockMarcarReferenciaLida).toHaveBeenCalledTimes(3);
  });

  it('hidrata o Toast na API, deduplica reenvios e conta o badge separadamente do sino', async () => {
    const { RECURSOS_BACKEND } = await import('../config/recursosBackend');
    const flag = RECURSOS_BACKEND.webPush;
    RECURSOS_BACKEND.webPush = true;
    const swTarget = Object.assign(new EventTarget(), { controller: window });
    const swOriginal = navigator.serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: swTarget });
    const estado = { vinculo, geracao: '1', encerramento: false };
    mockLerEstado.mockResolvedValue(estado);
    mockBadge.mockResolvedValue({ elegiveis: 0 });
    mockObter.mockResolvedValue(criarNotificacao(301));

    const entregar = (id: number, token = vinculo, source: Window | null = window) => act(async () => {
      swTarget.dispatchEvent(new MessageEvent('message', {
        source, data: { tipo: 'PUSH_EM_PRIMEIRO_PLANO', notificacao_id: id, vinculo: token, corpo: 'Texto não confiável' },
      }));
    });

    try {
      const { result, rerender } = renderHook(() => useNotificacoes(), { wrapper: wrapper(true) });
      await act(async () => { await Promise.resolve(); });
      expect(result.current.naoLidas).toBe(2);
      expect(mockAtualizarBadge).toHaveBeenCalledWith(estado, 0, expect.any(Function));
      await entregar(301, 'B'.repeat(43));
      await entregar(301, vinculo, null);
      expect(mockObter).not.toHaveBeenCalled();
      await entregar(301);
      expect(result.current.toastAtivo).toMatchObject({ id: 301, titulo: 'Viagem #301 agendada' });
      await entregar(301);
      expect(mockObter).toHaveBeenCalledOnce();

      let resolver!: (item: NotificacaoInApp) => void;
      const antiga = new Promise<NotificacaoInApp>((resolve) => { resolver = resolve; });
      mockObter.mockReturnValueOnce(antiga);
      await entregar(302);
      mockUseAuth.mockReturnValue({ usuario: null, versaoSessao: 2 });
      rerender();
      await act(async () => resolver(criarNotificacao(302)));
      expect(result.current.toastAtivo).toBeNull();
    } finally {
      RECURSOS_BACKEND.webPush = flag;
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: swOriginal });
    }
  });
});
