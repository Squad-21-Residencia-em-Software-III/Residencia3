import { useEffect, useState } from 'react';

/**
 * Monitora o estado de conectividade do navegador (online / offline).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const aoFicarOnline = () => setOnline(true);
    const aoFicarOffline = () => setOnline(false);

    window.addEventListener('online', aoFicarOnline);
    window.addEventListener('offline', aoFicarOffline);

    return () => {
      window.removeEventListener('online', aoFicarOnline);
      window.removeEventListener('offline', aoFicarOffline);
    };
  }, []);

  return online;
}
