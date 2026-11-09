import { useRef } from 'react';
import type { RotaAgenda } from '../../types/agenda';
import type { StatusViagem } from '../../types/viagem';
import { cn } from '../../utils/cn';

interface AgendaGanttHojeProps {
  rotas: RotaAgenda[];
  onSelecionarRota: (rota: RotaAgenda) => void;
}

const HORA_INICIO = 5; // 05:00
const HORA_FIM = 20; // 20:00
const HORA_LARGURA_PX = 80;
const ALTURA_LINHA_PX = 60;
const TOTAL_HORAS = HORA_FIM - HORA_INICIO;
const LARGURA_TOTAL_GRADE = TOTAL_HORAS * HORA_LARGURA_PX;

const GANTT_STATUS_STYLES: Record<StatusViagem, { block: string; dot: string }> = {
  CONCLUIDA: {
    block: 'border-[#cbd5e1] bg-[#f8fafc] text-[#475569] hover:border-[#64748b]',
    dot: 'bg-[#94a3b8]',
  },
  EM_ANDAMENTO: {
    block: 'border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8] hover:border-[#2563eb]',
    dot: 'bg-[#1d4ed8]',
  },
  AGENDADA: {
    block: 'border-[#c4b5fd] bg-[#faf5ff] text-[#6d28d9] hover:border-[#7c3aed]',
    dot: 'bg-[#7c3aed]',
  },
  CANCELADA: {
    block: 'border-[#cbd5e1] bg-[#f8fafc] text-[#475569] hover:border-[#64748b]',
    dot: 'bg-[#94a3b8]',
  },
};

function converterHoraParaMinutos(horaString: string): number {
  const [h, m] = horaString.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function AgendaGanttHoje({ rotas, onSelecionarRota }: AgendaGanttHojeProps) {
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const resourceScrollRef = useRef<HTMLDivElement>(null);

  // Array de horas [5, 6, ..., 20]
  const horas = Array.from({ length: TOTAL_HORAS + 1 }, (_, i) => HORA_INICIO + i);

  // Agrupar rotas por veículo
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

  // Cálculo da posição da linha do "Agora" (simulado para 09:17)
  const agoraMinutos = 9 * 60 + 17;
  const agoraLeft = ((agoraMinutos - HORA_INICIO * 60) / 60) * HORA_LARGURA_PX;

  const handleGridScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = target.scrollLeft;
    }
    if (resourceScrollRef.current) {
      resourceScrollRef.current.scrollTop = target.scrollTop;
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {/* ── Linha de Horas Fixa no Topo (Header Sticky) ── */}
      <div className="relative z-5 flex shrink-0 border-b border-border bg-surface-alt">
        <div className="flex h-[38px] w-[120px] shrink-0 items-center border-r border-border px-2 font-display text-[10px] font-bold tracking-[0.05em] text-text-muted uppercase md:w-[190px] md:px-4 md:text-[11px]">
          Recurso / Veículo
        </div>
        <div className="flex-1 overflow-x-hidden" ref={headerScrollRef}>
          <div className="flex" style={{ width: `${LARGURA_TOTAL_GRADE}px` }}>
            {horas.slice(0, -1).map((h) => (
              <div
                key={h}
                className="flex h-[38px] w-[80px] shrink-0 items-center border-r border-divider pl-2 text-[11px] font-semibold text-text-muted"
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Corpo do Gantt: Labels Fixos + Grade de Blocos ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Coluna fixa de Recursos à esquerda */}
        <div
          className="w-[120px] shrink-0 overflow-y-hidden border-r border-border bg-surface md:w-[190px]"
          ref={resourceScrollRef}
        >
          {linhas.map((linha) => (
            <div
              key={linha.id}
              className="flex h-[60px] flex-col justify-center border-b border-divider px-2 md:px-4"
            >
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
                <span className="text-[10px] text-text-muted">·</span>
                <span className="truncate text-[11px] text-text-muted" title={linha.motorista_nome}>
                  {linha.motorista_nome.split(' ')[0]}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Grade de tempo com scroll bidirecional */}
        <div className="relative flex-1 overflow-auto" onScroll={handleGridScroll}>
          <div
            className="relative"
            style={{
              width: `${LARGURA_TOTAL_GRADE}px`,
              minHeight: `${linhas.length * ALTURA_LINHA_PX}px`,
            }}
          >
            {/* Linhas de grade verticais (Horas) */}
            {horas.slice(0, -1).map((h, i) => (
              <div
                key={h}
                className="pointer-events-none absolute top-0 bottom-0 z-1 border-l border-divider"
                style={{ left: `${i * HORA_LARGURA_PX}px` }}
              />
            ))}

            {/* Linhas de grade horizontais (Linhas de veículos) */}
            {linhas.map((_, i) => (
              <div
                key={i}
                className="pointer-events-none absolute right-0 left-0 z-1 border-t border-divider"
                style={{ top: `${(i + 1) * ALTURA_LINHA_PX}px` }}
              />
            ))}

            {/* Marcador vertical dinâmico do "Agora" */}
            {agoraLeft >= 0 && agoraLeft <= LARGURA_TOTAL_GRADE && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 flex flex-col items-center"
                style={{ left: `${agoraLeft}px` }}
              >
                <div className="rounded-sm bg-primary px-1.5 py-[1px] text-[10px] font-bold whitespace-nowrap text-white shadow-[0_2px_4px_rgba(21,84,184,0.3)]">
                  09:17
                </div>
                <div className="w-0.5 flex-1 bg-primary shadow-[0_0_4px_rgba(21,84,184,0.4)]" />
              </div>
            )}

            {/* Blocos de Rota Posicionados Proporcionalmente */}
            {linhas.map((linha, rowIdx) =>
              linha.rotas.map((rota) => {
                const inicioMin = converterHoraParaMinutos(rota.hora_inicio);
                const fimMin = converterHoraParaMinutos(rota.hora_fim);

                const left = ((inicioMin - HORA_INICIO * 60) / 60) * HORA_LARGURA_PX;
                const duracaoHoras = (fimMin - inicioMin) / 60;
                const width = Math.max(duracaoHoras * HORA_LARGURA_PX, 56);
                const top = rowIdx * ALTURA_LINHA_PX;

                const statusStyles = GANTT_STATUS_STYLES[rota.status];

                return (
                  <div
                    key={rota.id}
                    onClick={() => onSelecionarRota(rota)}
                    className={cn(
                      'absolute z-3 flex cursor-pointer items-center overflow-hidden rounded-lg border-[1.5px] px-3 shadow-[0_1px_3px_rgba(13,27,53,0.08)] transition-all duration-150 hover:z-8 hover:-translate-y-px hover:shadow-[0_4px_10px_rgba(13,27,53,0.15)]',
                      statusStyles.block,
                    )}
                    style={{
                      top: `${top + 7}px`,
                      height: `${ALTURA_LINHA_PX - 14}px`,
                      left: `${left + 2}px`,
                      width: `${width - 4}px`,
                    }}
                    title={`#${rota.id}: ${rota.origem} → ${rota.destino} (${rota.hora_inicio} às ${rota.hora_fim})`}
                  >
                    <div className="flex w-full min-w-0 items-center gap-2">
                      <span
                        className={cn('h-[7px] w-[7px] shrink-0 rounded-[2px]', statusStyles.dot)}
                      />
                      <div className="flex min-w-0 flex-col leading-[1.2]">
                        <span className="truncate font-display text-[11px] font-bold md:text-xs">
                          {rota.origem.split(' - ')[0]} → {rota.destino.split(' - ')[0]}
                        </span>
                        {width >= 90 && (
                          <span className="truncate text-[10px] opacity-75 md:text-[11px]">
                            {rota.hora_inicio}–{rota.hora_fim} · {rota.km_estimado} km
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }),
            )}
          </div>
        </div>
      </div>

      {/* ── Rodapé de Legenda de Status ── */}
      <div className="flex shrink-0 flex-col-reverse items-stretch justify-between gap-2 border-t border-border bg-surface-alt px-3 py-2.5 md:flex-row md:items-center md:px-5">
        <span className="text-[11px] text-text-muted md:text-xs">
          Clique em qualquer bloco para abrir o manifesto e os detalhes da rota
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
