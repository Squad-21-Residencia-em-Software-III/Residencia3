import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white hover:bg-primary-hover shadow-xs hover:shadow-sm',
        ghost: 'bg-transparent text-primary hover:bg-primary-soft',
        outline:
          'border border-border-strong bg-surface text-text-strong hover:border-primary/50 hover:bg-primary-soft/60 hover:text-primary',
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

export type ButtonProps = ComponentPropsWithRef<'button'> &
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
