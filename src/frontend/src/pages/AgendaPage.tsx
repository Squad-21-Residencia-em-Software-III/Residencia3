import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Alert, Button, Card } from '../components/ui';
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
  const hojeIso = formatarDataIso(new Date());
  const [dataReferenciaIso, setDataReferenciaIso] = useState<string>(hojeIso);
  const [modoVisualizacao, setModoVisualizacao] = useState<ModoVisualizacaoAgenda>('hoje');
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [atualizando, setAtualizando] = useState<boolean>(false);
  const [erroInicial, setErroInicial] = useState<string | null>(null);
  const [erroAtualizacao, setErroAtualizacao] = useState<string | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);
  const [viagemSelecionada, setViagemSelecionada] = useState<Viagem | null>(null);

  const jaCarregouRef = useRef<boolean>(false);
  const requisicaoEmAndamentoRef = useRef<boolean>(false);

  const carregarAgenda = useCallback(async (silencioso = false) => {
    if (requisicaoEmAndamentoRef.current) return;
    requisicaoEmAndamentoRef.current = true;

    if (!jaCarregouRef.current && !silencioso) {
      setCarregando(true);
    } else {
      setAtualizando(true);
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
      const agora = new Date();
      setUltimaAtualizacao(
        `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`,
      );
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
      setAtualizando(false);
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

  const linhasHoje = useMemo(() => {
    const blocos = projetarViagensNoDia(viagens, dataReferenciaIso);
    return agruparRecursosAgenda(veiculos, blocos);
  }, [viagens, veiculos, dataReferenciaIso]);

  const linhasSemana = useMemo(() => {
    const blocosSemana = diasSemana.flatMap((d) => projetarViagensNoDia(viagens, d.data));
    return agruparRecursosAgenda(veiculos, blocosSemana);
  }, [viagens, veiculos, diasSemana]);

  const gradeMes = useMemo(() => {
    const ref = parseDataIsoLocal(dataReferenciaIso);
    return obterGradeMes(ref.getFullYear(), ref.getMonth(), viagens, hojeIso);
  }, [dataReferenciaIso, viagens, hojeIso]);

  const totalViagensHoje = useMemo(
    () => projetarViagensNoDia(viagens, dataReferenciaIso).length,
    [viagens, dataReferenciaIso],
  );
  const veiculosComViagemHoje = useMemo(
    () => new Set(projetarViagensNoDia(viagens, dataReferenciaIso).map((b) => b.viagem.veiculo_id)).size,
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
      ? formatarTituloDia(dataReferenciaIso)
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
        <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-start">
          <button
            type="button"
            onClick={() => navegarPeriodo(-1)}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-all duration-150 hover:border-border-strong hover:bg-surface-alt hover:text-text"
            aria-label="Período anterior"
            title="Período anterior"
          >
            <ChevronLeft size={16} />
          </button>

          <div>
            <span className="block text-center font-display text-[14px] font-bold text-text md:inline md:text-left md:text-base">
              {tituloPrincipal}
            </span>
            <span className="mt-0.5 block text-center text-[11px] text-text-muted md:mt-0 md:ml-3 md:inline md:text-left md:text-xs">
              {ehHojeSelecionado ? 'Hoje · ' : ''}
              {totalViagensHoje} {totalViagensHoje === 1 ? 'viagem' : 'viagens'} ·{' '}
              {veiculosComViagemHoje}{' '}
              {veiculosComViagemHoje === 1 ? 'veículo alocado' : 'veículos alocados'}
              {ultimaAtualizacao ? ` · Atualizado às ${ultimaAtualizacao}` : ''}
            </span>
          </div>

          <button
            type="button"
            onClick={() => navegarPeriodo(1)}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-all duration-150 hover:border-border-strong hover:bg-surface-alt hover:text-text"
            aria-label="Próximo período"
            title="Próximo período"
          >
            <ChevronRight size={16} />
          </button>

          {!ehHojeSelecionado && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDataReferenciaIso(hojeIso)}
            >
              Hoje
            </Button>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center md:w-auto">
          <button
            type="button"
            onClick={() => void carregarAgenda(true)}
            disabled={atualizando || carregando}
            className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-text-muted transition-all duration-150 hover:border-border-strong hover:bg-surface-alt hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Atualizar agenda"
            title="Atualizar agenda"
          >
            <RefreshCw size={13} className={cn(atualizando && 'animate-spin')} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

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
        <>
          {modoVisualizacao === 'hoje' && (
            <AgendaGanttHoje
              linhas={linhasHoje}
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
        </>
      )}

      {/* ── Drawer Lateral de Detalhes (reutilizado do módulo de Viagens) ── */}
      <DrawerDetalhesViagem
        viagem={viagemSelecionada}
        onClose={() => setViagemSelecionada(null)}
      />
    </div>
  );
}
