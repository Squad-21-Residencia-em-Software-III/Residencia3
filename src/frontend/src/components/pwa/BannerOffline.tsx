import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

/**
 * Faixa discreta exibida quando o dispositivo perde conexão com a internet.
 */
export function BannerOffline() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b border-amber-300 bg-warning-bg px-3 py-1.5 text-xs font-medium text-warning"
    >
      <WifiOff size={14} className="shrink-0" aria-hidden="true" />
      <span>
        Sem conexão com a internet. Verifique sua rede antes de enviar ou atualizar dados.
      </span>
    </div>
  );
}
