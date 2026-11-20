import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function detectarModoStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    nav.standalone === true
  );
}

function detectarIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Gerencia o prompt de instalação do PWA (Android/Desktop via beforeinstallprompt)
 * e detecta se o app já está instalado em modo standalone ou rodando em iOS.
 */
export function useInstallPrompt() {
  const [eventoInstalacao, setEventoInstalacao] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [instalado, setInstalado] = useState<boolean>(detectarModoStandalone);
  const ehIos = detectarIos();

  useEffect(() => {
    const aoReceberPrompt = (e: Event) => {
      e.preventDefault();
      setEventoInstalacao(e as BeforeInstallPromptEvent);
    };

    const aoInstalar = () => {
      setInstalado(true);
      setEventoInstalacao(null);
    };

    window.addEventListener('beforeinstallprompt', aoReceberPrompt);
    window.addEventListener('appinstalled', aoInstalar);

    return () => {
      window.removeEventListener('beforeinstallprompt', aoReceberPrompt);
      window.removeEventListener('appinstalled', aoInstalar);
    };
  }, []);

  const instalar = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!eventoInstalacao) return 'unavailable';
    await eventoInstalacao.prompt();
    const { outcome } = await eventoInstalacao.userChoice;
    if (outcome === 'accepted') {
      setEventoInstalacao(null);
    }
    return outcome;
  }, [eventoInstalacao]);

  return {
    podeInstalar: !instalado && eventoInstalacao !== null,
    instalado,
    mostrarGuiaIos: !instalado && ehIos,
    instalar,
  };
}
