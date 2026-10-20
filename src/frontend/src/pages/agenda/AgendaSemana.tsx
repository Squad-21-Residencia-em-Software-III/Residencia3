import type { DiaAgendaSemana, RotaAgenda } from '../../types/agenda';

interface AgendaSemanaProps {
  rotas: RotaAgenda[];
  diasSemana: DiaAgendaSemana[];
  onSelecionarRota: (rota: RotaAgenda) => void;
}

const HORA_INICIO_MIN = 6 * 60; // 06:00
const HORA_FIM_MIN = 20 * 60; // 20:00
const INTERVALO_MIN = HORA_FIM_MIN - HORA_INICIO_MIN;

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

  return (
    <div className="agenda-card">
      {/* ── Cabeçalho dos 7 Dias da Semana ── */}
      <div className="semana-header">
        <div className="gantt-corner-label">Recurso / Veículo</div>
        {diasSemana.map((d) => (
          <div
            key={d.data}
            className={`semana-day-col-header ${d.isToday ? 'is-today' : ''}`}
          >
            <span className="semana-day-label">{d.label}</span>
            <span className="semana-day-number">{d.diaNumero}</span>
          </div>
        ))}
      </div>

      {/* ── Corpo da Grade Semanal ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {linhas.map((linha) => (
          <div key={linha.id} className="semana-row">
            {/* Coluna fixa do Veículo */}
            <div className="gantt-resource-labels" style={{ borderBottom: 'none' }}>
              <div className="gantt-resource-row" style={{ height: '54px', borderBottom: 'none' }}>
                <div className="gantt-resource-model" title={linha.modelo}>
                  {linha.modelo}
                </div>
                <div className="gantt-resource-sub">
                  <span className="gantt-resource-plate">{linha.placa}</span>
                </div>
              </div>
            </div>

            {/* Células diárias com mini-timeline */}
            {diasSemana.map((d) => {
              const rotasDoDia = linha.rotas.filter((r) => r.data === d.data);

              return (
                <div
                  key={d.data}
                  className={`semana-day-cell ${d.isToday ? 'is-today' : ''}`}
                >
                  {/* Linha guia central horizontal */}
                  <div className="semana-guide-line" />

                  {/* Barras proporcionais de viagem com tooltip flutuante */}
                  {rotasDoDia.map((rota) => {
                    const leftPct = calcularPorcentagemEsquerda(rota.hora_inicio);
                    const widthPct = calcularPorcentagemLargura(rota.hora_inicio, rota.hora_fim);
                    const statusClass = `semana-micro-bar--${rota.status.toLowerCase()}`;

                    return (
                      <div
                        key={rota.id}
                        onClick={() => onSelecionarRota(rota)}
                        className={`semana-micro-bar ${statusClass}`}
                        style={{
                          left: `calc(4px + ${leftPct * 0.9}%)`,
                          width: `${Math.max(widthPct * 0.9, 8)}%`,
                        }}
                      >
                        {/* Tooltip flutuante ao passar o mouse */}
                        <div className="semana-tooltip">
                          <strong style={{ color: '#93c5fd' }}>
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
      <div className="agenda-footer-legend">
        <span className="agenda-footer-tip">
          Passe o mouse sobre os blocos para ver o horário e rota · Clique para abrir
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
