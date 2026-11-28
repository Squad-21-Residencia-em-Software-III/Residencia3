import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { AlertTriangle, Check, Circle, Diamond, Info, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

export type BadgeTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral' | 'purple';

// Cores pelos tokens (inclusive o anel), para acompanharem tema, alto contraste e paletas de daltonismo.
// A borda transparente aparece no modo de cores forçadas do sistema, quando fundos e anéis somem.
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 font-display text-xs font-semibold whitespace-nowrap ring-1 ring-inset',
  {
    variants: {
      tone: {
        success: 'bg-success-bg text-success ring-success/25',
        warning: 'bg-warning-bg text-warning ring-warning/25',
        info: 'bg-info-bg text-info ring-info/25',
        danger: 'bg-danger-bg text-danger-strong ring-danger/25',
        neutral: 'bg-neutral-bg text-neutral ring-border',
        purple: 'bg-purple-bg text-purple ring-purple/25',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

/**
 * Forma própria para cada tom (SCRUM-307): o status continua distinguível sem depender da cor, inclusive em
 * escala de cinza. O texto do selo segue sendo o que o leitor de tela lê.
 */
const ICONE_DO_TOM: Record<BadgeTone, LucideIcon> = {
  success: Check,
  danger: X,
  warning: AlertTriangle,
  info: Info,
  purple: Diamond,
  neutral: Circle,
};

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  const Icone = ICONE_DO_TOM[tone];
  return (
    <span className={cn(badgeVariants({ tone }), className)} data-tom={tone}>
      <Icone
        aria-hidden="true"
        className={cn('size-3 shrink-0', tone === 'neutral' && 'size-2 fill-current')}
        strokeWidth={tone === 'neutral' ? 2 : 3}
      />
      {children}
    </span>
  );
}

export function IdBadge({ id, className }: { id: string; className?: string }) {
  return (
    <span
      className={cn(
        'rounded-[6px] bg-neutral-bg px-2 py-1 font-mono text-xs font-semibold whitespace-nowrap text-text-strong',
        className,
      )}
    >
      {id}
    </span>
  );
}
