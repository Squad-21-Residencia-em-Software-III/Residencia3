import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '../components/ui';
import type { DiaAgendaSemana, ModoVisualizacaoAgenda, RotaAgenda } from '../types/agenda';
import {
  MOCK_AGENDA_HOJE,
  MOCK_AGENDA_SEMANA,
  MOCK_EXCECOES_MES,
  MOCK_HISTORICO_MES,
} from '../services/mocks/agendaMock';
import { AgendaGanttHoje } from './agenda/AgendaGanttHoje';
import { AgendaSemana } from './agenda/AgendaSemana';
import { AgendaMes } from './agenda/AgendaMes';
import { ModalDetalhesRota } from './agenda/ModalDetalhesRota';
import './agenda/agenda.css';

const DIAS_SEMANA_DADOS: DiaAgendaSemana[] = [
  { data: '2026-10-19', label: 'Seg', diaNumero: 19, isToday: true },
  { data: '2026-10-20', label: 'Ter', diaNumero: 20, isToday: false },
  { data: '2026-10-21', label: 'Qua', diaNumero: 21, isToday: false },
  { data: '2026-10-22', label: 'Qui', diaNumero: 22, isToday: false },
  { data: '2026-10-23', label: 'Sex', diaNumero: 23, isToday: false },
  { data: '2026-10-24', label: 'Sáb', diaNumero: 24, isToday: false },
  { data: '2026-10-25', label: 'Dom', diaNumero: 25, isToday: false },
];

export default function AgendaPage() {
  const [modoVisualizacao, setModoVisualizacao] = useState<ModoVisualizacaoAgenda>('hoje');
  const [rotaSelecionada, setRotaSelecionada] = useState<RotaAgenda | null>(null);

  // Totais do dia
  const totalRotasHoje = MOCK_AGENDA_HOJE.length;
  const veiculosUnicosHoje = new Set(MOCK_AGENDA_HOJE.map((r) => r.veiculo_id)).size;

  const handleSelecionarDiaNoMes = (_dia: number) => {
    // Ao clicar em um dia no mês, abre a timeline daquele dia
    setModoVisualizacao('hoje');
  };

  return (
    <div className="agenda-container">
      {/* ── Barra de Cabeçalho e Controles da Agenda ── */}
      <Card className="agenda-header">
        <div className="agenda-header__nav">
          <button
            type="button"
            className="agenda-header__nav-btn"
            aria-label="Dia anterior"
            title="Dia anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <div>
            <span className="agenda-header__date-title">
              Segunda-feira, 19 de Outubro de 2026
            </span>
            <span className="agenda-header__date-sub">
              Hoje · {totalRotasHoje} viagens · {veiculosUnicosHoje} veículos alocados
            </span>
          </div>
          <button
            type="button"
            className="agenda-header__nav-btn"
            aria-label="Próximo dia"
            title="Próximo dia"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Seletor Segmentado de Visualização (Hoje | Semana | Mês) */}
        <div className="agenda-view-toggle">
          <button
            type="button"
            onClick={() => setModoVisualizacao('hoje')}
            className={`agenda-view-toggle__btn ${modoVisualizacao === 'hoje' ? 'is-active' : ''}`}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setModoVisualizacao('semana')}
            className={`agenda-view-toggle__btn ${modoVisualizacao === 'semana' ? 'is-active' : ''}`}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => setModoVisualizacao('mes')}
            className={`agenda-view-toggle__btn ${modoVisualizacao === 'mes' ? 'is-active' : ''}`}
          >
            Mês
          </button>
        </div>
      </Card>

      {/* ── Visualização Ativa ── */}
      {modoVisualizacao === 'hoje' && (
        <AgendaGanttHoje
          rotas={MOCK_AGENDA_HOJE}
          onSelecionarRota={setRotaSelecionada}
        />
      )}

      {modoVisualizacao === 'semana' && (
        <AgendaSemana
          rotas={MOCK_AGENDA_SEMANA}
          diasSemana={DIAS_SEMANA_DADOS}
          onSelecionarRota={setRotaSelecionada}
        />
      )}

      {modoVisualizacao === 'mes' && (
        <AgendaMes
          excecoes={MOCK_EXCECOES_MES}
          historicoMes={MOCK_HISTORICO_MES}
          diaAtualNumero={19}
          onSelecionarDia={handleSelecionarDiaNoMes}
        />
      )}

      {/* ── Modal de Detalhes da Rota (Alinhado ao Banco) ── */}
      <ModalDetalhesRota
        rota={rotaSelecionada}
        onClose={() => setRotaSelecionada(null)}
      />
    </div>
  );
}
