import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { CloseIcon } from './icons';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';

type ModalProps = {
  isOpen?: boolean;
  title: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  hideFooter?: boolean;
  maxWidth?: string | number;
  children: ReactNode;
  telaInteira?: boolean;
  gerenciarFoco?: boolean;
  ajustarAoTeclado?: boolean;
  bloquearFechamento?: boolean;
  /** Abre presa à parte de baixo da tela, ao alcance do polegar. */
  folhaInferior?: boolean;
};

export function Modal({
  isOpen,
  title,
  onClose,
  onConfirm,
  confirmLabel = 'Salvar',
  hideFooter = false,
  maxWidth,
  children,
  telaInteira = false,
  gerenciarFoco = false,
  ajustarAoTeclado = false,
  bloquearFechamento = false,
  folhaInferior = false,
}: ModalProps) {
  const fundo = useRef<HTMLDivElement>(null);
  const dialogo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const elemento = fundo.current;
    if (!ajustarAoTeclado || isOpen === false || !viewport || !elemento) return;
    // Em navegadores móveis o teclado pode reduzir só a área visual, sem mudar o layout.
    const ajustar = () => {
      elemento.style.top = `${viewport.offsetTop}px`;
      elemento.style.height = `${viewport.height}px`;
    };
    ajustar();
    viewport.addEventListener('resize', ajustar);
    viewport.addEventListener('scroll', ajustar);
    return () => {
      viewport.removeEventListener('resize', ajustar);
      viewport.removeEventListener('scroll', ajustar);
      elemento.style.removeProperty('top');
      elemento.style.removeProperty('height');
    };
  }, [ajustarAoTeclado, isOpen]);

  useEffect(() => {
    if (!gerenciarFoco || isOpen === false || !dialogo.current) return;
    const modal = dialogo.current;
    const acionador = document.activeElement;
    const controles = () => [...modal.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], [tabindex]',
    )].filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.hidden && el.getClientRects().length);
    const aoPressionarTab = (evento: KeyboardEvent) => {
      if (evento.key !== 'Tab') return;
      const itens = controles();
      const atual = itens.indexOf(document.activeElement as HTMLElement);
      if (!itens.length || atual === -1 || (evento.shiftKey ? atual === 0 : atual === itens.length - 1)) {
        evento.preventDefault();
        (itens[evento.shiftKey ? itens.length - 1 : 0] ?? modal).focus();
      }
    };
    (controles()[0] ?? modal).focus();
    document.addEventListener('keydown', aoPressionarTab);
    return () => {
      document.removeEventListener('keydown', aoPressionarTab);
      if (acionador instanceof HTMLElement && acionador.isConnected) acionador.focus();
    };
  }, [isOpen, gerenciarFoco]);

  useEffect(() => {
    if (isOpen === false || bloquearFechamento) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, bloquearFechamento]);

  if (isOpen === false) return null;

  const showFooter = !hideFooter && onConfirm !== undefined;

  const conteudo = (
    <div
      ref={fundo}
      className={cn(
        'fixed inset-x-0 top-0 z-50 flex items-center justify-center bg-[#0d1b35]/45 backdrop-blur-[3px]',
        ajustarAoTeclado
          ? 'h-dvh px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]'
          : 'bottom-0',
        folhaInferior && 'items-end px-0 pb-0',
      )}
      onClick={(e) => !bloquearFechamento && e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          'relative mx-auto max-h-[88vh] w-[95vw] max-w-[95vw] overflow-y-auto rounded-lg bg-surface px-4 py-5 shadow-modal md:mx-4 md:max-h-[90vh] md:w-full md:max-w-[480px] md:rounded-modal md:p-8',
          ajustarAoTeclado && 'max-h-full w-full max-w-full overscroll-contain wrap-anywhere md:max-h-full',
          folhaInferior &&
            'mx-auto w-full max-w-[560px] rounded-t-modal rounded-b-none md:mx-auto md:w-full md:max-w-[560px] md:rounded-b-none md:px-4 md:py-5',
        )}
        ref={dialogo}
        tabIndex={gerenciarFoco ? -1 : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={maxWidth ? { maxWidth } : undefined}
      >
        <button
          type="button"
          className={cn(
            'absolute top-5 right-5 flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-text-muted transition-colors hover:bg-surface-hover disabled:opacity-60',
            ajustarAoTeclado && 'top-2 right-2 size-11 md:top-5 md:right-5',
          )}
          onClick={onClose}
          aria-label="Fechar"
          disabled={bloquearFechamento}
        >
          <CloseIcon />
        </button>
        <h2 className="mb-4 pr-8 text-[17px] font-bold tracking-[-0.01em] text-text md:mb-6 md:text-xl">
          {title}
        </h2>
        {children}
        {showFooter && (
          <div className="mt-4 flex flex-col-reverse justify-end gap-2 border-t border-divider pt-4 md:mt-6 md:flex-row md:gap-3 md:pt-5 [&>button]:w-full [&>button]:justify-center md:[&>button]:w-auto">
            <Button variant="ghost" onClick={onClose} disabled={bloquearFechamento}>
              Cancelar
            </Button>
            <Button onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        )}
      </div>
    </div>
  );
  return telaInteira ? createPortal(conteudo, document.body) : conteudo;
}
