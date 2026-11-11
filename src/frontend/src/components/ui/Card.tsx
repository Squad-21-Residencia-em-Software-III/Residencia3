import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cn(
        'max-w-full min-w-0 rounded-lg border border-card-border bg-surface shadow-card md:rounded-xl',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
