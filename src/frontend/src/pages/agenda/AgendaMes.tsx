import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ExcecaoAgenda } from '../../types/agenda';
import { cn } from '../../utils/cn';

interface AgendaMesProps {
  excecoes: Record<number, ExcecaoAgenda[]>;
  historicoMes: Record<number, number>;
  diaAtualNumero: number;
  onSelecionarDia: (dia: number) => void;
}

const DIAS_SEMANA_NOMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const MES_CHIP_STYLES: Record<ExcecaoAgenda['tipo'], string> = {
  gargalo: 'bg-[#fee2e2] text-[#b91c1c]',
  pico: 'bg-[#fef3c7] text-[#b45309]',
  normal: 'bg-[#dcfce7] text-[#15803d]',
};

export function AgendaMes({
  excecoes,
  historicoMes,
  diaAtualNumero,
  onSelecionarDia,
}: AgendaMesProps) {
  // Mês com 31 dias (Outubro 2026 começa na Quinta-feira, offset de 3 dias: Seg, Ter, Qua)
  const offsetInicial = 3;
  const totalDias = 31;

  const obterIconeExcecao = (tipo: ExcecaoAgenda['tipo']) => {
    switch (tipo) {
      case 'gargalo':
        return <AlertCircle size={11} color="#b91c1c" />;
      case 'pico':
        return <AlertTriangle size={11} color="#b45309" />;
      case 'normal':
      default:
        return <CheckCircle2 size={11} color="#15803d" />;
    }
  };

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

      {/* ── Grade de Calendário Mensal ── */}
      <div className="grid flex-1 auto-rows-[minmax(70px,1fr)] grid-cols-7 overflow-y-auto md:auto-rows-[minmax(96px,1fr)]">
        {/* Espaços vazios do início do mês (Seg, Ter, Qua) */}
        {Array.from({ length: offsetInicial }).map((_, i) => (
          <div key={`offset-${i}`} className="border-r border-b border-divider bg-surface-alt" />
        ))}

        {/* Células de cada dia do mês */}
        {Array.from({ length: totalDias }, (_, i) => i + 1).map((dia) => {
          const isToday = dia === diaAtualNumero;
          const isPassado = dia < diaAtualNumero;
          const listaExcecoes = excecoes[dia] ?? [];
          const temExcecao = listaExcecoes.length > 0;
          const totalHistorico = historicoMes[dia];

          return (
            <button
              key={dia}
              type="button"
              className={cn(
                'flex cursor-pointer flex-col rounded-none border-t-0 border-r border-b border-l-0 border-divider p-1 text-left transition-all duration-150 hover:bg-surface-alt md:px-3 md:py-2',
                isToday && 'bg-primary/[0.04] outline-2 -outline-offset-2 outline-primary',
                isPassado && 'bg-surface-alt',
              )}
              onClick={() => onSelecionarDia(dia)}
              title={
                temExcecao
                  ? `Dia ${dia}: clique para inspecionar as rotas detalhadas`
                  : `Dia ${dia}`
              }
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    'flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold md:h-[22px] md:w-[22px] md:text-xs',
                    isToday ? 'bg-primary text-white' : isPassado ? 'text-text-muted' : 'text-text',
                  )}
                >
                  {dia}
                </span>
                {isToday && <span className="text-[10px] font-bold text-primary">Hoje</span>}
              </div>

              {/* Chips de Exceção (Apenas alertas nos dias futuros e hoje) */}
              {!isPassado && temExcecao && (
                <div className="flex w-full flex-col gap-[3px]">
                  {listaExcecoes.map((exc, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'inline-flex items-center gap-1 overflow-hidden rounded-sm px-1.5 py-0.5 text-[10px] font-semibold text-ellipsis whitespace-nowrap',
                        MES_CHIP_STYLES[exc.tipo],
                      )}
                      title={exc.mensagem}
                    >
                      {obterIconeExcecao(exc.tipo)}
                      <span className="truncate">{exc.mensagem}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Dias passados: quantitativo discreto */}
              {isPassado && totalHistorico !== undefined && (
                <div className="mt-1 text-[11px] text-text-muted">
                  {totalHistorico} {totalHistorico === 1 ? 'viagem' : 'viagens'}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Rodapé de Legenda de Gestão por Exceção ── */}
      <div className="flex shrink-0 flex-col-reverse items-stretch justify-between gap-2 border-t border-border bg-surface-alt px-3 py-2.5 md:flex-row md:items-center md:px-5">
        <span className="text-[11px] text-text-muted md:text-xs">
          Apenas gargalos e horários de pico são sinalizados · Clique em qualquer dia para ver a
          timeline detalhada
        </span>
        <div className="flex flex-wrap items-center justify-start gap-2.5 md:gap-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
            <AlertCircle size={13} color="#b91c1c" />
            <span className="text-[#b91c1c]">Gargalo Operacional</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
            <AlertTriangle size={13} color="#b45309" />
            <span className="text-[#b45309]">Horário de Pico</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
            <CheckCircle2 size={13} color="#15803d" />
            <span className="text-[#15803d]">Capacidade Normal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
