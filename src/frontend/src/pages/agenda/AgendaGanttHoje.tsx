import { useRef } from 'react';
import type { RotaAgenda } from '../../types/agenda';

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
  const veiculosMap = new Map<number, {
    id: number;
    modelo: string;
    placa: string;
    motorista_nome: string;
    rotas: RotaAgenda[];
  }>();

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
    <div className="agenda-card">
      {/* ── Linha de Horas Fixa no Topo (Header Sticky) ── */}
      <div className="gantt-header-sticky">
        <div className="gantt-corner-label">Recurso / Veículo</div>
        <div className="gantt-hours-scroll" ref={headerScrollRef}>
          <div className="gantt-hours-track" style={{ width: `${LARGURA_TOTAL_GRADE}px` }}>
            {horas.slice(0, -1).map((h) => (
              <div key={h} className="gantt-hour-cell">
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Corpo do Gantt: Labels Fixos + Grade de Blocos ── */}
      <div className="gantt-body-container">
        {/* Coluna fixa de Recursos à esquerda */}
        <div className="gantt-resource-labels" ref={resourceScrollRef}>
          {linhas.map((linha) => (
            <div key={linha.id} className="gantt-resource-row">
              <div className="gantt-resource-model" title={linha.modelo}>
                {linha.modelo}
              </div>
              <div className="gantt-resource-sub">
                <span className="gantt-resource-plate">{linha.placa}</span>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>·</span>
                <span className="gantt-resource-driver" title={linha.motorista_nome}>
                  {linha.motorista_nome.split(' ')[0]}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Grade de tempo com scroll bidirecional */}
        <div className="gantt-grid-scroll" onScroll={handleGridScroll}>
          <div
            className="gantt-grid-canvas"
            style={{
              width: `${LARGURA_TOTAL_GRADE}px`,
              minHeight: `${linhas.length * ALTURA_LINHA_PX}px`,
            }}
          >
            {/* Linhas de grade verticais (Horas) */}
            {horas.slice(0, -1).map((h, i) => (
              <div
                key={h}
                className="gantt-grid-line-hour"
                style={{ left: `${i * HORA_LARGURA_PX}px` }}
              />
            ))}

            {/* Linhas de grade horizontais (Linhas de veículos) */}
            {linhas.map((_, i) => (
              <div
                key={i}
                className="gantt-grid-line-row"
                style={{ top: `${(i + 1) * ALTURA_LINHA_PX}px` }}
              />
            ))}

            {/* Marcador vertical dinâmico do "Agora" */}
            {agoraLeft >= 0 && agoraLeft <= LARGURA_TOTAL_GRADE && (
              <div className="gantt-now-line" style={{ left: `${agoraLeft}px` }}>
                <div className="gantt-now-badge">09:17</div>
                <div className="gantt-now-bar" />
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

                const statusClass = `gantt-block--${rota.status.toLowerCase()}`;

                return (
                  <div
                    key={rota.id}
                    onClick={() => onSelecionarRota(rota)}
                    className={`gantt-block ${statusClass}`}
                    style={{
                      top: `${top + 7}px`,
                      height: `${ALTURA_LINHA_PX - 14}px`,
                      left: `${left + 2}px`,
                      width: `${width - 4}px`,
                    }}
                    title={`#${rota.id}: ${rota.origem} → ${rota.destino} (${rota.hora_inicio} às ${rota.hora_fim})`}
                  >
                    <div className="gantt-block__content">
                      <span className="gantt-block__dot" />
                      <div className="gantt-block__info">
                        <span className="gantt-block__route">
                          {rota.origem.split(' - ')[0]} → {rota.destino.split(' - ')[0]}
                        </span>
                        {width >= 90 && (
                          <span className="gantt-block__meta">
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
      <div className="agenda-footer-legend">
        <span className="agenda-footer-tip">
          Clique em qualquer bloco para abrir o manifesto e os detalhes da rota
        </span>
        <div className="agenda-legend-items">
          <div className="agenda-legend-item">
            <span className="agenda-legend-dot" style={{ background: '#2563eb' }} />
            <span>Em Andamento</span>
          </div>
          <div className="agenda-legend-item">
            <span className="agenda-legend-dot" style={{ background: '#7c3aed' }} />
            <span>Agendada</span>
          </div>
          <div className="agenda-legend-item">
            <span className="agenda-legend-dot" style={{ background: '#94a3b8' }} />
            <span>Concluída</span>
          </div>
        </div>
      </div>
    </div>
  );
}
