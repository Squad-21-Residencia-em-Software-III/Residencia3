import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface CheckboxProps extends Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'children'> {
  children: ReactNode;
}

export function Checkbox({ children, disabled, className, ...props }: CheckboxProps) {
  return (
    <label className={cn('flex items-start gap-2 text-sm text-text', disabled && 'text-text-muted', className)}>
      <input
        {...props}
        type="checkbox"
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
      />
      <span>{children}</span>
    </label>
  );
}
