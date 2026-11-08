import type { FormEvent, ReactNode } from 'react';
import { Button } from './Button';
import { cn } from '../../utils/cn';

export interface ModalFormProps {
  children: ReactNode;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  className?: string;
}

export function ModalForm({ children, onSubmit, className }: ModalFormProps) {
  return (
    <form onSubmit={onSubmit} noValidate className={cn('flex flex-col gap-4.5', className)}>
      {children}
    </form>
  );
}

export interface FormRowProps {
  children: ReactNode;
  className?: string;
  columns?: 2 | 3;
}

export function FormRow({ children, className, columns = 2 }: FormRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4',
        columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ModalFooterProps {
  children?: ReactNode;
  onCancel?: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ModalFooter({
  children,
  onCancel,
  cancelLabel = 'Cancelar',
  confirmLabel = 'Salvar',
  confirmVariant = 'primary',
  loading = false,
  disabled = false,
  className,
}: ModalFooterProps) {
  return (
    <div
      className={cn(
        'mt-2 flex flex-col-reverse justify-end gap-2.5 border-t border-border pt-4 sm:flex-row sm:items-center sm:gap-3',
        className,
      )}
    >
      {children ? (
        children
      ) : (
        <>
          {onCancel && (
            <Button variant="outline" type="button" onClick={onCancel} disabled={loading}>
              {cancelLabel}
            </Button>
          )}
          <Button variant={confirmVariant} type="submit" disabled={disabled || loading}>
            {loading ? 'Salvando...' : confirmLabel}
          </Button>
        </>
      )}
    </div>
  );
}

