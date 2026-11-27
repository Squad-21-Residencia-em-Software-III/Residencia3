import { useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

/** Textos de apoio e de erro ligados ao campo (SCRUM-306): o leitor de tela lê junto com o rótulo. */
type Apoio = {
  /** Orientação sobre o preenchimento, sempre visível. */
  descricao?: ReactNode;
  /** Erro de validação. Marca o campo como inválido. */
  erro?: ReactNode;
};

function idsDeApoio(base: string, { descricao, erro }: Apoio) {
  return {
    descricao: descricao ? `${base}-descricao` : undefined,
    erro: erro ? `${base}-erro` : undefined,
  };
}

function TextosDeApoio({ base, descricao, erro }: Apoio & { base: string }) {
  const ids = idsDeApoio(base, { descricao, erro });
  return (
    <>
      {descricao && (
        <p id={ids.descricao} className="m-0 text-xs text-text-muted">
          {descricao}
        </p>
      )}
      {erro && (
        <p id={ids.erro} className="m-0 text-xs font-semibold text-danger-strong">
          {erro}
        </p>
      )}
    </>
  );
}

/** Atributos de acessibilidade do controle, preservando um `aria-describedby` vindo de quem usa. */
function ariaDoControle(
  base: string,
  apoio: Apoio,
  proprios: { 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling' },
) {
  const ids = idsDeApoio(base, apoio);
  const descritos = [proprios['aria-describedby'], ids.descricao, ids.erro].filter(Boolean).join(' ');
  return {
    'aria-describedby': descritos || undefined,
    'aria-invalid': apoio.erro ? true : proprios['aria-invalid'],
  };
}

export function Field({
  label,
  htmlFor,
  className,
  children,
  descricao,
  erro,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
} & Apoio) {
  return (
    <div className={cn('mb-4 flex flex-col gap-1.5', className)}>
      <label className="font-display text-sm font-semibold text-text-secondary" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {htmlFor && <TextosDeApoio base={htmlFor} descricao={descricao} erro={erro} />}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string } & Apoio;

// Foco: além da borda, um anel (a cor sozinha não basta para indicar foco; WCAG 2.4.7 e 1.4.11)
const BASE_INPUT_CLASSES =
  'min-h-[42px] w-full rounded-md border-[1.5px] border-border bg-surface px-3 py-2.5 font-sans text-sm text-text-secondary transition-colors duration-150 outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/35 aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-surface-alt disabled:opacity-70 md:min-h-0 md:px-3.5';

export function Input({ label, className, id, descricao, erro, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const apoio = { descricao, erro };
  const input = (
    <input
      id={inputId}
      className={cn(BASE_INPUT_CLASSES, className)}
      {...rest}
      {...ariaDoControle(inputId, apoio, rest)}
    />
  );
  if (label) {
    return (
      <Field label={label} htmlFor={inputId} {...apoio}>
        {input}
      </Field>
    );
  }
  return descricao || erro ? (
    <>
      {input}
      <TextosDeApoio base={inputId} {...apoio} />
    </>
  ) : (
    input
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: string } & Apoio;

export function Select({ label, className, id, children, descricao, erro, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const apoio = { descricao, erro };
  const select = (
    <div className="relative w-full">
      <select
        id={selectId}
        className={cn(BASE_INPUT_CLASSES, 'appearance-none pr-9 cursor-pointer', className)}
        {...rest}
        {...ariaDoControle(selectId, apoio, rest)}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </div>
  );
  if (label) {
    return (
      <Field label={label} htmlFor={selectId} {...apoio}>
        {select}
      </Field>
    );
  }
  return descricao || erro ? (
    <>
      {select}
      <TextosDeApoio base={selectId} {...apoio} />
    </>
  ) : (
    select
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string } & Apoio;

export function Textarea({ label, className, id, rows = 3, descricao, erro, ...rest }: TextareaProps) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const apoio = { descricao, erro };
  const textarea = (
    <textarea
      id={textareaId}
      rows={rows}
      className={cn(
        'w-full resize-y rounded-md border-[1.5px] border-border bg-surface px-3 py-2.5 font-sans text-sm text-text-secondary transition-colors duration-150 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-surface-alt disabled:opacity-70 md:px-3.5',
        className,
      )}
      {...rest}
      {...ariaDoControle(textareaId, apoio, rest)}
    />
  );
  if (label) {
    return (
      <Field label={label} htmlFor={textareaId} {...apoio}>
        {textarea}
      </Field>
    );
  }
  return descricao || erro ? (
    <>
      {textarea}
      <TextosDeApoio base={textareaId} {...apoio} />
    </>
  ) : (
    textarea
  );
}
