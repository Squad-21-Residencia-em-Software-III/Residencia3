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
  useNotificacoes,
} from './NotificacoesContext';

const mockUseAuth = vi.fn();
const mockUseOnlineStatus = vi.fn();
const mockListar = vi.fn();
const mockContador = vi.fn();
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
    vi.clearAllMocks();
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

  it('envia ate_id em marcarTodasLidas, usa nao_lidas da resposta e faz rollback cirurgico sem apagar itens concorrentes', async () => {
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
    expect(mockMarcarTodasLidas).toHaveBeenCalledWith(10);

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

  it('recarrega a primeira pagina silenciosamente quando a versao do contador muda com a central aberta', async () => {
    mockContador
      .mockResolvedValueOnce({ nao_lidas: 1, versao: 'v1' })
      .mockResolvedValueOnce({ nao_lidas: 2, versao: 'v2' })
      .mockResolvedValueOnce({ nao_lidas: 3, versao: 'v3' });
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

    // Central aberta: mudança de versão dispara recarga silenciosa da primeira página
    act(() => {
      result.current.definirCentralAberta(true);
    });
    await act(async () => {
      await result.current.atualizarContador();
    });
    expect(mockListar).toHaveBeenCalledTimes(1);
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
});
