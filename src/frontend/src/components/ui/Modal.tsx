import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { CloseIcon } from './icons'

type ModalProps = {
  title: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  hideFooter?: boolean
  maxWidth?: string | number
  children: ReactNode
}

export function Modal({
  title,
  onClose,
  onConfirm,
  confirmLabel = 'Salvar',
  hideFooter = false,
  maxWidth,
  children,
}: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const showFooter = !hideFooter && onConfirm !== undefined

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={maxWidth ? { maxWidth } : undefined}>
        <button className="modal__close" onClick={onClose} aria-label="Fechar">
          <CloseIcon />
        </button>
        <h2 className="modal__title">{title}</h2>
        {children}
        {showFooter && (
          <div className="modal__footer">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        )}
      </div>
    </div>
  )
}
