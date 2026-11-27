import { useState } from 'react';
import { BellOff, BellRing, Smartphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAssinaturaPush } from '../../hooks/useAssinaturaPush';
import { usePermissoesDispositivo } from '../../hooks/usePermissoesDispositivo';

function detectarIosForaDoPwa(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const ehIos = /iPad|iPhone|iPod/.test(ua);
  if (!ehIos) return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone =
    nav.standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches);
  return !standalone;
}

interface FaixaAlertasPushSinoProps {
  online: boolean;
}

/**
 * Faixa contextual de ativação de Web Push dentro do dropdown do sino.
 * Deve ser montada apenas quando o dropdown está aberto e a flag `webPush` está ativa,
 * reutilizando o fluxo oficial da SCRUM-238 (`useAssinaturaPush`).
 */
export function FaixaAlertasPushSino({ online }: FaixaAlertasPushSinoProps) {
  const [dispensada, setDispensada] = useState(false);
  const { usuario } = useAuth();
  const { notificacoes: permissao, solicitarNotificacoes } = usePermissoesDispositivo();
  const push = useAssinaturaPush({
    usuarioId: usuario?.id,
    online,
    permissao,
    solicitarPermissao: solicitarNotificacoes,
  });

  const iosForaDoPwa = detectarIosForaDoPwa();

  if (push.situacao === 'indisponivel' && iosForaDoPwa) {
    return (
      <div className="flex items-start gap-2 border-b border-divider bg-info-bg/60 px-3.5 py-2 text-xs text-info">
        <Smartphone size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          No iPhone/iPad, adicione o app à Tela de Início para receber alertas do aparelho.
        </span>
      </div>
    );
  }

  if (push.situacao === 'bloqueada') {
    return (
      <div className="flex items-center gap-2 border-b border-divider bg-neutral-bg px-3.5 py-2 text-xs text-neutral">
        <BellOff size={14} className="shrink-0" aria-hidden="true" />
        <span>Alertas do navegador bloqueados. A central In-App continua ativa.</span>
      </div>
    );
  }

  if (push.situacao === 'inativa' && !dispensada) {
    return (
      <div className="border-b border-divider bg-primary-soft/80 px-3.5 py-2 text-xs text-text-secondary">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BellRing size={14} className="shrink-0 text-primary" aria-hidden="true" />
            <span>Ative alertas neste aparelho para avisos urgentes.</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={!online || push.ocupado}
              onClick={() => void push.ligar()}
              className="cursor-pointer rounded-md bg-primary px-2 py-1 font-display text-[0.6875rem] font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {push.ocupado ? 'Ativando...' : 'Ativar'}
            </button>
            <button
              type="button"
              onClick={() => setDispensada(true)}
              aria-label="Dispensar aviso de alertas"
              className="cursor-pointer rounded-md px-1.5 py-1 text-[0.6875rem] text-text-muted hover:text-text"
            >
              Agora não
            </button>
          </div>
        </div>
        {push.erro && (
          <p role="alert" className="mt-1.5 text-[0.6875rem] text-danger-strong">
            {push.erro}
          </p>
        )}
      </div>
    );
  }

  return null;
}
