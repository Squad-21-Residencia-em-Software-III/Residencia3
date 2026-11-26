import { useCallback, useEffect, useRef, useState } from 'react';

export interface Aviso {
  texto: string;
  erro: boolean;
}

const DURACAO_MS = 5000;

/** Aviso passageiro de sucesso ou erro, exibido no topo, longe da área de ação (`AvisoFlutuante`). */
export function useAviso() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fecharAviso = useCallback(() => {
    clearTimeout(timer.current);
    setAviso(null);
  }, []);

  const avisar = useCallback((texto: string, erro = false) => {
    clearTimeout(timer.current);
    setAviso({ texto, erro });
    timer.current = setTimeout(() => setAviso(null), DURACAO_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { aviso, avisar, fecharAviso };
}
