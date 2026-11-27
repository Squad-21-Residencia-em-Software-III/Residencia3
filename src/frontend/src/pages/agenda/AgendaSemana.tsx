import { Calendar } from 'lucide-react';
import { EmptyState } from '../../components/ui';
import type { BlocoAgendaDia, DiaAgendaSemana, LinhaRecursoAgenda } from '../../types/agenda';
import type { Viagem } from '../../types/viagem';
import { obterResumoTrajeto } from '../../utils/agenda';
import { cn } from '../../utils/cn';
import { LegendaStatusAgenda, MARCADOR_STATUS, rotuloStatusAgenda } from './statusAgenda';

interface AgendaSemanaProps {
  linhas: LinhaRecursoAgenda[];
  diasSemana: DiaAgendaSemana[];
  onSelecionarViagem: (viagem: Viagem) => void;
}

const TOTAL_MINUTOS_DIA = 24 * 60; // Grade 24h

function calcularPorcentagemEsquerda(inicioMin: number): number {
  return Math.max(0, Math.min(100, (inicioMin / TOTAL_MINUTOS_DIA) * 100));
}

function calcularPorcentagemLargura(bloco: BlocoAgendaDia): number {
  const diff = Math.max(15, bloco.fimMin - bloco.inicioMin);
  return Math.max(4, (diff / TOTAL_MINUTOS_DIA) * 100);
}

export function AgendaSemana({
  linhas,
  diasSemana,
  onSelecionarViagem,
}: AgendaSemanaProps) {
  if (linhas.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-surface p-6 shadow-card">
        <EmptyState
          icon={<Calendar size={24} />}
          title="Nenhum veículo ou viagem nesta semana"
          description="Quando houver veículos ativos na frota ou viagens alocadas neste período, eles aparecerão aqui."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {/* ── Cabeçalho dos 7 Dias da Semana ── */}
      <div className="flex min-w-[calc(120px+7*65px)] shrink-0 border-b border-border bg-surface-alt md:min-w-0">
        <div className="flex h-12 w-[120px] shrink-0 items-center border-r border-border px-2 font-display text-[0.625rem] font-bold tracking-[0.05em] text-text-muted uppercase md:w-[190px] md:px-4 md:text-[0.6875rem]">
          Veículo
        </div>
        {diasSemana.map((d) => (
          <div
            key={d.data}
            className={cn(
              'flex h-12 min-w-[65px] flex-1 flex-col items-center justify-center border-r border-border last:border-r-0',
              d.ehHoje && 'bg-primary/[0.06]',
            )}
          >
            <span
              className={cn(
                'text-[0.6875rem] font-semibold',
                d.ehHoje ? 'text-primary' : 'text-text-muted',
              )}
            >
              {d.label}
            </span>
            <span
              className={cn(
                'flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs font-bold',
                d.ehHoje ? 'bg-primary text-white' : 'text-text',
              )}
            >
              {d.diaNumero}
            </span>
          </div>
        ))}
      </div>

      {/* ── Corpo da Grade Semanal ── */}
      <div className="flex-1 overflow-auto">
        {linhas.map((linha) => (
          <div
            key={linha.id}
            className="flex h-[54px] min-w-[calc(120px+7*65px)] border-b border-divider md:min-w-0"
          >
            {/* Coluna fixa do Veículo */}
            <div className="w-[120px] shrink-0 overflow-y-hidden border-r border-border bg-surface md:w-[190px]">
              <div className="flex h-[54px] flex-col justify-center px-2 md:px-4">
                <div
                  className="truncate font-display text-[0.6875rem] font-bold text-text md:text-xs"
                  title={linha.modelo}
                >
                  {linha.modelo}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="font-mono text-[0.625rem] font-semibold text-text-muted md:text-[0.6875rem]">
                    {linha.placa}
                  </span>
                </div>
              </div>
            </div>

            {/* Células diárias com mini-timeline 24h */}
            {diasSemana.map((d) => {
              const blocosDoDia = linha.blocos.filter((b) => b.data === d.data);

              return (
                <div
                  key={d.data}
                  className={cn(
                    'relative min-w-[65px] flex-1 border-r border-divider last:border-r-0',
                    d.ehHoje && 'bg-primary/[0.02]',
                  )}
                >
                  <div className="absolute top-1/2 right-2 left-2 h-0.5 rounded-[1px] bg-divider" />

                  {blocosDoDia.map((bloco) => {
                    const leftPct = calcularPorcentagemEsquerda(bloco.inicioMin);
                    const widthPct = calcularPorcentagemLargura(bloco);
                    const resumoTrajeto = obterResumoTrajeto(bloco.viagem);

                    return (
                      <button
                        key={bloco.chave}
                        type="button"
                        onClick={() => onSelecionarViagem(bloco.viagem)}
                        aria-label={`${rotuloStatusAgenda(bloco.viagem.status)} · ${bloco.horaInicioLabel}–${bloco.horaFimLabel} · ${resumoTrajeto}`}
                        className={cn(
                          'group absolute top-1/2 z-2 h-3.5 -translate-y-1/2 cursor-pointer rounded-sm border-0 p-0 transition-all duration-150 hover:z-10 hover:scale-y-130',
                          MARCADOR_STATUS[bloco.viagem.status],
                        )}
                        style={{
                          left: `calc(4px + ${leftPct * 0.9}%)`,
                          width: `${Math.max(widthPct * 0.9, 8)}%`,
                        }}
                      >
                        <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#0e172e] px-2.5 py-1.5 text-[0.6875rem] whitespace-nowrap text-white opacity-0 shadow-[0_4px_12px_rgba(13,27,53,0.3)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                          <strong className="text-[#93c5fd]">
                            {bloco.horaInicioLabel}–{bloco.horaFimLabel}
                          </strong>
                          {' · '}
                          <span>{rotuloStatusAgenda(bloco.viagem.status)} · {resumoTrajeto}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Rodapé com Legenda ── */}
      <div className="flex shrink-0 flex-col-reverse items-stretch justify-between gap-2 border-t border-border bg-surface-alt px-3 py-2.5 md:flex-row md:items-center md:px-5">
        <span className="text-[0.6875rem] text-text-muted md:text-xs">
          Passe o mouse sobre os blocos para ver o horário e rota · Clique para abrir detalhes
        </span>
        <LegendaStatusAgenda />
      </div>
    </div>
  );
}
