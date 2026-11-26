import { useSyncExternalStore } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PERFIS } from '../types/usuario';

// Retrato e também o celular deitado, para girar a tela não trocar o layout no meio de um formulário
const CONSULTA_CELULAR = '(max-width: 767px), (max-height: 500px) and (any-pointer: coarse)';

const consultar = () =>
  typeof window.matchMedia === 'function' ? window.matchMedia(CONSULTA_CELULAR) : null;

function observar(aoMudar: () => void) {
  const consulta = consultar();
  consulta?.addEventListener('change', aoMudar);
  return () => consulta?.removeEventListener('change', aoMudar);
}

/** Motorista (Frota ou SVO) no celular: usa as telas de `pages/motorista`. */
export function useMotoristaMobile(): boolean {
  const { usuario } = useAuth();
  const celular = useSyncExternalStore(observar, () => consultar()?.matches ?? false);
  const motorista =
    usuario?.perfil === PERFIS.MOTORISTA_FROTA || usuario?.perfil === PERFIS.MOTORISTA_SVO;
  return motorista && celular;
}
