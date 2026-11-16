import { Building2, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TipoFrota } from '../../types/veiculo';
import { cn } from '../../utils/cn';

const OPCOES: Record<TipoFrota, { rotulo: string; Icone: LucideIcon }> = {
  ADMINISTRATIVA: { rotulo: 'Administrativo', Icone: Building2 },
  SVO: { rotulo: 'SVO', Icone: Truck },
};

interface SeletorOperacaoProps {
  /** Operações que o perfil pode ver, na ordem de exibição. */
  operacoes: TipoFrota[];
  ativa: TipoFrota;
  onChange: (operacao: TipoFrota) => void;
}

/**
 * Alternância Administrativo/SVO nas páginas existentes (SCRUM-166). Mesmo visual do seletor
 * Motoristas/Usuários de EquipePage. Com uma operação só, não aparece.
 */
export function SeletorOperacao({ operacoes, ativa, onChange }: SeletorOperacaoProps) {
  if (operacoes.length < 2) return null;

  return (
    <div className="flex items-center">
      <div
        role="tablist"
        aria-label="Operação"
        className="inline-flex items-center rounded-xl bg-slate-200/70 p-1.5 border border-slate-300/50 shadow-2xs"
      >
        {operacoes.map((operacao) => {
          const { rotulo, Icone } = OPCOES[operacao];
          const selecionada = operacao === ativa;
          return (
            <button
              key={operacao}
              type="button"
              role="tab"
              aria-selected={selecionada}
              onClick={() => onChange(operacao)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap',
                selecionada
                  ? 'bg-white text-navy-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 active:bg-slate-200/50',
              )}
            >
              <Icone size={16} />
              <span>{rotulo}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
