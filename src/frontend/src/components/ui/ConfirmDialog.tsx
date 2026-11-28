import { useId } from 'react';
import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, Info } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { ModalFooter } from './ModalForm';
import { cn } from '../../utils/cn';

const confirmIconVariants = cva(
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
  {
    variants: {
      variant: {
        danger: 'bg-rose-50 text-rose-600',
        primary: 'bg-blue-50 text-blue-600',
      },
    },
    defaultVariants: {
      variant: 'danger',
    },
  }
);

export interface ConfirmDialogProps
  extends VariantProps<typeof confirmIconVariants> {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  gerenciarFoco?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  isLoading = false,
  gerenciarFoco = true,
}: ConfirmDialogProps) {
  const idDescricao = useId();
  const resolvedVariant = variant ?? 'danger';
  const isDanger = resolvedVariant === 'danger';

  return (
    <Modal
      gerenciarFoco={gerenciarFoco}
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      papel={isDanger ? 'alertdialog' : 'dialog'}
      descricaoId={idDescricao}
      bloquearFechamento={isLoading}
      maxWidth="26rem"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={cn(confirmIconVariants({ variant: resolvedVariant }))} aria-hidden="true">
            {isDanger ? <AlertTriangle size={20} /> : <Info size={20} />}
          </div>
          <div id={idDescricao} className="min-w-0 pt-1 text-sm leading-relaxed text-text-secondary">
            {description}
          </div>
        </div>

        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            // Em ações perigosas, o foco começa na opção que não destrói nada
            data-foco-inicial={isDanger ? true : undefined}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={isDanger ? 'danger' : 'primary'}
            onClick={() => void onConfirm()}
            disabled={isLoading}
          >
            {isLoading ? 'Processando...' : confirmLabel}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
