import { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { EmptyState } from '../../components/ui';
import type { LinhaRecursoAgenda } from '../../types/agenda';
import type { Viagem } from '../../types/viagem';
import { alocarSubfaixasBlocos, obterResumoTrajeto } from '../../utils/agenda';
import { cn } from '../../utils/cn';
import { BLOCO_STATUS, LegendaStatusAgenda, MARCADOR_STATUS, rotuloStatusAgenda } from './statusAgenda';

interface AgendaGanttHojeProps {
  linhas: LinhaRecursoAgenda[];
  dataReferenciaIso: string;
  ehHoje: boolean;
  onSelecionarViagem: (viagem: Viagem) => void;
}

const HORA_INICIO = 0; // 00:00 (operação SVO 24h)
const HORA_FIM = 24; // 24:00
const HORA_LARGURA_PX = 80;
const ALTURA_FAIXA_PX = 52;
const PADDING_LINHA_PX = 8;
const TOTAL_HORAS = HORA_FIM - HORA_INICIO;
const LARGURA_TOTAL_GRADE = TOTAL_HORAS * HORA_LARGURA_PX;


function obterMinutosAtuais(): number {
  const agora = new Date();
  return agora.getHours() * 60 + agora.getMinutes();
}

function formatarMinutosParaHora(minutos: number): string {
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const m = String(minutos % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function AgendaGanttHoje({
  linhas,
  dataReferenciaIso,
  ehHoje,
  onSelecionarViagem,
}: AgendaGanttHojeProps) {
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const resourceScrollRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const primeiroMountRef = useRef<boolean>(true);
  const [agoraMinutos, setAgoraMinutos] = useState<number>(() => obterMinutosAtuais());

  // Atualiza o marcador do horário real a cada minuto enquanto estiver na visão de hoje
  useEffect(() => {
    if (!ehHoje) return;
    setAgoraMinutos(obterMinutosAtuais());
    const timer = window.setInterval(() => {
      setAgoraMinutos(obterMinutosAtuais());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [ehHoje]);

  // Posiciona o scroll horizontal: imediato na abertura e suave ao navegar entre dias ou voltar para Hoje
  useEffect(() => {
    const grid = gridScrollRef.current;
    if (!grid) return;
    const horaAlvo = ehHoje ? Math.max(0, new Date().getHours() - 1) : 7;
    const scrollAlvo = horaAlvo * HORA_LARGURA_PX;

    if (!primeiroMountRef.current && typeof grid.scrollTo === 'function') {
      grid.scrollTo({ left: scrollAlvo, behavior: 'smooth' });
    } else {
      grid.scrollLeft = scrollAlvo;
      if (headerScrollRef.current) {
        headerScrollRef.current.scrollLeft = scrollAlvo;
      }
    }
    primeiroMountRef.current = false;
  }, [ehHoje, dataReferenciaIso]);

  const horas = Array.from({ length: TOTAL_HORAS }, (_, i) => HORA_INICIO + i);
  const agoraLeft = (agoraMinutos / 60) * HORA_LARGURA_PX;

  const linhasComLayout = (() => {
    let topAcumulado = 0;
    return linhas.map((linha) => {
      const { blocosComFaixa, totalFaixas } = alocarSubfaixasBlocos(linha.blocos);
      const alturaLinha = totalFaixas * ALTURA_FAIXA_PX + PADDING_LINHA_PX;
      const topLinha = topAcumulado;
      topAcumulado += alturaLinha;
      return {
        linha,
        blocosComFaixa,
        alturaLinha,
        topLinha,
      };
    });
  })();

  const alturaTotalGrade =
    linhasComLayout.length > 0
      ? linhasComLayout[linhasComLayout.length - 1].topLinha +
        linhasComLayout[linhasComLayout.length - 1].alturaLinha
      : 0;

  const handleGridScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = target.scrollLeft;
    }
    if (resourceScrollRef.current) {
      resourceScrollRef.current.scrollTop = target.scrollTop;
    }
  };

  if (linhas.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-surface p-6 shadow-card">
        <EmptyState
          icon={<Calendar size={24} />}
          title="Nenhum veículo ou viagem para exibir"
          description="Quando houver veículos ativos na frota ou viagens alocadas neste dia, eles aparecerão nesta grade."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {/* ── Linha de Horas Fixa no Topo (00:00 às 23:00) ── */}
      <div className="relative z-5 flex shrink-0 border-b border-border bg-surface-alt">
        <div className="flex h-[38px] w-[120px] shrink-0 items-center border-r border-border px-2 font-display text-[0.625rem] font-bold tracking-[0.05em] text-text-muted uppercase md:w-[190px] md:px-4 md:text-[0.6875rem]">
          Veículo
        </div>
        <div className="flex-1 overflow-x-hidden" ref={headerScrollRef}>
          <div className="flex" style={{ width: `${LARGURA_TOTAL_GRADE}px` }}>
            {horas.map((h) => (
              <div
                key={h}
                className={cn(
                  'flex h-[38px] w-[80px] shrink-0 items-center border-r border-divider pl-2 text-[0.6875rem] font-semibold',
                  h < 7 || h >= 17 ? 'bg-surface/40 text-text-muted/80' : 'text-text-muted',
                )}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Corpo do Gantt: Labels Fixos + Grade de Blocos ── */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className="w-[120px] shrink-0 overflow-y-hidden border-r border-border bg-surface md:w-[190px]"
          ref={resourceScrollRef}
        >
          {linhasComLayout.map(({ linha, alturaLinha }) => {
            const emViagem =
              linha.blocos.some((b) => b.viagem.status === 'EM_ANDAMENTO' || b.viagem.status === 'NO_LOCAL') ||
              (ehHoje && linha.statusVeiculo === 'EM_USO');
            const subtituloSecundario = emViagem ? 'Em viagem' : 'No pátio';

            return (
              <div
                key={linha.id}
                className="flex flex-col justify-center border-b border-divider px-2 md:px-4"
                style={{ height: `${alturaLinha}px` }}
              >
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
                  <span className="text-[0.625rem] text-text-muted">·</span>
                  <span
                    className={cn(
                      'truncate text-[0.6875rem]',
                      emViagem ? 'font-semibold text-primary' : 'text-text-muted',
                    )}
                    title={subtituloSecundario}
                  >
                    {subtituloSecundario}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Grade de tempo 24h com scroll bidirecional */}
        <div
          className="relative flex-1 overflow-auto"
          ref={gridScrollRef}
          onScroll={handleGridScroll}
        >
          <div
            className="relative"
            style={{
              width: `${LARGURA_TOTAL_GRADE}px`,
              minHeight: `${alturaTotalGrade}px`,
            }}
          >
            {/* Faixas verticais 24h (destaca janela comercial 07:00–17:00 vs plantão SVO) */}
            {horas.map((h, i) => (
              <div
                key={h}
                className={cn(
                  'pointer-events-none absolute top-0 bottom-0 z-1 border-l border-divider',
                  (h < 7 || h >= 17) && 'bg-surface-alt/40',
                )}
                style={{ left: `${i * HORA_LARGURA_PX}px`, width: `${HORA_LARGURA_PX}px` }}
              />
            ))}

            {/* Linhas horizontais dos veículos */}
            {linhasComLayout.map(({ linha, topLinha, alturaLinha }) => (
              <div
                key={linha.id}
                className="pointer-events-none absolute right-0 left-0 z-1 border-t border-divider"
                style={{ top: `${topLinha + alturaLinha}px` }}
              />
            ))}

            {/* Marcador vertical dinâmico do horário real ("Agora") */}
            {ehHoje && agoraLeft >= 0 && agoraLeft <= LARGURA_TOTAL_GRADE && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 flex flex-col items-center"
                style={{ left: `${agoraLeft}px` }}
              >
                <div className="rounded-sm bg-primary px-1.5 py-[1px] text-[0.625rem] font-bold whitespace-nowrap text-white shadow-[0_2px_4px_rgba(21,84,184,0.3)]">
                  {formatarMinutosParaHora(agoraMinutos)}
                </div>
                <div className="w-0.5 flex-1 bg-primary shadow-[0_0_4px_rgba(21,84,184,0.4)]" />
              </div>
            )}

            {/* Blocos de Viagem Posicionados Proporcionalmente (empilhados se houver sobreposição) */}
            {linhasComLayout.map(({ blocosComFaixa, topLinha }) =>
              blocosComFaixa.map((bloco) => {
                const { viagem } = bloco;
                const left = (bloco.inicioMin / 60) * HORA_LARGURA_PX;
                const duracaoHoras = (bloco.fimMin - bloco.inicioMin) / 60;
                const width = Math.max(duracaoHoras * HORA_LARGURA_PX, 56);
                const top = topLinha + PADDING_LINHA_PX / 2 + bloco.faixa * ALTURA_FAIXA_PX;

                const rotuloStatus = rotuloStatusAgenda(viagem.status);
                const resumoTrajeto = obterResumoTrajeto(viagem);
                const faixaHorario = `${bloco.horaInicioLabel}–${bloco.horaFimLabel}`;

                return (
                  <button
                    key={bloco.chave}
                    type="button"
                    onClick={() => onSelecionarViagem(viagem)}
                    className={cn(
                      'absolute z-3 flex cursor-pointer items-center overflow-hidden rounded-lg border-[1.5px] px-3 text-left shadow-[0_1px_3px_rgba(13,27,53,0.08)] transition-all duration-150 hover:z-8 hover:-translate-y-px hover:shadow-[0_4px_10px_rgba(13,27,53,0.15)]',
                      BLOCO_STATUS[viagem.status],
                    )}
                    style={{
                      top: `${top + 3}px`,
                      height: `${ALTURA_FAIXA_PX - 6}px`,
                      left: `${left + 2}px`,
                      width: `${width - 4}px`,
                    }}
                    title={`#${viagem.id} (${viagem.tipo_operacao}) · ${rotuloStatus}: ${resumoTrajeto} (${faixaHorario})`}
                  >
                    <div className="flex w-full min-w-0 items-center gap-2">
                      <span
                        className={cn('size-2 shrink-0 rounded-[2px]', MARCADOR_STATUS[viagem.status])}
                        aria-hidden="true"
                      />
                      <span className="sr-only">{rotuloStatus}: </span>
                      <div className="flex min-w-0 flex-col leading-[1.2]">
                        <span className="truncate font-display text-[0.6875rem] font-bold md:text-xs">
                          {resumoTrajeto}
                        </span>
                        {width >= 90 && (
                          <span className="truncate text-[0.625rem] opacity-75 md:text-[0.6875rem]">
                            {faixaHorario}
                            {bloco.semPrevisaoFim ? ' · sem previsão de retorno' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              }),
            )}
          </div>
        </div>
      </div>

      {/* ── Rodapé de Legenda de Status ── */}
      <div className="flex shrink-0 flex-col-reverse items-stretch justify-between gap-2 border-t border-border bg-surface-alt px-3 py-2.5 md:flex-row md:items-center md:px-5">
        <span className="text-[0.6875rem] text-text-muted md:text-xs">
          Grade 24h (SVO contínuo · 07h–17h comercial) · Clique em um bloco para ver detalhes
        </span>
        <LegendaStatusAgenda />
      </div>
    </div>
  );
}
