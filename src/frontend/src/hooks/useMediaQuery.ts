import { useCallback, useSyncExternalStore } from 'react';

/** Acompanha uma media query. Sem `matchMedia` (testes, navegadores antigos), responde `padrao`. */
export function useMediaQuery(consulta: string, padrao = false): boolean {
  const observar = useCallback(
    (aoMudar: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const lista = window.matchMedia(consulta);
      lista.addEventListener?.('change', aoMudar);
      return () => lista.removeEventListener?.('change', aoMudar);
    },
    [consulta],
  );
  return useSyncExternalStore(observar, () =>
    typeof window.matchMedia === 'function' ? window.matchMedia(consulta).matches : padrao,
  );
}
