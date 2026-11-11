import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, Info } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
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
}: ConfirmDialogProps) {
  const resolvedVariant = variant ?? 'danger';
  const isDanger = resolvedVariant === 'danger';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={cn(confirmIconVariants({ variant: resolvedVariant }))}>
            {isDanger ? <AlertTriangle size={20} /> : <Info size={20} />}
          </div>
          <div className="pt-1 text-sm leading-relaxed text-slate-600">
            {description}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2.5 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={isDanger ? 'danger' : 'primary'}
            onClick={() => void onConfirm()}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? 'Processando...' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
