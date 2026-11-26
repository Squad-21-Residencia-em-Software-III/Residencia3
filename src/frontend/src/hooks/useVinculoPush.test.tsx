import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECURSOS_BACKEND } from '../config/recursosBackend';
import { ApiError } from '../services/api/http';
import { notificacoesPushApi } from '../services/api/notificacoesPushApi';
import { marcarEncerramento } from '../utils/encerramentoPush';
import { invalidarOperacoesPush } from '../utils/operacoesPush';
import { encerrarPushAoSair, useVinculoPush } from './useVinculoPush';

vi.mock('../services/api/notificacoesPushApi', () => ({ notificacoesPushApi: { situacao: vi.fn(), cancelar: vi.fn() } }));

const api = vi.mocked(notificacoesPushApi);
const recursosOriginais = { ...RECURSOS_BACKEND };
const unsubscribe = vi.fn();
const getSubscription = vi.fn();

function definir(alvo: object, nome: string, valor: unknown) {
  Object.defineProperty(alvo, nome, { configurable: true, value: valor });
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  invalidarOperacoesPush();
  RECURSOS_BACKEND.webPush = true;
  api.cancelar.mockResolvedValue(undefined);
  unsubscribe.mockResolvedValue(true);
  getSubscription.mockResolvedValue({ endpoint: 'https://push.exemplo/a', unsubscribe });
  definir(window, 'Notification', { permission: 'granted' });
  definir(window, 'PushManager', class {});
  definir(navigator, 'serviceWorker', { getRegistration: async () => ({ pushManager: { getSubscription } }) });
});

afterEach(() => {
  vi.useRealTimers();
  Object.assign(RECURSOS_BACKEND, recursosOriginais);
  for (const nome of ['Notification', 'PushManager']) delete (window as unknown as Record<string, unknown>)[nome];
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
});

describe('Assinatura deixada por outra conta', () => {
  it('é encerrada quando outra pessoa entra', async () => {
    api.situacao.mockResolvedValue({ ativa: false });
    renderHook(() => useVinculoPush(2));
    await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    expect(api.situacao).toHaveBeenCalledExactlyOnceWith('https://push.exemplo/a', expect.any(AbortSignal));
  });

  it('continua quando é da própria conta', async () => {
    api.situacao.mockResolvedValue({ ativa: true });
    renderHook(() => useVinculoPush(1));
    await waitFor(() => expect(api.situacao).toHaveBeenCalledOnce());
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('enquanto o servidor não responde, nada muda', async () => {
    api.situacao.mockRejectedValue(new ApiError('Servidor indisponível.', 503));
    renderHook(() => useVinculoPush(1));
    await waitFor(() => expect(api.situacao).toHaveBeenCalledOnce());
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('não encerra a assinatura que o usuário acabou de criar', async () => {
    const novo = vi.fn();
    api.situacao.mockImplementation(async () => {
      getSubscription.mockResolvedValue({ endpoint: 'https://push.exemplo/novo', unsubscribe: novo });
      return { ativa: false };
    });
    renderHook(() => useVinculoPush(2));
    await waitFor(() => expect(getSubscription).toHaveBeenCalledTimes(2));
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(novo).not.toHaveBeenCalled();
  });

  it('sem login, não confere a conta; com o interruptor desligado, não faz nada', async () => {
    renderHook(() => useVinculoPush(undefined));
    await Promise.resolve();
    expect(api.situacao).not.toHaveBeenCalled();
    RECURSOS_BACKEND.webPush = false;
    renderHook(() => useVinculoPush(1));
    encerrarPushAoSair('token-a');
    await Promise.resolve();
    expect(getSubscription).not.toHaveBeenCalled();
  });
});

describe('Conferência que falhou', () => {
  const passar = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const falhar = () => api.situacao.mockRejectedValueOnce(new ApiError('Sem conexão.', 0));
  const reaparecer = (estado: string) => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(estado as DocumentVisibilityState);
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    api.situacao.mockResolvedValue({ ativa: false });
  });

  it.each([
    ['a conexão volta', () => window.dispatchEvent(new Event('online'))],
    ['a tela reaparece', () => reaparecer('visible')],
  ])('é refeita quando %s, e encerra a assinatura da outra conta', async (_, evento) => {
    falhar();
    renderHook(() => useVinculoPush(2));
    await passar();
    expect(unsubscribe).not.toHaveBeenCalled();
    evento();
    await passar();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('é refeita sozinha, com espera crescente, até o servidor responder', async () => {
    falhar();
    falhar();
    renderHook(() => useVinculoPush(2));
    await passar();
    await passar(4_999);
    expect(api.situacao).toHaveBeenCalledTimes(1);
    await passar(1);
    expect(api.situacao).toHaveBeenCalledTimes(2);
    await passar(9_999);
    expect(api.situacao).toHaveBeenCalledTimes(2);
    await passar(1);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('a espera não passa de 5 minutos', async () => {
    api.situacao.mockRejectedValue(new ApiError('Sem conexão.', 0));
    renderHook(() => useVinculoPush(2));
    await passar(3_600_000);
    const antes = api.situacao.mock.calls.length;
    await passar(300_000);
    expect(api.situacao.mock.calls.length).toBe(antes + 1);
  });

  it('depois de resolvida, não consulta mais', async () => {
    api.situacao.mockResolvedValue({ ativa: true });
    renderHook(() => useVinculoPush(1));
    await passar();
    window.dispatchEvent(new Event('online'));
    reaparecer('visible');
    await passar(3_600_000);
    expect(api.situacao).toHaveBeenCalledOnce();
  });

  it('com a tela escondida, espera ela reaparecer', async () => {
    falhar();
    renderHook(() => useVinculoPush(2));
    await passar();
    reaparecer('hidden');
    await passar();
    expect(api.situacao).toHaveBeenCalledOnce();
  });

  it.each([
    ['responde false', () => unsubscribe.mockResolvedValueOnce(false)],
    ['dá erro', () => unsubscribe.mockRejectedValueOnce(new Error('falhou'))],
  ])('também é refeita se o navegador %s ao encerrar', async (_, falha) => {
    falha();
    renderHook(() => useVinculoPush(2));
    await passar();
    expect(unsubscribe).toHaveBeenCalledOnce();
    await passar(5_000);
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('para quando a sessão acaba ou a conta muda', async () => {
    api.situacao.mockRejectedValue(new ApiError('Sem conexão.', 0));
    const { rerender, unmount } = renderHook(({ id }) => useVinculoPush(id), { initialProps: { id: 2 } });
    await passar();
    api.situacao.mockClear();
    api.situacao.mockResolvedValue({ ativa: true });
    rerender({ id: 3 });
    await passar(3_600_000);
    expect(api.situacao).toHaveBeenCalledOnce();

    unmount();
    window.dispatchEvent(new Event('online'));
    await passar(3_600_000);
    expect(api.situacao).toHaveBeenCalledOnce();
  });

  it('encerramento marcado vem antes e é refeito até conseguir, mesmo sem login', async () => {
    unsubscribe.mockResolvedValueOnce(false);
    marcarEncerramento();
    renderHook(() => useVinculoPush(undefined));
    await passar();
    expect(localStorage).toHaveLength(1);
    await passar(5_000);
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    expect(localStorage).toHaveLength(0);
    expect(api.situacao).not.toHaveBeenCalled();
  });
});

describe('Sair da conta', () => {
  it('encerra os alertas neste aparelho', async () => {
    encerrarPushAoSair('token-a');
    await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    expect(api.cancelar).toHaveBeenCalledExactlyOnceWith(
      'https://push.exemplo/a', { token: 'token-a', signal: expect.any(AbortSignal) },
    );
  });

  it('sem token, encerra só no aparelho', async () => {
    encerrarPushAoSair(null);
    await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    expect(api.cancelar).not.toHaveBeenCalled();
  });

  it('não falha sem suporte a push', () => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    expect(() => encerrarPushAoSair('token-a')).not.toThrow();
  });
});
