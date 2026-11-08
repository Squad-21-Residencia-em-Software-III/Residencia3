import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type BadgeTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral' | 'purple';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-xs font-semibold whitespace-nowrap ring-1 ring-inset',
  {
    variants: {
      tone: {
        success: 'bg-success-bg text-success ring-[#bbf7d0]',
        warning: 'bg-warning-bg text-warning ring-[#fde68a]',
        info: 'bg-info-bg text-info ring-[#bfdbfe]',
        danger: 'bg-danger-bg text-danger-strong ring-[#fecaca]',
        neutral: 'bg-neutral-bg text-neutral ring-[#e2e8f0]',
        purple: 'bg-purple-bg text-purple ring-[#e9d5ff]',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

const badgeDotStyles: Record<BadgeTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  danger: 'bg-danger-strong',
  neutral: 'bg-neutral',
  purple: 'bg-purple',
};

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', className, children }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', badgeDotStyles[tone])} />
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
