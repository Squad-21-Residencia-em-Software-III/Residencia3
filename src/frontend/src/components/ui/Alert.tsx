import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../utils/cn';

const alertVariants = cva(
  'flex items-start gap-3 rounded-lg border p-3.5 text-sm transition-all',
  {
    variants: {
      tone: {
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        danger: 'border-rose-200 bg-rose-50 text-rose-800',
        warning: 'border-amber-200 bg-amber-50 text-amber-800',
        info: 'border-blue-200 bg-blue-50 text-blue-800',
      },
    },
    defaultVariants: {
      tone: 'info',
    },
  }
);

export type AlertTone = NonNullable<VariantProps<typeof alertVariants>['tone']>;

export interface AlertProps extends VariantProps<typeof alertVariants> {
  children: ReactNode;
  title?: string;
  onClose?: () => void;
  className?: string;
}

const ALERT_ICONS: Record<AlertTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  danger: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export function Alert({
  children,
  tone = 'info',
  title,
  onClose,
  className,
}: AlertProps) {
  const resolvedTone: AlertTone = tone ?? 'info';
  const IconComponent = ALERT_ICONS[resolvedTone];

  return (
    <div role="alert" className={cn(alertVariants({ tone: resolvedTone }), className)}>
      <IconComponent className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <div className="mb-0.5 font-bold">{title}</div>}
        <div className="leading-relaxed font-medium">{children}</div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar alerta"
          className="-mt-1 -mr-1 shrink-0 rounded p-1 text-current opacity-70 transition-opacity hover:bg-black/5 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
