import { useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

export function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('mb-4 flex flex-col gap-1.5', className)}>
      <label className="font-display text-sm font-semibold text-text-secondary" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string };

const BASE_INPUT_CLASSES =
  'min-h-[42px] w-full rounded-md border-[1.5px] border-border bg-surface px-3 py-2.5 font-sans text-sm text-text-secondary transition-colors duration-150 outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-surface-alt disabled:opacity-70 md:min-h-0 md:px-3.5';

export function Input({ label, className, id, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const input = <input id={inputId} className={cn(BASE_INPUT_CLASSES, className)} {...rest} />;
  return label ? (
    <Field label={label} htmlFor={inputId}>
      {input}
    </Field>
  ) : (
    input
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: string };

export function Select({ label, className, id, children, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const select = (
    <div className="relative w-full">
      <select
        id={selectId}
        className={cn(BASE_INPUT_CLASSES, 'appearance-none pr-9 cursor-pointer', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </div>
  );
  return label ? (
    <Field label={label} htmlFor={selectId}>
      {select}
    </Field>
  ) : (
    select
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string };

export function Textarea({ label, className, id, rows = 3, ...rest }: TextareaProps) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const textarea = (
    <textarea
      id={textareaId}
      rows={rows}
      className={cn(
        'w-full resize-y rounded-md border-[1.5px] border-border bg-surface px-3 py-2.5 font-sans text-sm text-text-secondary transition-colors duration-150 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:opacity-70 md:px-3.5',
        className,
      )}
      {...rest}
    />
  );
  return label ? (
    <Field label={label} htmlFor={textareaId}>
      {textarea}
    </Field>
  ) : (
    textarea
  );
}
