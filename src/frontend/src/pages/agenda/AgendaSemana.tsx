import type { DiaAgendaSemana, RotaAgenda } from '../../types/agenda';
import type { StatusViagem } from '../../types/viagem';
import { cn } from '../../utils/cn';

interface AgendaSemanaProps {
  rotas: RotaAgenda[];
  diasSemana: DiaAgendaSemana[];
  onSelecionarRota: (rota: RotaAgenda) => void;
}

const HORA_INICIO_MIN = 6 * 60; // 06:00
const HORA_FIM_MIN = 20 * 60; // 20:00
const INTERVALO_MIN = HORA_FIM_MIN - HORA_INICIO_MIN;

const SEMANA_BAR_STYLES: Record<StatusViagem, string> = {
  CONCLUIDA: 'bg-[#94a3b8]',
  EM_ANDAMENTO: 'bg-[#2563eb]',
  AGENDADA: 'bg-[#7c3aed]',
  CANCELADA: 'bg-[#94a3b8]',
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

function calcularPorcentagemEsquerda(hora: string): number {
  const min = timeToMinutes(hora);
  return Math.max(0, Math.min(100, ((min - HORA_INICIO_MIN) / INTERVALO_MIN) * 100));
}

function calcularPorcentagemLargura(horaInicio: string, horaFim: string): number {
  const inicio = timeToMinutes(horaInicio);
  const fim = timeToMinutes(horaFim);
  const diff = fim - inicio;
  return Math.max(2, (diff / INTERVALO_MIN) * 100);
}

export function AgendaSemana({ rotas, diasSemana, onSelecionarRota }: AgendaSemanaProps) {
  // Agrupar veículos
  const veiculosMap = new Map<
    number,
    {
      id: number;
      modelo: string;
      placa: string;
      motorista_nome: string;
      rotas: RotaAgenda[];
    }
  >();

  rotas.forEach((r) => {
    if (!veiculosMap.has(r.veiculo_id)) {
      veiculosMap.set(r.veiculo_id, {
        id: r.veiculo_id,
        modelo: r.veiculo_modelo,
        placa: r.veiculo_placa,
        motorista_nome: r.motorista_nome,
        rotas: [],
      });
    }
    veiculosMap.get(r.veiculo_id)!.rotas.push(r);
  });

  const linhas = Array.from(veiculosMap.values());

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {/* ── Cabeçalho dos 7 Dias da Semana ── */}
      <div className="flex min-w-[calc(120px+7*65px)] shrink-0 border-b border-border bg-surface-alt md:min-w-0">
        <div className="flex h-12 w-[120px] shrink-0 items-center border-r border-border px-2 font-display text-[10px] font-bold tracking-[0.05em] text-text-muted uppercase md:w-[190px] md:px-4 md:text-[11px]">
          Recurso / Veículo
        </div>
        {diasSemana.map((d) => (
          <div
            key={d.data}
            className={cn(
              'flex h-12 min-w-[65px] flex-1 flex-col items-center justify-center border-r border-border',
              d.isToday && 'bg-primary/[0.06]',
            )}
          >
            <span
              className={cn(
                'text-[11px] font-semibold',
                d.isToday ? 'text-primary' : 'text-text-muted',
              )}
            >
              {d.label}
            </span>
            <span
              className={cn(
                'flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs font-bold',
                d.isToday ? 'bg-primary text-white' : 'text-text',
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
                  className="truncate font-display text-[11px] font-bold text-text md:text-xs"
                  title={linha.modelo}
                >
                  {linha.modelo}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="font-mono text-[10px] font-semibold text-text-muted md:text-[11px]">
                    {linha.placa}
                  </span>
                </div>
              </div>
            </div>

            {/* Células diárias com mini-timeline */}
            {diasSemana.map((d) => {
              const rotasDoDia = linha.rotas.filter((r) => r.data === d.data);

              return (
                <div
                  key={d.data}
                  className={cn(
                    'relative min-w-[65px] flex-1 border-r border-divider',
                    d.isToday && 'bg-primary/[0.02]',
                  )}
                >
                  {/* Linha guia central horizontal */}
                  <div className="absolute top-1/2 right-2 left-2 h-0.5 rounded-[1px] bg-divider" />

                  {/* Barras proporcionais de viagem com tooltip flutuante */}
                  {rotasDoDia.map((rota) => {
                    const leftPct = calcularPorcentagemEsquerda(rota.hora_inicio);
                    const widthPct = calcularPorcentagemLargura(rota.hora_inicio, rota.hora_fim);

                    return (
                      <div
                        key={rota.id}
                        onClick={() => onSelecionarRota(rota)}
                        className={cn(
                          'group absolute top-1/2 z-2 h-3.5 -translate-y-1/2 cursor-pointer rounded-sm transition-all duration-150 hover:z-10 hover:scale-y-130',
                          SEMANA_BAR_STYLES[rota.status],
                        )}
                        style={{
                          left: `calc(4px + ${leftPct * 0.9}%)`,
                          width: `${Math.max(widthPct * 0.9, 8)}%`,
                        }}
                      >
                        {/* Tooltip flutuante ao passar o mouse */}
                        <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 -translate-x-1/2 rounded-md bg-[#0e172e] px-2.5 py-1.5 text-[11px] whitespace-nowrap text-white opacity-0 shadow-[0_4px_12px_rgba(13,27,53,0.3)] transition-opacity duration-150 group-hover:opacity-100">
                          <strong className="text-[#93c5fd]">
                            {rota.hora_inicio}–{rota.hora_fim}
                          </strong>
                          {' · '}
                          <span>
                            {rota.origem.split(' - ')[0]} → {rota.destino.split(' - ')[0]}
                          </span>
                        </div>
                      </div>
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
        <span className="text-[11px] text-text-muted md:text-xs">
          Passe o mouse sobre os blocos para ver o horário e rota · Clique para abrir
        </span>
        <div className="flex flex-wrap items-center justify-start gap-2.5 md:gap-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
            <span className="h-[9px] w-[9px] rounded-[2px] bg-[#2563eb]" />
            <span>Em Andamento</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
            <span className="h-[9px] w-[9px] rounded-[2px] bg-[#7c3aed]" />
            <span>Agendada</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
            <span className="h-[9px] w-[9px] rounded-[2px] bg-[#94a3b8]" />
            <span>Concluída</span>
          </div>
        </div>
      </div>
    </div>
  );
}
