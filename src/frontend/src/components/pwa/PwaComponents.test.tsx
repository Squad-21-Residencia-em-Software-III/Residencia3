import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BannerOffline } from './BannerOffline';
import { ModalPreferenciasPwa } from './ModalPreferenciasPwa';

describe('Componentes PWA', () => {
  const originalOnLine = navigator.onLine;

  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: originalOnLine,
    });
    vi.restoreAllMocks();
  });

  it('exibe o BannerOffline quando a conexão cai e oculta ao voltar', () => {
    render(<BannerOffline />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent(window, new Event('offline'));
    expect(screen.getByRole('status')).toHaveTextContent(/Sem conexão com a internet/i);

    fireEvent(window, new Event('online'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('exibe status de rede e permite solicitar permissões no ModalPreferenciasPwa', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: 'default',
        requestPermission,
      },
    });

    const getCurrentPosition = vi.fn((sucesso: PositionCallback) => {
      sucesso({
        coords: {
          latitude: -10.9,
          longitude: -37.0,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      });
    });

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(<ModalPreferenciasPwa isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Online')).toBeInTheDocument();

    const botoesAtivar = screen.getAllByRole('button', { name: 'Ativar' });
    expect(botoesAtivar).toHaveLength(2);

    fireEvent.click(botoesAtivar[0]);
    await waitFor(() => {
      expect(requestPermission).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(botoesAtivar[1]);
    await waitFor(() => {
      expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    });
  });
});
