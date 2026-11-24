import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECURSOS_BACKEND } from '../config/recursosBackend';
import { ApiError } from '../services/api/http';
import { notificacoesPushApi } from '../services/api/notificacoesPushApi';
import { encerrarPushAoSair, useVinculoPush } from './useVinculoPush';

vi.mock('../services/api/notificacoesPushApi', () => ({ notificacoesPushApi: { situacao: vi.fn() } }));

const api = vi.mocked(notificacoesPushApi);
const recursosOriginais = { ...RECURSOS_BACKEND };
const unsubscribe = vi.fn();
const getSubscription = vi.fn();

function definir(alvo: object, nome: string, valor: unknown) {
  Object.defineProperty(alvo, nome, { configurable: true, value: valor });
}

beforeEach(() => {
  vi.clearAllMocks();
  RECURSOS_BACKEND.webPush = true;
  unsubscribe.mockResolvedValue(true);
  getSubscription.mockResolvedValue({ endpoint: 'https://push.exemplo/a', unsubscribe });
  definir(window, 'Notification', { permission: 'granted' });
  definir(window, 'PushManager', class {});
  definir(navigator, 'serviceWorker', { getRegistration: async () => ({ pushManager: { getSubscription } }) });
});

afterEach(() => {
  Object.assign(RECURSOS_BACKEND, recursosOriginais);
  for (const nome of ['Notification', 'PushManager']) delete (window as unknown as Record<string, unknown>)[nome];
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
});

describe('Assinatura deixada por outra conta', () => {
  it('é encerrada quando outra pessoa entra', async () => {
    api.situacao.mockResolvedValue({ ativa: false });
    renderHook(() => useVinculoPush(2));
    await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    expect(api.situacao).toHaveBeenCalledExactlyOnceWith('https://push.exemplo/a');
  });

  it('continua quando é da própria conta', async () => {
    api.situacao.mockResolvedValue({ ativa: true });
    renderHook(() => useVinculoPush(1));
    await waitFor(() => expect(api.situacao).toHaveBeenCalledOnce());
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('continua quando o servidor não responde', async () => {
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

  it('sem login ou com o interruptor desligado, não faz nada', async () => {
    renderHook(() => useVinculoPush(undefined));
    RECURSOS_BACKEND.webPush = false;
    renderHook(() => useVinculoPush(1));
    encerrarPushAoSair();
    await Promise.resolve();
    expect(getSubscription).not.toHaveBeenCalled();
  });
});

describe('Sair da conta', () => {
  it('encerra os alertas neste aparelho', async () => {
    encerrarPushAoSair();
    await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
  });

  it('não falha sem suporte a push', () => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    expect(() => encerrarPushAoSair()).not.toThrow();
  });
});
