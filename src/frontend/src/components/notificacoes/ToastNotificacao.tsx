import { useEffect } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificacoesOpcional } from '../../contexts/NotificacoesContext';
import type { SeveridadeNotificacao } from '../../types/notificacao';
import { cn } from '../../utils/cn';
import { resolverDestinoNotificacao } from '../../utils/destinoNotificacao';

const DURACAO_TOAST_MS = 8_000;

const ESTILO_TOAST: Record<SeveridadeNotificacao, { caixa: string; Icone: typeof Info }> = {
  info: { caixa: 'bg-info-bg text-info', Icone: Info },
  success: { caixa: 'bg-success-bg text-success', Icone: CheckCircle2 },
  warning: { caixa: 'bg-warning-bg text-warning', Icone: AlertTriangle },
  danger: { caixa: 'bg-danger-bg text-danger-strong', Icone: AlertOctagon },
};

/**
 * Toast flutuante para notificações recebidas com o aplicativo aberto em primeiro plano.
 * Deduplicado por `id` no `NotificacoesContext`.
 */
export function ToastNotificacao() {
  const ctx = useNotificacoesOpcional();
  const { usuario } = useAuth();
  const navigate = useNavigate();

  const toast = ctx?.toastAtivo ?? null;
  const fecharToast = ctx?.fecharToast;
  const marcarLida = ctx?.marcarLida;

  useEffect(() => {
    if (!toast || !fecharToast) return;
    const timer = window.setTimeout(() => fecharToast(), DURACAO_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, fecharToast]);

  if (!toast || !fecharToast) return null;

  const { caixa, Icone } = ESTILO_TOAST[toast.severidade ?? 'info'] ?? ESTILO_TOAST.info;

  const aoAbrir = () => {
    const { url } = resolverDestinoNotificacao(toast.url_destino, usuario?.perfil);
    if (typeof toast.id === 'number' && marcarLida) {
      void marcarLida(toast.id);
    }
    fecharToast();
    navigate(url);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast-notificacao"
      className="fixed right-4 bottom-20 z-70 w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-border bg-surface p-3.5 text-text shadow-xl md:bottom-5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', caixa)}
        >
          <Icone size={16} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-display text-xs font-bold text-text">{toast.titulo}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-secondary">
            {toast.mensagem}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={aoAbrir}
              className="cursor-pointer rounded-md bg-primary px-2.5 py-1 font-display text-xs font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Abrir
            </button>
            <button
              type="button"
              onClick={fecharToast}
              className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
            >
              Dispensar
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={fecharToast}
          aria-label="Fechar notificação"
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
