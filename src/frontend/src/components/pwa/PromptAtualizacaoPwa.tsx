import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui';

/**
 * Toast/banner exibido quando há uma nova versão do PWA aguardando ativação.
 * Usa registerType: 'prompt' para evitar recarregar a página no meio de um formulário.
 */
export function PromptAtualizacaoPwa() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed right-4 bottom-4 left-4 z-110 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-xl md:left-auto md:max-w-md"
    >
      <div className="flex items-center gap-2.5 text-xs text-text">
        <RefreshCw size={16} className="shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-display font-semibold text-text">Nova versão disponível</p>
          <p className="text-text-muted">Atualize para carregar as últimas melhorias.</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setNeedRefresh(false)}
        >
          Depois
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => void updateServiceWorker(true)}
        >
          Atualizar
        </Button>
      </div>
    </div>
  );
}
