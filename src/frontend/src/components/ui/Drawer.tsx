import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CloseIcon } from './icons';
import { cn } from '../../utils/cn';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  width?: string;
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
}: DrawerProps) {
  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true);
        });
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
      const timer = setTimeout(() => {
        setMounted(false);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Tecla Escape para fechar
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mounted, onClose]);

  // Previne rolagem do fundo quando aberto
  useEffect(() => {
    if (mounted) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      {/* Backdrop com transição fade-in / fade-out suave */}
      <div
        className={cn(
          'fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-300',
          visible ? 'opacity-100 ease-out' : 'opacity-0 ease-in pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Painel Lateral com transição slide-in / slide-out suave premium */}
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 flex h-full w-full flex-col bg-surface sm:w-auto',
          'border-l border-divider shadow-[-16px_0_48px_rgba(0,0,0,0.16)]',
          'transform-gpu transition-transform duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]',
          visible ? 'translate-x-0' : 'translate-x-full pointer-events-none',
          width,
          className
        )}
      >
        {/* Cabeçalho */}
        <div className="flex shrink-0 items-start justify-between border-b border-divider px-6 py-5">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
                {title}
              </h2>
            </div>
            {subtitle && (
              <p className="mt-1 text-xs text-slate-500 font-sans">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-slate-400 transition-colors hover:bg-surface-hover hover:text-slate-700"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Corpo com rolagem própria */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {children}
        </div>

        {/* Rodapé fixo (opcional) */}
        {footer && (
          <div className="shrink-0 border-t border-divider bg-surface px-6 py-4">
            {footer}
          </div>
        )}
      </aside>
    </div>
  );
}

