import { useEffect, useId, useRef, useState } from 'react';
import { BellIcon } from '../ui';
import { cn } from '../../utils/cn';

export type NotificacaoItem = {
  id: string;
  titulo: string;
  descricao?: string;
  /** Texto já formatado, ex.: "há 5 min". */
  quando?: string;
  lida?: boolean;
};

type SinoNotificacoesProps = {
  /** Lista vinda da integração real de notificações (SCRUM-223). Vazia enquanto não houver fonte. */
  notificacoes?: NotificacaoItem[];
  className?: string;
};

export function rotuloBadge(total: number): string {
  return total > 99 ? '99+' : String(total);
}

/**
 * Sino de notificações do cabeçalho: botão com badge e dropdown com ponta.
 * Fecha com Escape (devolvendo o foco ao sino), clique fora ou perda de foco por Tab.
 */
export function SinoNotificacoes({ notificacoes = [], className }: SinoNotificacoesProps) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painelId = useId();

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  useEffect(() => {
    if (!aberto) return;

    const aoPressionarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    };
    const aoClicarFora = (evento: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    };

    document.addEventListener('keydown', aoPressionarTecla);
    document.addEventListener('pointerdown', aoClicarFora);
    return () => {
      document.removeEventListener('keydown', aoPressionarTecla);
      document.removeEventListener('pointerdown', aoClicarFora);
    };
  }, [aberto]);

  const rotuloAcessivel =
    naoLidas > 0
      ? `Notificações, ${naoLidas > 99 ? 'mais de 99' : naoLidas} não lidas`
      : 'Notificações';

  return (
    <div
      ref={raiz}
      className={cn('relative', className)}
      onBlur={(evento) => {
        // Tab para fora do componente fecha o dropdown.
        if (aberto && !raiz.current?.contains(evento.relatedTarget as Node | null)) {
          if (evento.relatedTarget) setAberto(false);
        }
      }}
    >
      <button
        ref={botao}
        type="button"
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-text-muted transition-all hover:border-border-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label={rotuloAcessivel}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? painelId : undefined}
        title="Notificações"
        onClick={() => setAberto((a) => !a)}
      >
        <BellIcon />
        {naoLidas > 0 && (
          <span
            data-testid="badge-notificacoes"
            aria-hidden="true"
            className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger-strong px-1 text-[10px] leading-none font-bold text-white ring-2 ring-surface"
          >
            {rotuloBadge(naoLidas)}
          </span>
        )}
      </button>

      {aberto && (
        <div
          id={painelId}
          role="dialog"
          aria-label="Notificações"
          className="fixed inset-x-3 top-16 z-60 rounded-lg border border-border bg-surface text-text shadow-xl md:absolute md:inset-x-auto md:top-full md:right-0 md:mt-2.5 md:w-88"
        >
          {/* Ponta apontando para o sino */}
          <span
            aria-hidden="true"
            className="absolute -top-1.5 right-[58px] h-3 w-3 rotate-45 border-t border-l border-border bg-surface md:right-3"
          />
          <div className="relative rounded-lg bg-surface">
            <p className="border-b border-divider px-3.5 py-2.5 font-display text-sm font-semibold">
              Notificações
            </p>
            {notificacoes.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-xs text-text-muted">
                Você não tem notificações no momento.
              </p>
            ) : (
              <ul className="m-0 max-h-80 list-none overflow-y-auto p-0">
                {notificacoes.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      'border-b border-divider px-3.5 py-2.5 last:border-b-0',
                      !n.lida && 'bg-info-bg/40',
                    )}
                  >
                    <p className="text-xs font-semibold text-text">{n.titulo}</p>
                    {n.descricao && (
                      <p className="mt-0.5 text-xs text-text-muted">{n.descricao}</p>
                    )}
                    {n.quando && <p className="mt-1 text-xs text-text-muted">{n.quando}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
