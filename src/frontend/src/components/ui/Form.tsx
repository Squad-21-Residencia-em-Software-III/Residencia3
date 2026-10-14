import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string }

export function Input({ label, className = '', id, ...rest }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const input = <input id={inputId} className={`input ${className}`.trim()} {...rest} />
  return label ? (
    <Field label={label} htmlFor={inputId}>
      {input}
    </Field>
  ) : (
    input
  )
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: string }

export function Select({ label, className = '', id, children, ...rest }: SelectProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  const select = (
    <select id={selectId} className={`input select ${className}`.trim()} {...rest}>
      {children}
    </select>
  )
  return label ? (
    <Field label={label} htmlFor={selectId}>
      {select}
    </Field>
  ) : (
    select
  )
}
