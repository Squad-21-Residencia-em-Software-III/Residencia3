import type { CelulaMesAgenda } from '../../types/agenda';
import { cn } from '../../utils/cn';

interface AgendaMesProps {
  offsetInicial: number;
  celulas: CelulaMesAgenda[];
  onSelecionarDia: (dataIso: string) => void;
}

const DIAS_SEMANA_NOMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function AgendaMes({
  offsetInicial,
  celulas,
  onSelecionarDia,
}: AgendaMesProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {/* ── Cabeçalho dos Dias da Semana ── */}
      <div className="grid shrink-0 grid-cols-7 border-b border-border bg-surface-alt">
        {DIAS_SEMANA_NOMES.map((d) => (
          <div
            key={d}
            className="border-r border-border px-0.5 py-1.5 text-center font-display text-[10px] font-bold tracking-[0.05em] text-text-muted uppercase last:border-r-0 md:p-2.5 md:text-[11px]"
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── Grade de Calendário Mensal Dinâmico ── */}
      <div className="grid flex-1 auto-rows-[minmax(70px,1fr)] grid-cols-7 overflow-y-auto md:auto-rows-[minmax(96px,1fr)]">
        {Array.from({ length: offsetInicial }).map((_, i) => (
          <div key={`offset-${i}`} className="border-r border-b border-divider bg-surface-alt" />
        ))}

        {celulas.map((celula) => {
          const { dia, dataIso, ehHoje, ehPassado, totalViagens } = celula;

          return (
            <button
              key={dataIso}
              type="button"
              className={cn(
                'group relative flex cursor-pointer flex-col rounded-none border-t-0 border-r border-b border-l-0 border-divider p-1 text-left transition-all duration-150 hover:z-1 hover:bg-primary/[0.06] hover:outline-1 hover:-outline-offset-1 hover:outline-primary/40 md:px-3 md:py-2',
                ehHoje && 'bg-primary/[0.04] outline-2 -outline-offset-2 outline-primary',
                ehPassado && 'bg-surface-alt',
              )}
              onClick={() => onSelecionarDia(dataIso)}
              title={`Dia ${dia}: clique para inspecionar as viagens detalhadas`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    'flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold transition-colors duration-150 md:h-[22px] md:w-[22px] md:text-xs',
                    ehHoje
                      ? 'bg-primary text-white'
                      : ehPassado
                        ? 'text-text-muted group-hover:text-primary'
                        : 'text-text group-hover:text-primary',
                  )}
                >
                  {dia}
                </span>
                {ehHoje && <span className="text-[10px] font-bold text-primary">Hoje</span>}
              </div>

              {totalViagens > 0 && (
                <div className="mt-1 inline-flex w-fit items-center rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary md:text-[11px]">
                  {totalViagens} {totalViagens === 1 ? 'viagem' : 'viagens'}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Rodapé ── */}
      <div className="flex shrink-0 items-center justify-between border-t border-border bg-surface-alt px-3 py-2.5 md:px-5">
        <span className="text-[11px] text-text-muted md:text-xs">
          Clique em qualquer dia para abrir a grade horária detalhada
        </span>
      </div>
    </div>
  );
}
