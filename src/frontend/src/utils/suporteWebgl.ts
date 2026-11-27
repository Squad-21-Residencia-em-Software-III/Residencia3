/**
 * Detecta de forma segura se o navegador atual suporta criação de contexto WebGL.
 * Libera o contexto imediatamente após o teste para não consumir slots da GPU.
 */
export function verificarSuporteWebgl(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  try {
    const canvas = document.createElement('canvas');
    const contexto =
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ??
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) ??
      canvas.getContext('experimental-webgl');

    if (!contexto) return false;

    const webgl = contexto as WebGLRenderingContext;
    const ext = typeof webgl.getExtension === 'function' ? webgl.getExtension('WEBGL_lose_context') : null;
    ext?.loseContext();
    return true;
  } catch {
    return false;
  }
}
