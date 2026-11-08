import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  containerClassName?: string;
}

export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder = 'Buscar...',
  className,
  containerClassName,
  ...props
}: SearchInputProps) {
  return (
    <div
      className={cn(
        'relative flex w-full min-w-[200px] items-center sm:w-72 md:w-80',
        containerClassName,
      )}
    >
      <Search size={14} className="pointer-events-none absolute left-3 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-8 text-[13px] text-slate-900 placeholder:text-slate-400',
          'transition-colors duration-150 outline-none focus:border-primary focus:ring-1 focus:ring-primary',
          className,
        )}
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('');
            onClear?.();
          }}
          className="absolute right-2.5 flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Limpar busca"
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  options?: FilterSelectOption[];
  containerClassName?: string;
}

export function FilterSelect({
  value,
  onChange,
  options,
  children,
  className,
  containerClassName,
  ...props
}: FilterSelectProps) {
  return (
    <div className={cn('relative w-full min-w-[150px] sm:w-auto', containerClassName)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 w-full cursor-pointer appearance-none rounded-md border border-slate-200 bg-white pl-3 pr-8 text-[13px] font-medium text-slate-900',
          'transition-colors duration-150 outline-none focus:border-primary focus:ring-1 focus:ring-primary',
          className,
        )}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </div>
  );
}

