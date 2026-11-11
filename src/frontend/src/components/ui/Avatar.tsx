import { cn } from '../../utils/cn';

export function Avatar({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const hue = ((name.charCodeAt(0) || 0) * 37) % 360;

  return (
    <span
      className={cn(
        'avatar inline-flex shrink-0 items-center justify-center rounded-full font-display text-xs font-bold text-white',
        className,
      )}
      style={{ width: `${size}px`, height: `${size}px`, background: `hsl(${hue}, 55%, 42%)` }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
