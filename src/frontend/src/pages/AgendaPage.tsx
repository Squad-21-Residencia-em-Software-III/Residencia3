import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Alert, Button, Card } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../services/api/http';
import { veiculosApi } from '../services/api/veiculosApi';
import { viagensApi } from '../services/api/viagensApi';
import type { ModoVisualizacaoAgenda } from '../types/agenda';
import type { Veiculo } from '../types/veiculo';
import type { Viagem } from '../types/viagem';
import {
  adicionarDias,
  adicionarMeses,
  agruparRecursosAgenda,
  filtrarVeiculosPorPerfil,
  formatarDataIso,
  formatarTituloDia,
  formatarTituloMes,
  formatarTituloSemana,
  obterDiasSemana,
  obterGradeMes,
  parseDataIsoLocal,
  projetarViagensNoDia,
} from '../utils/agenda';
import { cn } from '../utils/cn';
import { DrawerDetalhesViagem } from './viagens/DrawerDetalhesViagem';
import { AgendaGanttHoje } from './agenda/AgendaGanttHoje';
import { AgendaMes } from './agenda/AgendaMes';
import { AgendaSemana } from './agenda/AgendaSemana';

const INTERVALO_POLLING_MS = 30_000;

export default function AgendaPage() {
  const { usuario } = useAuth();
  const hojeIso = formatarDataIso(new Date());
  const [dataReferenciaIso, setDataReferenciaIso] = useState<string>(hojeIso);
  const [modoVisualizacao, setModoVisualizacao] = useState<ModoVisualizacaoAgenda>('hoje');
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [erroInicial, setErroInicial] = useState<string | null>(null);
  const [erroAtualizacao, setErroAtualizacao] = useState<string | null>(null);
  const [viagemSelecionada, setViagemSelecionada] = useState<Viagem | null>(null);

  const jaCarregouRef = useRef<boolean>(false);
  const requisicaoEmAndamentoRef = useRef<boolean>(false);

  const carregarAgenda = useCallback(async (silencioso = false) => {
    if (requisicaoEmAndamentoRef.current) return;
    requisicaoEmAndamentoRef.current = true;

    if (!jaCarregouRef.current && !silencioso) {
      setCarregando(true);
    }

    try {
      const [listaViagens, listaVeiculos] = await Promise.all([
        viagensApi.listar(),
        veiculosApi.listar(),
      ]);
      setViagens(listaViagens);
      setVeiculos(listaVeiculos);
      jaCarregouRef.current = true;
      setErroInicial(null);
      setErroAtualizacao(null);
    } catch (erro) {
      const mensagem =
        erro instanceof ApiError && erro.status === 403
          ? 'Seu perfil não possui permissão para consultar a agenda operacional da frota.'
          : erro instanceof Error
            ? erro.message
            : 'Não foi possível carregar a agenda da frota.';

      if (!jaCarregouRef.current) {
        setErroInicial(mensagem);
      } else {
        setErroAtualizacao('Não foi possível sincronizar as últimas atualizações.');
      }
    } finally {
      setCarregando(false);
      requisicaoEmAndamentoRef.current = false;
    }
  }, []);

  useEffect(() => {
    void carregarAgenda(false);
  }, [carregarAgenda]);

  // Polling inteligente (30s) + revalidação ao voltar para a aba
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      if (!document.hidden) {
        void carregarAgenda(true);
      }
    }, INTERVALO_POLLING_MS);

    const aoRetornarParaAba = () => {
      if (!document.hidden && jaCarregouRef.current) {
        void carregarAgenda(true);
      }
    };

    document.addEventListener('visibilitychange', aoRetornarParaAba);
    window.addEventListener('focus', aoRetornarParaAba);

    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoRetornarParaAba);
      window.removeEventListener('focus', aoRetornarParaAba);
    };
  }, [carregarAgenda]);

  const diasSemana = useMemo(
    () => obterDiasSemana(dataReferenciaIso, hojeIso),
    [dataReferenciaIso, hojeIso],
  );

  const veiculosVisiveis = useMemo(
    () => filtrarVeiculosPorPerfil(veiculos, usuario?.perfil),
    [veiculos, usuario?.perfil],
  );

  const linhasHoje = useMemo(() => {
    const blocos = projetarViagensNoDia(viagens, dataReferenciaIso);
    return agruparRecursosAgenda(veiculosVisiveis, blocos);
  }, [viagens, veiculosVisiveis, dataReferenciaIso]);

  const linhasSemana = useMemo(() => {
    const blocosSemana = diasSemana.flatMap((d) => projetarViagensNoDia(viagens, d.data));
    return agruparRecursosAgenda(veiculosVisiveis, blocosSemana);
  }, [viagens, veiculosVisiveis, diasSemana]);

  const gradeMes = useMemo(() => {
    const ref = parseDataIsoLocal(dataReferenciaIso);
    return obterGradeMes(ref.getFullYear(), ref.getMonth(), viagens, hojeIso);
  }, [dataReferenciaIso, viagens, hojeIso]);

  const totalViagensHoje = useMemo(
    () => projetarViagensNoDia(viagens, dataReferenciaIso).length,
    [viagens, dataReferenciaIso],
  );

  const navegarPeriodo = (direcao: -1 | 1) => {
    setDataReferenciaIso((atual) => {
      if (modoVisualizacao === 'hoje') return adicionarDias(atual, direcao);
      if (modoVisualizacao === 'semana') return adicionarDias(atual, direcao * 7);
      return adicionarMeses(atual, direcao);
    });
  };

  const tituloPrincipal =
    modoVisualizacao === 'hoje'
      ? formatarTituloDia(dataReferenciaIso, hojeIso)
      : modoVisualizacao === 'semana'
        ? formatarTituloSemana(diasSemana)
        : formatarTituloMes(dataReferenciaIso);

  const handleSelecionarDiaNoMes = (dataIso: string) => {
    setDataReferenciaIso(dataIso);
    setModoVisualizacao('hoje');
  };

  const ehHojeSelecionado = dataReferenciaIso === hojeIso;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 md:gap-5">
      {/* ── Barra de Cabeçalho e Controles da Agenda ── */}
      <Card className="flex shrink-0 flex-col items-stretch justify-between gap-3 p-3 md:flex-row md:items-center md:px-6 md:py-3.5">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 md:w-auto md:justify-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navegarPeriodo(-1)}
            className="h-8 w-8 px-0"
            aria-label="Período anterior"
            title="Período anterior"
          >
            <ChevronLeft size={16} />
          </Button>

          <div
            key={`${modoVisualizacao}-${dataReferenciaIso}`}
            className="animate-agenda-fade"
          >
            <span className="block text-center font-display text-[0.875rem] font-bold text-text md:inline md:text-left md:text-base">
              {tituloPrincipal}
            </span>
            <span className="mt-0.5 block text-center text-[0.6875rem] text-text-muted md:mt-0 md:ml-3 md:inline md:text-left md:text-xs">
              {totalViagensHoje} {totalViagensHoje === 1 ? 'viagem' : 'viagens'}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navegarPeriodo(1)}
            className="h-8 w-8 px-0"
            aria-label="Próximo período"
            title="Próximo período"
          >
            <ChevronRight size={16} />
          </Button>

          {!ehHojeSelecionado && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 animate-agenda-fade"
              onClick={() => setDataReferenciaIso(hojeIso)}
            >
              Voltar para Hoje
            </Button>
          )}
        </div>

        <div className="flex items-center justify-end md:w-auto">
          {/* Seletor Segmentado de Visualização (Dia | Semana | Mês) com indicador deslizante */}
          <div
            role="tablist"
            aria-label="Modo de visualização da agenda"
            className="relative grid flex-1 grid-cols-3 rounded-lg border border-border bg-surface-alt p-1 md:w-[240px] md:flex-none"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-md bg-primary shadow-sm transition-transform duration-300 ease-out"
              style={{
                transform: `translateX(${
                  modoVisualizacao === 'hoje' ? '0%' : modoVisualizacao === 'semana' ? '100%' : '200%'
                })`,
              }}
            />
            {(['hoje', 'semana', 'mes'] as const).map((modo) => {
              const label = modo === 'hoje' ? 'Dia' : modo === 'semana' ? 'Semana' : 'Mês';
              const isAtivo = modoVisualizacao === modo;
              return (
                <button
                  key={modo}
                  type="button"
                  role="tab"
                  aria-selected={isAtivo}
                  onClick={() => setModoVisualizacao(modo)}
                  className={cn(
                    'relative z-1 cursor-pointer rounded-md py-1.5 text-center font-display text-xs font-semibold transition-colors duration-200',
                    isAtivo ? 'text-white' : 'text-text-muted hover:text-text',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {erroAtualizacao && (
        <Alert tone="warning" className="shrink-0">
          {erroAtualizacao}
        </Alert>
      )}

      {/* ── Estados de Carregamento / Erro / Visualizações ── */}
      {carregando ? (
        <Card className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-text-muted">
          Carregando agenda operacional da frota...
        </Card>
      ) : erroInicial ? (
        <Card className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8">
          <Alert tone="danger" className="max-w-lg">
            {erroInicial}
          </Alert>
          <Button type="button" onClick={() => void carregarAgenda(false)}>
            Tentar novamente
          </Button>
        </Card>
      ) : (
        <div
          key={modoVisualizacao}
          className="animate-agenda-fade flex min-h-0 flex-1 flex-col"
        >
          {modoVisualizacao === 'hoje' && (
            <AgendaGanttHoje
              linhas={linhasHoje}
              dataReferenciaIso={dataReferenciaIso}
              ehHoje={ehHojeSelecionado}
              onSelecionarViagem={setViagemSelecionada}
            />
          )}

          {modoVisualizacao === 'semana' && (
            <AgendaSemana
              linhas={linhasSemana}
              diasSemana={diasSemana}
              onSelecionarViagem={setViagemSelecionada}
            />
          )}

          {modoVisualizacao === 'mes' && (
            <AgendaMes
              offsetInicial={gradeMes.offsetInicial}
              celulas={gradeMes.celulas}
              onSelecionarDia={handleSelecionarDiaNoMes}
            />
          )}
        </div>
      )}

      {/* ── Drawer Lateral de Detalhes (reutilizado do módulo de Viagens) ── */}
      <DrawerDetalhesViagem
        viagem={viagemSelecionada}
        onClose={() => setViagemSelecionada(null)}
      />
    </div>
  );
}
