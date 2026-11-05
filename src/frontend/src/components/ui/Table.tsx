import type { ReactNode } from 'react'
import { Button } from './Button'
import { FilterIcon, PlusIcon } from './icons'

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="table-wrapper">
      <table className="table">{children}</table>
    </div>
  )
}

type TableToolbarProps = {
  title: string
  subtitle?: string
  newLabel?: string
  onNew?: () => void
  onFilter?: () => void
  isFilterActive?: boolean
}

export function TableToolbar({
  title,
  subtitle,
  newLabel,
  onNew,
  onFilter,
  isFilterActive,
}: TableToolbarProps) {
  return (
    <div className="table-toolbar">
      <div>
        <h2 className="table-toolbar__title">{title}</h2>
        {subtitle && <p className="table-toolbar__subtitle">{subtitle}</p>}
      </div>
      <div className="table-toolbar__actions">
        <Button
          variant={isFilterActive ? 'primary' : 'outline'}
          size="sm"
          onClick={onFilter}
          title="Alternar filtros"
        >
          <FilterIcon /> Filtrar
        </Button>
        {onNew && (
          <Button size="sm" onClick={onNew}>
            <PlusIcon /> {newLabel ?? 'Novo'}
          </Button>
        )}
      </div>
    </div>
  )
}

export function Pagination({ showing, total }: { showing: string; total: number }) {
  return (
    <div className="pagination">
      <span className="pagination__info">
        Exibindo <strong>{showing}</strong> de <strong>{total}</strong> registros
      </span>
      <div className="pagination__pages">
        {['‹', '1', '2', '3', '…', '›'].map((p, i) => (
          <button key={i} className={`pagination__btn ${p === '1' ? 'pagination__btn--active' : ''}`.trim()}>
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TableFilterCollapse({
  isOpen,
  children,
}: {
  isOpen: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`table-filter-collapse ${isOpen ? 'is-open' : ''}`}>
      {children}
    </div>
  )
}
