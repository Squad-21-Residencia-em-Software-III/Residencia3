import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { CloseIcon } from './icons';

type ModalProps = {
  isOpen?: boolean;
  title: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  hideFooter?: boolean;
  maxWidth?: string | number;
  children: ReactNode;
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
}: ModalProps) {
  useEffect(() => {
    if (isOpen === false) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (isOpen === false) return null;

  const showFooter = !hideFooter && onConfirm !== undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d1b35]/45 backdrop-blur-[3px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative mx-auto max-h-[88vh] w-[95vw] max-w-[95vw] overflow-y-auto rounded-lg bg-surface px-4 py-5 shadow-modal md:mx-4 md:max-h-[90vh] md:w-full md:max-w-[480px] md:rounded-modal md:p-8"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={maxWidth ? { maxWidth } : undefined}
      >
        <button
          type="button"
          className="absolute top-5 right-5 flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-text-muted transition-colors hover:bg-surface-hover"
          onClick={onClose}
          aria-label="Fechar"
        >
          <CloseIcon />
        </button>
        <h2 className="mb-4 pr-8 text-[17px] font-bold tracking-[-0.01em] text-text md:mb-6 md:text-xl">
          {title}
        </h2>
        {children}
        {showFooter && (
          <div className="mt-4 flex flex-col-reverse justify-end gap-2 border-t border-divider pt-4 md:mt-6 md:flex-row md:gap-3 md:pt-5 [&>button]:w-full [&>button]:justify-center md:[&>button]:w-auto">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
