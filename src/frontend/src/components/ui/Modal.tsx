import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { CloseIcon } from './icons';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import { ContextoDialogo, useDialogoAcessivel } from '../../hooks/useDialogoAcessivel';
import { Button } from './Button';
import { ModalFooter } from './ModalForm';

type ModalProps = {
  isOpen?: boolean;
  title: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  hideFooter?: boolean;
  maxWidth?: string | number;
  children: ReactNode;
  /** Foco entra no diálogo, fica preso nele e volta para quem abriu (padrão). false só para casos antigos. */
  gerenciarFoco?: boolean;
  ajustarAoTeclado?: boolean;
  bloquearFechamento?: boolean;
  /** Abre presa à parte de baixo da tela, ao alcance do polegar. */
  folhaInferior?: boolean;
  /** `alertdialog` para confirmações que interrompem (ex.: excluir). */
  papel?: 'dialog' | 'alertdialog';
  /** Id do texto que explica o diálogo, lido junto com o título. */
  descricaoId?: string;
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
  gerenciarFoco = true,
  ajustarAoTeclado = true,
  bloquearFechamento = false,
  folhaInferior = false,
  papel = 'dialog',
  descricaoId,
}: ModalProps) {
  const idTitulo = useId();
  const fundo = useRef<HTMLDivElement>(null);
  const dialogo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const elemento = fundo.current;
    if (!ajustarAoTeclado || isOpen === false || !viewport || !elemento) return;
    // Em navegadores móveis o teclado pode reduzir só a área visual, sem mudar o layout.
    const ajustar = () => {
      elemento.style.top = `${viewport.offsetTop}px`;
      elemento.style.left = `${viewport.offsetLeft}px`;
      elemento.style.width = `${viewport.width}px`;
      elemento.style.height = `${viewport.height}px`;
    };
    ajustar();
    viewport.addEventListener('resize', ajustar);
    viewport.addEventListener('scroll', ajustar);
    return () => {
      viewport.removeEventListener('resize', ajustar);
      viewport.removeEventListener('scroll', ajustar);
      elemento.style.removeProperty('top');
      elemento.style.removeProperty('left');
      elemento.style.removeProperty('width');
      elemento.style.removeProperty('height');
    };
  }, [ajustarAoTeclado, isOpen]);

  const contexto = useDialogoAcessivel({
    aberto: isOpen !== false,
    dialogo,
    camada: fundo,
    aoFechar: onClose,
    fecharComEscape: !bloquearFechamento,
    gerenciarFoco,
  });

  if (isOpen === false) return null;

  const showFooter = !hideFooter && onConfirm !== undefined;

  return createPortal(
    <div
      ref={fundo}
      className={cn(
        'fixed inset-0 z-120 flex items-center justify-center overscroll-none bg-[#0d1b35]/45 backdrop-blur-[3px]',
        'pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]',
        folhaInferior ? 'items-end pb-0' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
      )}
      onClick={(e) => !bloquearFechamento && e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          'flex max-h-full w-full min-w-0 flex-col overflow-hidden rounded-modal border border-border bg-surface wrap-anywhere shadow-modal',
          folhaInferior && 'rounded-b-none',
        )}
        ref={dialogo}
        tabIndex={-1}
        role={papel}
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descricaoId}
        style={{ maxWidth: maxWidth ?? (folhaInferior ? '35rem' : '30rem') }}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-divider px-4 py-2 sm:px-6">
          <h2 id={idTitulo} className="min-w-0 self-center text-lg leading-tight font-bold tracking-tight text-text">
            {title}
          </h2>
          <button
            type="button"
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
            onClick={onClose}
            aria-label="Fechar"
            data-fechar-dialogo
            disabled={bloquearFechamento}
          >
            <CloseIcon />
          </button>
        </div>
        <div
          data-corpo-modal
          className={cn(
            'min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5',
            folhaInferior && 'pb-[max(1rem,env(safe-area-inset-bottom))]',
          )}
        >
          <ContextoDialogo value={contexto}>{children}</ContextoDialogo>
          {showFooter && (
            <ModalFooter>
              <Button variant="ghost" type="button" onClick={onClose} disabled={bloquearFechamento}>
                Cancelar
              </Button>
              <Button type="button" onClick={onConfirm}>{confirmLabel}</Button>
            </ModalFooter>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
