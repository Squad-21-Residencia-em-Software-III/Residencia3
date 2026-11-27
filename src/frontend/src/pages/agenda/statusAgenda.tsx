import type { StatusViagem } from '../../types/viagem';
import { LABELS_STATUS_VIAGEM } from '../../types/viagem';
import { cn } from '../../utils/cn';

// Status na agenda sem depender só da cor (SCRUM-307): cada um tem cor (que acompanha as paletas de
// daltonismo) e um padrão próprio, repetido na legenda. Em escala de cinza, o padrão continua diferenciando.
const LISTRAS = 'bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgb(255_255_255/0.55)_3px_6px)]';
const CRUZADO = 'bg-[repeating-linear-gradient(-45deg,transparent_0_2px,rgb(255_255_255/0.6)_2px_4px)]';

/** Marcador cheio (barras da semana, pontos dos blocos e amostras da legenda). */
export const MARCADOR_STATUS: Record<StatusViagem, string> = {
  EM_ANDAMENTO: 'bg-blue-600',
  NO_LOCAL: cn('bg-amber-600', LISTRAS),
  AGENDADA: 'border-2 border-dashed border-violet-600 bg-violet-100',
  CONCLUIDA: 'bg-slate-400',
  CANCELADA: cn('bg-red-600 opacity-75', CRUZADO),
};

/** Bloco com texto (visão do dia). */
export const BLOCO_STATUS: Record<StatusViagem, string> = {
  EM_ANDAMENTO: 'border-blue-300 bg-blue-50 text-blue-700 hover:border-blue-600',
  NO_LOCAL: 'border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-600',
  AGENDADA: 'border-dashed border-violet-400 bg-violet-50 text-violet-700 hover:border-violet-600',
  CONCLUIDA: 'border-slate-300 bg-slate-50 text-slate-600 hover:border-slate-500',
  CANCELADA: 'border-red-200 bg-red-50 text-red-800 opacity-75 hover:border-red-600',
};

const ORDEM: StatusViagem[] = ['AGENDADA', 'EM_ANDAMENTO', 'NO_LOCAL', 'CONCLUIDA', 'CANCELADA'];

export function rotuloStatusAgenda(status: StatusViagem): string {
  return LABELS_STATUS_VIAGEM[status];
}

/** Legenda com os mesmos marcadores das barras. */
export function LegendaStatusAgenda() {
  return (
    <ul className="m-0 flex list-none flex-wrap items-center justify-start gap-2.5 p-0 md:gap-4" aria-label="Legenda dos status">
      {ORDEM.map((status) => (
        <li key={status} className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
          <span className={cn('size-3 shrink-0 rounded-[2px]', MARCADOR_STATUS[status])} aria-hidden="true" />
          <span>{rotuloStatusAgenda(status)}</span>
        </li>
      ))}
    </ul>
  );
}
