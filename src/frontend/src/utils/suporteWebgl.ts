/**
 * Verifica se o navegador pode criar o contexto WebGL 2 exigido pelo MapLibre.
 * Libera o contexto de teste após a detecção.
 */
export function verificarSuporteWebgl(): boolean {
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    const contexto = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!contexto) return false;

    contexto.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
