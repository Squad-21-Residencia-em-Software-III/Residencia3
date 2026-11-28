import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CloseIcon } from './icons';
import { cn } from '../../utils/cn';
import { createPortal } from 'react-dom';
import { ContextoDialogo, useDialogoAcessivel } from '../../hooks/useDialogoAcessivel';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  width?: string;
  telaInteira?: boolean;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className,
  width = 'max-w-lg',
  telaInteira = false,
}: DrawerProps) {
  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(false);
  const painel = useRef<HTMLDivElement>(null);
  const camada = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idSubtitulo = useId();

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      let segundoFrame: number | undefined;
      const raf = requestAnimationFrame(() => {
        segundoFrame = requestAnimationFrame(() => {
          setVisible(true);
        });
      });
      return () => {
        cancelAnimationFrame(raf);
        if (segundoFrame !== undefined) cancelAnimationFrame(segundoFrame);
      };
    } else {
      setVisible(false);
      const timer = setTimeout(() => {
        setMounted(false);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Foco dentro do painel, Escape só no de cima e foco de volta para quem abriu (SCRUM-306). Solto já no
  // início da animação de fechar
  const contexto = useDialogoAcessivel({ aberto: mounted && isOpen, dialogo: painel, camada, aoFechar: onClose });

  if (!mounted) return null;

  return createPortal(
    <div ref={camada} className="pointer-events-none fixed inset-0 z-120 flex justify-end overflow-hidden">
      {/* Backdrop com transição fade-in / fade-out suave */}
      <div
        className={cn(
          'fixed inset-0 transition-opacity duration-300',
          telaInteira ? 'bg-[#0d1b35]/45 backdrop-blur-[3px]' : 'bg-slate-950/40 backdrop-blur-[2px]',
          visible ? 'opacity-100 ease-out' : 'opacity-0 ease-in',
          visible && isOpen && 'pointer-events-auto'
        )}
        onClick={onClose}
        aria-hidden="true"
        data-fundo-dialogo
      />

      {/* Painel Lateral com transição slide-in / slide-out suave premium */}
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        inert={!isOpen}
        aria-hidden={isOpen ? undefined : true}
        aria-labelledby={idTitulo}
        aria-describedby={subtitle ? idSubtitulo : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex h-full w-full flex-col bg-surface sm:w-auto',
          'border-l border-divider shadow-[-16px_0_48px_rgba(0,0,0,0.16)]',
          'transform-gpu transition-transform duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]',
          visible ? 'translate-x-0' : 'translate-x-full',
          visible && isOpen && 'pointer-events-auto',
          width,
          className
        )}
      >
        {/* Cabeçalho */}
        <div className="flex shrink-0 items-start justify-between border-b border-divider px-6 py-5">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 id={idTitulo} className="font-display text-xl font-bold tracking-tight text-slate-900">
                {title}
              </h2>
            </div>
            {subtitle && (
              <p id={idSubtitulo} className="mt-1 text-xs text-slate-500 font-sans">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
            data-fechar-dialogo
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-700 [[data-layout=motorista]_&]:size-11"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Corpo com rolagem própria */}
        <ContextoDialogo value={contexto}>
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">
            {children}
          </div>

          {/* Rodapé fixo (opcional) */}
          {footer && (
            <div className="shrink-0 border-t border-divider bg-surface px-6 py-4">
              {footer}
            </div>
          )}
        </ContextoDialogo>
      </div>
    </div>,
    document.body,
  );
}

