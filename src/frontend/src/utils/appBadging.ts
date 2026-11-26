type NavigatorComBadge = {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Atualiza o badge numérico do ícone do aplicativo (App Badging API) quando suportado.
 * Operação estritamente opcional: nunca lança exceção em navegadores sem suporte.
 */
export async function sincronizarAppBadge(total: number): Promise<void> {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as NavigatorComBadge;

  if (!Number.isFinite(total) || total <= 0) {
    await limparAppBadge();
    return;
  }

  if (typeof nav.setAppBadge !== 'function') return;
  try {
    await nav.setAppBadge(Math.floor(total));
  } catch {
    // Falhas de permissão ou ambiente sem suporte são ignoradas silenciosamente.
  }
}

/** Limpa o badge do ícone do aplicativo (usado ao zerar não lidas, sair da conta ou trocar sessão). */
export async function limparAppBadge(): Promise<void> {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as NavigatorComBadge;
  if (typeof nav.clearAppBadge !== 'function') return;
  try {
    await nav.clearAppBadge();
  } catch {
    // Ignora falhas de ambiente sem suporte.
  }
}
