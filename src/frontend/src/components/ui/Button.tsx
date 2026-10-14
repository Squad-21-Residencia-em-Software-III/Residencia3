import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline'
  size?: 'md' | 'sm'
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }: ButtonProps) {
  const classes = `btn btn--${variant} ${size === 'sm' ? 'btn--sm' : ''} ${className}`.trim()
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  )
}
