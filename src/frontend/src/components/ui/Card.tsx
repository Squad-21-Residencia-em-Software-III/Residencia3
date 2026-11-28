import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export const CLASSES_CARD = 'max-w-full min-w-0 rounded-lg border border-card-border bg-surface shadow-card md:rounded-xl';

export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cn(
        CLASSES_CARD,
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
