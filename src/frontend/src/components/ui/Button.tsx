import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white hover:bg-primary-hover',
        ghost: 'bg-transparent text-primary hover:bg-primary-soft',
        outline: 'border border-border-strong bg-surface text-text-strong hover:bg-surface-alt',
        danger: 'bg-danger text-white hover:bg-danger-strong',
        'danger-outline':
          'border border-danger bg-surface text-danger hover:border-danger-strong hover:bg-danger-soft hover:text-danger-strong',
      },
      size: {
        md: 'rounded-lg px-5 py-2.5 text-sm',
        sm: 'rounded-sm px-3.5 py-2 text-xs',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    children: ReactNode;
  };

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...rest}>
      {children}
    </button>
  );
}
