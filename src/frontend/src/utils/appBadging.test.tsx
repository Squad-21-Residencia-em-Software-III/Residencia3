import { afterEach, describe, expect, it, vi } from 'vitest';
import { limparAppBadge, sincronizarAppBadge } from './appBadging';

describe('appBadging', () => {
  const navOriginal = navigator as Navigator & {
    setAppBadge?: unknown;
    clearAppBadge?: unknown;
  };
  const setOriginal = navOriginal.setAppBadge;
  const clearOriginal = navOriginal.clearAppBadge;

  afterEach(() => {
    Object.defineProperty(navigator, 'setAppBadge', {
      configurable: true,
      writable: true,
      value: setOriginal,
    });
    Object.defineProperty(navigator, 'clearAppBadge', {
      configurable: true,
      writable: true,
      value: clearOriginal,
    });
  });

  it('chama setAppBadge quando total > 0 e clearAppBadge quando total <= 0', async () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const clearAppBadge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: setAppBadge });
    Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: clearAppBadge });

    await sincronizarAppBadge(4);
    expect(setAppBadge).toHaveBeenCalledWith(4);

    await sincronizarAppBadge(0);
    expect(clearAppBadge).toHaveBeenCalledTimes(1);

    await limparAppBadge();
    expect(clearAppBadge).toHaveBeenCalledTimes(2);
  });

  it('não lança erro quando a API não é suportada ou rejeita', async () => {
    Object.defineProperty(navigator, 'setAppBadge', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clearAppBadge', { configurable: true, value: undefined });

    await expect(sincronizarAppBadge(3)).resolves.toBeUndefined();
    await expect(limparAppBadge()).resolves.toBeUndefined();

    Object.defineProperty(navigator, 'setAppBadge', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
    });
    Object.defineProperty(navigator, 'clearAppBadge', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
    });

    await expect(sincronizarAppBadge(2)).resolves.toBeUndefined();
    await expect(limparAppBadge()).resolves.toBeUndefined();
  });
});
