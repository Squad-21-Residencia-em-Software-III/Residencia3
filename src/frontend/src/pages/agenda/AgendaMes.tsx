import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ExcecaoAgenda } from '../../types/agenda';

interface AgendaMesProps {
  excecoes: Record<number, ExcecaoAgenda[]>;
  historicoMes: Record<number, number>;
  diaAtualNumero: number;
  onSelecionarDia: (dia: number) => void;
}

const DIAS_SEMANA_NOMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

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
    <div className="agenda-card">
      {/* ── Cabeçalho dos Dias da Semana ── */}
      <div className="mes-header-grid">
        {DIAS_SEMANA_NOMES.map((d) => (
          <div key={d} className="mes-header-col">
            {d}
          </div>
        ))}
      </div>

      {/* ── Grade de Calendário Mensal ── */}
      <div className="mes-calendar-grid">
        {/* Espaços vazios do início do mês (Seg, Ter, Qua) */}
        {Array.from({ length: offsetInicial }).map((_, i) => (
          <div
            key={`offset-${i}`}
            style={{
              borderRight: '1px solid var(--color-border-subtle)',
              borderBottom: '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-alt)',
            }}
          />
        ))}

        {/* Células de cada dia do mês */}
        {Array.from({ length: totalDias }, (_, i) => i + 1).map((dia) => {
          const isToday = dia === diaAtualNumero;
          const isPassado = dia < diaAtualNumero;
          const listaExcecoes = excecoes[dia] ?? [];
          const temExcecao = listaExcecoes.length > 0;
          const totalHistorico = historicoMes[dia];

          let classCustom = 'mes-day-cell';
          if (isToday) classCustom += ' is-today';
          if (isPassado) classCustom += ' is-passado';

          return (
            <button
              key={dia}
              type="button"
              className={classCustom}
              onClick={() => onSelecionarDia(dia)}
              title={
                temExcecao
                  ? `Dia ${dia}: clique para inspecionar as rotas detalhadas`
                  : `Dia ${dia}`
              }
            >
              <div className="mes-day-top">
                <span className="mes-day-num">{dia}</span>
                {isToday && (
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-primary)' }}>
                    Hoje
                  </span>
                )}
              </div>

              {/* Chips de Exceção (Apenas alertas nos dias futuros e hoje) */}
              {!isPassado && temExcecao && (
                <div className="mes-day-chips">
                  {listaExcecoes.map((exc, idx) => (
                    <div
                      key={idx}
                      className={`mes-chip mes-chip--${exc.tipo}`}
                      title={exc.mensagem}
                    >
                      {obterIconeExcecao(exc.tipo)}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {exc.mensagem}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Dias passados: quantitativo discreto */}
              {isPassado && totalHistorico !== undefined && (
                <div className="mes-day-past-total">
                  {totalHistorico} {totalHistorico === 1 ? 'viagem' : 'viagens'}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Rodapé de Legenda de Gestão por Exceção ── */}
      <div className="agenda-footer-legend">
        <span className="agenda-footer-tip">
          Apenas gargalos e horários de pico são sinalizados · Clique em qualquer dia para ver a timeline detalhada
        </span>
        <div className="agenda-legend-items">
          <div className="agenda-legend-item">
            <AlertCircle size={13} color="#b91c1c" />
            <span style={{ color: '#b91c1c' }}>Gargalo Operacional</span>
          </div>
          <div className="agenda-legend-item">
            <AlertTriangle size={13} color="#b45309" />
            <span style={{ color: '#b45309' }}>Horário de Pico</span>
          </div>
          <div className="agenda-legend-item">
            <CheckCircle2 size={13} color="#15803d" />
            <span style={{ color: '#15803d' }}>Capacidade Normal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
