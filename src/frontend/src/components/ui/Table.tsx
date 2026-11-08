import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';
import { PlusIcon } from './icons';

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn(
          'w-full border-collapse',
          '[&_th]:border-b [&_th]:border-divider [&_th]:px-2.5 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-display [&_th]:text-[11px] [&_th]:font-bold [&_th]:tracking-[0.05em] [&_th]:whitespace-nowrap [&_th]:text-text-muted [&_th]:uppercase md:[&_th]:px-3.5 md:[&_th]:py-3',
          '[&_td]:px-2.5 [&_td]:py-2.5 [&_td]:align-middle [&_td]:text-[13px] [&_td]:break-words [&_td]:wrap-anywhere md:[&_td]:px-3.5 md:[&_td]:py-3 md:[&_td]:text-sm',
          '[&_td:first-child]:pl-3 md:[&_td:first-child]:pl-5 [&_th:first-child]:pl-3 md:[&_th:first-child]:pl-5',
          '[&_td:last-child]:pr-3 md:[&_td:last-child]:pr-5 [&_th:last-child]:pr-3 md:[&_th:last-child]:pr-5',
          '[&_tbody_tr]:border-b [&_tbody_tr]:border-border [&_tbody_tr]:transition-colors [&_tbody_tr]:duration-100 [&_tbody_tr:last-child]:border-b-0 [&_tbody_tr:hover]:bg-surface-hover',
          '[&_td_.avatar]:hidden md:[&_td_.avatar]:inline-flex',
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}

type TableToolbarProps = {
  title: string;
  subtitle?: string;
  newLabel?: string;
  onNew?: () => void;
  onFilter?: () => void;
  isFilterActive?: boolean;
};

export function TableToolbar({
  title,
  subtitle,
  newLabel,
  onNew,
  onFilter,
  isFilterActive,
}: TableToolbarProps) {
  return (
    <div className="flex flex-col items-stretch justify-between gap-3 border-b border-divider px-3.5 py-3 md:flex-row md:flex-wrap md:items-center md:px-6 md:py-4">
      <div>
        <h2 className="text-[15px] font-bold text-text md:text-base">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
      </div>
      <div className="flex w-full items-center justify-stretch gap-3 md:w-auto [&>button]:w-full [&>button]:justify-center md:[&>button]:w-auto">
        {onFilter && (
          <Button
            variant="outline"
            size="sm"
            onClick={onFilter}
            title="Alternar filtros"
          >
            <Filter size={13} className="mr-1.5" /> Filtrar
            {isFilterActive && (
              <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </Button>
        )}
        {onNew && (
          <Button size="sm" onClick={onNew}>
            <PlusIcon /> {newLabel ?? 'Novo'}
          </Button>
        )}
      </div>
    </div>
  );
}

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      'ellipsis',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

export type PaginationProps = {
  currentPage?: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  // Compatibilidade com telas legadas
  showing?: string;
  total?: number;
};

export function Pagination({
  currentPage = 1,
  totalItems,
  pageSize = 10,
  onPageChange,
  showing,
  total,
}: PaginationProps) {
  const totalCount = totalItems ?? total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasMultiplePages = Boolean(onPageChange && totalPages > 1);

  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);
  const showingText = showing ?? `${startItem}–${endItem}`;

  const pages = hasMultiplePages ? getPageNumbers(currentPage, totalPages) : [];

  return (
    <div className="grid grid-cols-1 items-center gap-3 border-t border-divider bg-surface-alt px-3.5 py-3 md:grid-cols-3 md:px-6 md:py-3.5">
      {/* 1. Lado esquerdo: Contador de registros */}
      <div className="text-center text-xs text-text-muted md:text-left">
        {totalCount === 0 ? (
          <span>Nenhum registro encontrado</span>
        ) : (
          <span>
            Exibindo <strong className="font-semibold text-text">{showingText}</strong> de{' '}
            <strong className="font-semibold text-text">{totalCount}</strong> registros
          </span>
        )}
      </div>

      {/* 2. Centro: Controles de página com foco centralizado */}
      <div className="flex items-center justify-center">
        {hasMultiplePages && (
          <nav aria-label="Navegação de páginas" className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange?.(currentPage - 1)}
              disabled={currentPage <= 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition-all duration-150 hover:border-border-strong hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-40"
              aria-label="Página anterior"
              title="Página anterior"
            >
              <ChevronLeft size={15} />
            </button>

            {pages.map((p, idx) => {
              if (p === 'ellipsis') {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="flex h-8 w-6 select-none items-center justify-center text-xs text-text-muted"
                  >
                    …
                  </span>
                );
              }

              const isActive = p === currentPage;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange?.(p)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-xs font-semibold transition-all duration-150',
                    isActive
                      ? 'border border-primary bg-primary text-white shadow-2xs'
                      : 'border border-transparent bg-transparent text-text-secondary hover:border-border hover:bg-surface hover:text-text',
                  )}
                >
                  {p}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => onPageChange?.(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition-all duration-150 hover:border-border-strong hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-40"
              aria-label="Próxima página"
              title="Próxima página"
            >
              <ChevronRight size={15} />
            </button>
          </nav>
        )}
      </div>

      {/* 3. Lado direito: Resumo da página para balancear a grade */}
      <div className="hidden text-right text-xs text-text-muted md:block">
        {hasMultiplePages && (
          <span>
            Página <strong className="font-semibold text-text">{currentPage}</strong> de{' '}
            <strong className="font-semibold text-text">{totalPages}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

export function TableFilterCollapse({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        isOpen
          ? 'grid-rows-[1fr] opacity-100 border-b border-divider'
          : 'grid-rows-[0fr] opacity-0 border-b-0 pointer-events-none'
      )}
    >
      <div className="overflow-hidden">
        <div className="flex flex-col gap-2.5 bg-surface-alt px-3.5 py-3 sm:flex-row sm:flex-wrap sm:items-center md:px-6 md:py-3">
          {children}
        </div>
      </div>
    </div>
  );
}
