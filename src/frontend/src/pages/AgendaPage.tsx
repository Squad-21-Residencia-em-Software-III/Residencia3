import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '../components/ui';
import type { DiaAgendaSemana, ModoVisualizacaoAgenda, RotaAgenda } from '../types/agenda';
import { storageService } from '../services/storageService';
import { cn } from '../utils/cn';
import { AgendaGanttHoje } from './agenda/AgendaGanttHoje';
import { AgendaSemana } from './agenda/AgendaSemana';
import { AgendaMes } from './agenda/AgendaMes';
import { ModalDetalhesRota } from './agenda/ModalDetalhesRota';

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
  const agenda = useMemo(() => storageService.getAgenda(), []);

  // Totais do dia
  const totalRotasHoje = agenda.hoje.length;
  const veiculosUnicosHoje = new Set(agenda.hoje.map((r) => r.veiculo_id)).size;

  const handleSelecionarDiaNoMes = (_dia: number) => {
    // Ao clicar em um dia no mês, abre a timeline daquele dia
    setModoVisualizacao('hoje');
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:gap-5">
      {/* ── Barra de Cabeçalho e Controles da Agenda ── */}
      <Card className="flex shrink-0 flex-col items-stretch justify-between gap-3 p-3 md:flex-row md:items-center md:px-6 md:py-3.5">
        <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-start">
          <button
            type="button"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-all duration-150 hover:border-border-strong hover:bg-surface-alt hover:text-text"
            aria-label="Dia anterior"
            title="Dia anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <div>
            <span className="block text-center font-display text-[14px] font-bold text-text md:inline md:text-left md:text-base">
              Segunda-feira, 19 de Outubro de 2026
            </span>
            <span className="mt-0.5 block text-center text-[11px] text-text-muted md:mt-0 md:ml-3 md:inline md:text-left md:text-xs">
              Hoje · {totalRotasHoje} viagens · {veiculosUnicosHoje} veículos alocados
            </span>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-all duration-150 hover:border-border-strong hover:bg-surface-alt hover:text-text"
            aria-label="Próximo dia"
            title="Próximo dia"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Seletor Segmentado de Visualização (Hoje | Semana | Mês) */}
        <div className="flex w-full items-center overflow-hidden rounded-lg border-[1.5px] border-border bg-surface md:w-auto">
          {(['hoje', 'semana', 'mes'] as const).map((modo) => {
            const label = modo === 'hoje' ? 'Hoje' : modo === 'semana' ? 'Semana' : 'Mês';
            const isAtivo = modoVisualizacao === modo;
            return (
              <button
                key={modo}
                type="button"
                onClick={() => setModoVisualizacao(modo)}
                className={cn(
                  'flex-1 cursor-pointer border-r border-border px-0 py-2 text-center font-display text-[13px] font-semibold transition-all duration-150 last:border-r-0 md:flex-none md:px-4 md:py-1.5 md:text-xs',
                  isAtivo
                    ? 'bg-primary text-white'
                    : 'bg-transparent text-text-muted hover:bg-surface-alt hover:text-text',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── Visualização Ativa ── */}
      {modoVisualizacao === 'hoje' && (
        <AgendaGanttHoje rotas={agenda.hoje} onSelecionarRota={setRotaSelecionada} />
      )}

      {modoVisualizacao === 'semana' && (
        <AgendaSemana
          rotas={agenda.semana}
          diasSemana={DIAS_SEMANA_DADOS}
          onSelecionarRota={setRotaSelecionada}
        />
      )}

      {modoVisualizacao === 'mes' && (
        <AgendaMes
          excecoes={agenda.excecoesMes}
          historicoMes={agenda.historicoMes}
          diaAtualNumero={19}
          onSelecionarDia={handleSelecionarDiaNoMes}
        />
      )}

      {/* ── Modal de Detalhes da Rota (Alinhado ao Banco) ── */}
      <ModalDetalhesRota rota={rotaSelecionada} onClose={() => setRotaSelecionada(null)} />
    </div>
  );
}
