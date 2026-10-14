import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { CloseIcon } from './icons'

type ModalProps = {
  title: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  children: ReactNode
}

export function Modal({ title, onClose, onConfirm, confirmLabel = 'Salvar', children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <button className="modal__close" onClick={onClose} aria-label="Fechar">
          <CloseIcon />
        </button>
        <h2 className="modal__title">{title}</h2>
        {children}
        <div className="modal__footer">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onConfirm ?? onClose}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
