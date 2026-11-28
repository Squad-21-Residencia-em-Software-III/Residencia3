import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Map as MapIcon, WifiOff } from 'lucide-react';
import { PIN_FSPH_URL } from '../../config/mapas';
import type {
  CoordenadaMapa,
  HistoricoGeograficoMapa,
  MetodoDistanciaRota,
  OdometroRotaMapa,
  PontoRotaMapa,
  RotaPlanejadaMapa,
} from '../../types/mapa';
import { cn } from '../../utils/cn';
import {
  LIMITE_PRECISAO_CIRCULO_METROS,
  calcularDistanciaOdometroKm,
  calcularLimitesCoordenadas,
  coordenadaMapaValida,
  criarFeatureCollectionLinhas,
  decodificarPolyline5,
  formatarDistanciaKm,
  formatarHorarioCheckpoint,
  gerarCirculoGeoJson,
} from '../../utils/geometriaRota';
import { Alert } from '../ui/Alert';
import type { ItemSelecionadoMapa } from './CamadasRotaMapa';
import { MapaBase } from './MapaBase';

const CamadasRotaMapaLazy = lazy(() => import('./CamadasRotaMapa'));

export type ExibicaoVisualizadorMapa = 'aberto' | 'expansivel';

export interface VisualizadorRotaMapaProps {
  titulo?: string;
  subtitulo?: string;
  /** Pontos do roteiro em ordem: origem, paradas intermediárias (1..N), destino e retorno opcional. */
  pontos: PontoRotaMapa[];
  /** Geometria e distância já salvas (nunca dispara nova consulta OSRM). */
  rotaPlanejada?: RotaPlanejadaMapa | null;
  /** Camadas opcionais de histórico GPS pós-viagem. */
  historico?: HistoricoGeograficoMapa | null;
  /** Odômetro real informado na viagem (exibido de forma estritamente informativa, sem alerta por divergência). */
  odometro?: OdometroRotaMapa | null;
  /** `aberto` para detalhes; `expansivel` para modais/formulários e cards mobile. */
  exibicaoMapa?: ExibicaoVisualizadorMapa;
  alturaMapa?: string;
  mensagemFallback?: string;
  className?: string;
}

const ROTULO_METODO: Record<MetodoDistanciaRota, string> = {
  OSRM: 'OSRM',
  HAVERSINE_APROXIMADO: 'Haversine aproximado',
  INDISPONIVEL: 'Indisponível',
};

const CORES_PADRAO = {
  planejada: '#1554b8',
  aproximada: '#475569',
  observada: '#15803d',
  estimada: '#b45309',
};

const CORES_DALTONISMO = {
  planejada: '#1d4ed8',
  aproximada: '#475569',
  observada: '#0284c7',
  estimada: '#c2410c',
};

const CORES_TRITANOPIA = {
  planejada: '#7e22ce',
  aproximada: '#475569',
  observada: '#0f766e',
  estimada: '#dc2626',
};

function obterCoresPorPaletaAtiva() {
  if (typeof document === 'undefined') return CORES_PADRAO;
  const paleta = document.documentElement.getAttribute('data-paleta');
  if (paleta === 'protanopia' || paleta === 'deuteranopia') {
    return CORES_DALTONISMO;
  }
  if (paleta === 'tritanopia') {
    return CORES_TRITANOPIA;
  }
  return CORES_PADRAO;
}

function siglaPontoLista(ponto: PontoRotaMapa, indiceParada: number): string {
  if (ponto.tipo === 'ORIGEM') return 'O';
  if (ponto.tipo === 'DESTINO') return 'D';
  if (ponto.tipo === 'RETORNO') return 'R';
  return String(ponto.ordem ?? indiceParada);
}

function classeBadgePonto(tipo: PontoRotaMapa['tipo']): string {
  if (tipo === 'ORIGEM') return 'bg-navy-900 text-white';
  if (tipo === 'DESTINO' || tipo === 'RETORNO') return 'bg-primary text-white';
  return 'bg-primary/90 text-white';
}

export function VisualizadorRotaMapa({
  titulo = 'Visualização da rota',
  subtitulo,
  pontos,
  rotaPlanejada = null,
  historico = null,
  odometro = null,
  exibicaoMapa = 'aberto',
  alturaMapa = '290px',
  mensagemFallback = 'O mapa interativo não pôde ser carregado neste dispositivo. Todos os pontos, horários e distâncias permanecem disponíveis no resumo abaixo.',
  className,
}: VisualizadorRotaMapaProps) {
  const [expandido, setExpandido] = useState(exibicaoMapa === 'aberto');
  const [conteudoMontado, setConteudoMontado] = useState(exibicaoMapa === 'aberto');
  const [animacaoAberta, setAnimacaoAberta] = useState(exibicaoMapa === 'aberto');
  const [cores, setCores] = useState(obterCoresPorPaletaAtiva);
  const [selecionado, setSelecionado] = useState<ItemSelecionadoMapa | null>(null);
  const [focoManual, setFocoManual] = useState<CoordenadaMapa | null>(null);
  const timerFechamentoRef = useRef<number | undefined>(undefined);
  const rafAberturaRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const aberto = exibicaoMapa === 'aberto';
    setExpandido(aberto);
    setConteudoMontado(aberto);
    setAnimacaoAberta(aberto);
  }, [exibicaoMapa]);

  useEffect(() => {
    return () => {
      window.clearTimeout(timerFechamentoRef.current);
      if (rafAberturaRef.current !== undefined) {
        window.cancelAnimationFrame(rafAberturaRef.current);
      }
    };
  }, []);

  const alternarExpansao = (abrir: boolean) => {
    window.clearTimeout(timerFechamentoRef.current);
    if (rafAberturaRef.current !== undefined) {
      window.cancelAnimationFrame(rafAberturaRef.current);
      rafAberturaRef.current = undefined;
    }

    const movimentoReduzido =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setExpandido(abrir);
    if (abrir) {
      setConteudoMontado(true);
      if (movimentoReduzido) {
        setAnimacaoAberta(true);
      } else {
        setAnimacaoAberta(false);
        rafAberturaRef.current = window.requestAnimationFrame(() => {
          rafAberturaRef.current = undefined;
          setAnimacaoAberta(true);
        });
      }
    } else {
      setAnimacaoAberta(false);
      if (movimentoReduzido) {
        setConteudoMontado(false);
      } else {
        timerFechamentoRef.current = window.setTimeout(() => {
          setConteudoMontado(false);
        }, 280);
      }
    }
  };

  // Acompanha trocas dinâmicas de paleta de daltonismo (SCRUM-307)
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const atualizar = () => setCores(obterCoresPorPaletaAtiva());
    const observer = new MutationObserver(atualizar);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-paleta'],
    });
    return () => observer.disconnect();
  }, []);

  // Limpa seleção/foco manual ao trocar de viagem/registro reutilizando o mesmo componente
  const assinaturaPontos = useMemo(
    () =>
      pontos
        .map(
          (p) =>
            `${p.id ?? ''}:${p.tipo}:${p.coordenadas?.latitude ?? ''},${p.coordenadas?.longitude ?? ''}`,
        )
        .join('|'),
    [pontos],
  );

  useEffect(() => {
    setSelecionado(null);
    setFocoManual(null);
  }, [assinaturaPontos]);

  // Permite fechar o card flutuante de pin/checkpoint pela tecla Escape
  useEffect(() => {
    if (!selecionado) return;
    const aoPressionarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        setSelecionado(null);
        setFocoManual(null);
      }
    };
    window.addEventListener('keydown', aoPressionarTecla);
    return () => window.removeEventListener('keydown', aoPressionarTecla);
  }, [selecionado]);

  const pontosComCoordenadas = useMemo(
    () => pontos.filter((ponto) => coordenadaMapaValida(ponto.coordenadas)),
    [pontos],
  );

  const decode = useMemo(() => {
    if (!rotaPlanejada?.geometria) return { pontos: [] as CoordenadaMapa[], invalida: false };
    if (rotaPlanejada.formatoGeometria && rotaPlanejada.formatoGeometria !== 'polyline5') {
      return { pontos: [] as CoordenadaMapa[], invalida: true };
    }
    return decodificarPolyline5(rotaPlanejada.geometria);
  }, [rotaPlanejada?.geometria, rotaPlanejada?.formatoGeometria]);

  const temPolylineValida = decode.pontos.length >= 2;
  const usarLigacaoAproximada = !temPolylineValida && pontosComCoordenadas.length >= 2;

  const rotaPlanejadaGeoJson = useMemo(
    () => (temPolylineValida ? criarFeatureCollectionLinhas([decode.pontos]) : null),
    [temPolylineValida, decode.pontos],
  );

  const ligacaoAproximadaGeoJson = useMemo(() => {
    if (!usarLigacaoAproximada) return null;
    const coords = pontosComCoordenadas
      .map((p) => p.coordenadas)
      .filter((c): c is CoordenadaMapa => coordenadaMapaValida(c));
    return criarFeatureCollectionLinhas([coords]);
  }, [usarLigacaoAproximada, pontosComCoordenadas]);

  const checkpointsValidos = useMemo(
    () => (historico?.checkpoints ?? []).filter((cp) => coordenadaMapaValida(cp.coordenadas)),
    [historico?.checkpoints],
  );

  const trechosObservados = useMemo(
    () =>
      (historico?.trechos ?? [])
        .filter((t) => t.tipo === 'OBSERVADO')
        .map((t) => t.pontos.filter(coordenadaMapaValida))
        .filter((pts) => pts.length >= 2),
    [historico?.trechos],
  );

  const trechosEstimados = useMemo(
    () =>
      (historico?.trechos ?? [])
        .filter((t) => t.tipo === 'ESTIMADO')
        .map((t) => t.pontos.filter(coordenadaMapaValida))
        .filter((pts) => pts.length >= 2),
    [historico?.trechos],
  );

  const observadoGeoJson = useMemo(
    () => (trechosObservados.length > 0 ? criarFeatureCollectionLinhas(trechosObservados) : null),
    [trechosObservados],
  );

  const estimadoGeoJson = useMemo(
    () => (trechosEstimados.length > 0 ? criarFeatureCollectionLinhas(trechosEstimados) : null),
    [trechosEstimados],
  );

  const circulosIncertezaGeoJson = useMemo(() => {
    const features = checkpointsValidos
      .filter(
        (cp) =>
          typeof cp.precisaoMetros === 'number' &&
          Number.isFinite(cp.precisaoMetros) &&
          cp.precisaoMetros > LIMITE_PRECISAO_CIRCULO_METROS,
      )
      .map((cp) => gerarCirculoGeoJson(cp.coordenadas, cp.precisaoMetros!));
    if (features.length === 0) return null;
    return { type: 'FeatureCollection' as const, features };
  }, [checkpointsValidos]);

  const lacunas = historico?.lacunas ?? [];

  const enquadramento = useMemo(() => {
    const todasCoords: CoordenadaMapa[] = [
      ...pontosComCoordenadas
        .map((p) => p.coordenadas)
        .filter((c): c is CoordenadaMapa => coordenadaMapaValida(c)),
      ...decode.pontos,
      ...trechosObservados.flat(),
      ...trechosEstimados.flat(),
      ...checkpointsValidos.map((cp) => cp.coordenadas),
    ];
    return calcularLimitesCoordenadas(todasCoords);
  }, [
    pontosComCoordenadas,
    decode.pontos,
    trechosObservados,
    trechosEstimados,
    checkpointsValidos,
  ]);

  const temCoordenadasParaMapa = Boolean(enquadramento.centroUnico || enquadramento.limites);
  const distanciaOdometroKm = calcularDistanciaOdometroKm(odometro);
  const metodoPlanejado: MetodoDistanciaRota =
    rotaPlanejada?.metodo ??
    (temPolylineValida
      ? 'OSRM'
      : rotaPlanejada?.aproximada
        ? 'HAVERSINE_APROXIMADO'
        : 'INDISPONIVEL');
  const exibirComparativoDistancia =
    (typeof rotaPlanejada?.distanciaMetros === 'number' &&
      Number.isFinite(rotaPlanejada.distanciaMetros)) ||
    distanciaOdometroKm !== null;

  const resumoCompacto = useMemo(() => {
    const nomes = pontos.map((p) => p.rotulo).filter(Boolean);
    const trajeto = nomes.length > 0 ? nomes.join(' → ') : 'Roteiro sem pontos informados';
    const dist =
      typeof rotaPlanejada?.distanciaMetros === 'number'
        ? ` · ${formatarDistanciaKm(rotaPlanejada.distanciaMetros)} (${ROTULO_METODO[metodoPlanejado]})`
        : '';
    return `${trajeto}${dist}`;
  }, [pontos, rotaPlanejada?.distanciaMetros, metodoPlanejado]);

  let contadorParadaLista = 0;

  return (
    <section
      aria-label={titulo}
      className={cn(
        'flex flex-col rounded-xl border border-border transition-colors duration-200',
        expandido ? 'bg-surface p-4' : 'bg-surface-alt px-3.5 py-3',
        className,
      )}
    >
      {/* Cabeçalho persistente */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm font-bold text-text">{titulo}</h3>
          {expandido ? (
            subtitulo && <p className="mt-0.5 text-xs text-text-muted">{subtitulo}</p>
          ) : (
            <p className="truncate text-xs text-text-muted">{resumoCompacto}</p>
          )}
        </div>

        {exibicaoMapa === 'expansivel' && (
          <button
            type="button"
            onClick={() => alternarExpansao(!expandido)}
            aria-expanded={expandido}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-text-strong transition-colors hover:border-primary/50 hover:bg-primary-soft/60 hover:text-primary"
          >
            {!expandido && <MapIcon size={14} aria-hidden="true" />}
            <span>{expandido ? 'Ocultar mapa' : 'Ver mapa da rota'}</span>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={cn(
                'transition-transform duration-300 ease-out motion-reduce:transition-none',
                expandido && 'rotate-180',
              )}
            />
          </button>
        )}
      </div>

      {/* Área expansível com transição suave de subir e descer */}
      <div
        aria-hidden={!expandido}
        inert={!expandido ? true : undefined}
        className={cn(
          'grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none',
          animacaoAberta ? 'mt-3 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          {conteudoMontado && (
            <div className="flex flex-col gap-3">
              {/* Comparativo informativo de distância planejada vs. odômetro (sem alerta por divergência) */}
              {exibirComparativoDistancia && (
                <div
                  className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
                  aria-label="Comparativo informativo de distância"
                >
                  {typeof rotaPlanejada?.distanciaMetros === 'number' && (
                    <div className="rounded-lg border border-border bg-surface-alt px-3 py-2.5">
                      <p className="text-[11px] font-semibold tracking-wide text-text-muted uppercase">
                        {rotaPlanejada.aproximada || metodoPlanejado === 'HAVERSINE_APROXIMADO'
                          ? 'Distância estimada'
                          : 'Distância planejada'}
                      </p>
                      <p className="mt-0.5 font-display text-base font-bold text-text">
                        {formatarDistanciaKm(rotaPlanejada.distanciaMetros)}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        Método: {ROTULO_METODO[metodoPlanejado]}
                      </p>
                    </div>
                  )}

                  {distanciaOdometroKm !== null && odometro && (
                    <div className="rounded-lg border border-border bg-surface-alt px-3 py-2.5">
                      <p className="text-[11px] font-semibold tracking-wide text-text-muted uppercase">
                        Distância por odômetro
                      </p>
                      <p className="mt-0.5 font-display text-base font-bold text-text">
                        {distanciaOdometroKm.toLocaleString('pt-BR', {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}{' '}
                        km
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {odometro.kmInicial?.toLocaleString('pt-BR')} km →{' '}
                        {odometro.kmFinal?.toLocaleString('pt-BR')} km · informativo
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Avisos de lacuna GPS, geometria inválida, ligação aproximada ou ausência de coordenadas */}
              {lacunas.length > 0 && (
                <Alert tone="warning" title="Interrupção de sinal GPS registrada">
                  {lacunas.length === 1
                    ? `Houve 1 período sem captura de localização durante o percurso (${formatarHorarioCheckpoint(lacunas[0]!.inicioEm)}–${formatarHorarioCheckpoint(lacunas[0]!.fimEm)}). Esse intervalo não foi ligado no mapa para evitar indicar um trajeto não confirmado.`
                    : `Houve ${lacunas.length} períodos sem captura de localização durante o percurso. Esses intervalos não foram ligados no mapa para evitar indicar trajetos não confirmados.`}
                </Alert>
              )}

              {decode.invalida && (
                <Alert tone="info">
                  A geometria salva da rota está inválida e foi ignorada.{' '}
                  {usarLigacaoAproximada
                    ? 'Exibindo apenas ligação aproximada entre os pontos com coordenadas.'
                    : 'Os pontos do roteiro seguem disponíveis em texto abaixo.'}
                </Alert>
              )}

              {!decode.invalida && usarLigacaoAproximada && (
                <Alert tone="info">
                  Traçado rodoviário indisponível. A linha tracejada indica apenas uma{' '}
                  <strong>ligação aproximada</strong> entre os pontos com coordenadas.
                </Alert>
              )}

              {!temCoordenadasParaMapa && (
                <Alert tone="info">
                  Nenhum ponto possui coordenadas cadastradas. O mapa foi ocultado e o roteiro segue
                  disponível em texto abaixo.
                </Alert>
              )}

              {/* Mapa interativo (oculto quando há 0 coordenadas válidas) */}
              {temCoordenadasParaMapa && (
                <MapaBase
                  altura={alturaMapa}
                  centroInicial={
                    enquadramento.centroUnico
                      ? {
                          latitude: enquadramento.centroUnico.latitude,
                          longitude: enquadramento.centroUnico.longitude,
                          zoom: 15,
                        }
                      : undefined
                  }
                  centroControlado={
                    focoManual
                      ? {
                          latitude: focoManual.latitude,
                          longitude: focoManual.longitude,
                          zoom: 15,
                        }
                      : enquadramento.centroUnico
                        ? {
                            latitude: enquadramento.centroUnico.latitude,
                            longitude: enquadramento.centroUnico.longitude,
                            zoom: 15,
                          }
                        : null
                  }
                  limitesControlados={focoManual ? null : enquadramento.limites}
                  onClickMapa={() => {
                    setSelecionado(null);
                  }}
                  mensagemFallback={mensagemFallback}
                  tituloAcessivel={`Mapa: ${titulo}`}
                >
                  <Suspense fallback={null}>
                    <CamadasRotaMapaLazy
                      pontosComCoordenadas={pontosComCoordenadas}
                      rotaPlanejadaGeoJson={rotaPlanejadaGeoJson}
                      ligacaoAproximadaGeoJson={ligacaoAproximadaGeoJson}
                      observadoGeoJson={observadoGeoJson}
                      estimadoGeoJson={estimadoGeoJson}
                      circulosIncertezaGeoJson={circulosIncertezaGeoJson}
                      checkpoints={checkpointsValidos}
                      selecionado={selecionado}
                      onSelecionar={(item) => {
                        setSelecionado(item);
                        if (!item) setFocoManual(null);
                      }}
                      cores={cores}
                    />
                  </Suspense>
                </MapaBase>
              )}

              {/* Legenda semântica (padrões visuais + texto, independente apenas de cor) */}
              {temCoordenadasParaMapa && (
                <div
                  aria-label="Legenda do mapa"
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs text-text-secondary"
                >
                  {pontosComCoordenadas.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <img
                        src={PIN_FSPH_URL}
                        alt=""
                        aria-hidden="true"
                        className="h-4 w-4 object-contain"
                      />
                      Pontos do roteiro (FSPH)
                    </span>
                  )}

                  {temPolylineValida && (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span
                        aria-hidden="true"
                        className="inline-block w-5 border-t-[3px] border-solid"
                        style={{ borderTopColor: cores.planejada }}
                      />
                      Rota planejada (OSRM)
                    </span>
                  )}

                  {usarLigacaoAproximada && (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span
                        aria-hidden="true"
                        className="inline-block w-5 border-t-[3px] border-dashed"
                        style={{ borderTopColor: cores.aproximada }}
                      />
                      Ligação aproximada
                    </span>
                  )}

                  {trechosObservados.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span
                        aria-hidden="true"
                        className="inline-block w-5 border-t-[4px] border-solid"
                        style={{ borderTopColor: cores.observada }}
                      />
                      Trecho observado (GPS real)
                    </span>
                  )}

                  {trechosEstimados.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span
                        aria-hidden="true"
                        className="inline-block w-5 border-t-[3px] border-dotted"
                        style={{ borderTopColor: cores.estimada }}
                      />
                      Trecho estimado
                    </span>
                  )}

                  {circulosIncertezaGeoJson && (
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span
                        aria-hidden="true"
                        className="inline-block h-3.5 w-3.5 rounded-full border-[1.5px] border-dashed"
                        style={{
                          borderColor: cores.estimada,
                          backgroundColor: `${cores.estimada}26`,
                        }}
                      />
                      Incerteza &gt; {LIMITE_PRECISAO_CIRCULO_METROS}m
                    </span>
                  )}
                </div>
              )}

              {/* Resumo textual acessível (pontos do roteiro + linha do tempo de checkpoints/lacunas) */}
              <div className="flex flex-col gap-3">
                {pontos.length > 0 && (
                  <div className="rounded-lg border border-border bg-surface px-3.5 py-3">
                    <h4 className="mb-2 font-display text-xs font-bold text-text">
                      Pontos do roteiro
                    </h4>
                    <ol className="flex flex-col gap-2">
                      {pontos.map((ponto, indice) => {
                        if (ponto.tipo === 'PARADA') contadorParadaLista += 1;
                        const sigla = siglaPontoLista(ponto, contadorParadaLista);
                        const temCoord = coordenadaMapaValida(ponto.coordenadas);
                        const chave = ponto.id ?? `ponto-${ponto.tipo}-${indice}`;
                        const ativo = selecionado?.tipo === 'ponto' && selecionado.chave === chave;

                        return (
                          <li key={`lista-${chave}`}>
                            {temCoord && temCoordenadasParaMapa ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (ativo) {
                                    setSelecionado(null);
                                    setFocoManual(null);
                                  } else {
                                    setSelecionado({ tipo: 'ponto', chave });
                                    setFocoManual(ponto.coordenadas);
                                  }
                                }}
                                className={cn(
                                  'flex w-full cursor-pointer items-start gap-2.5 rounded-lg p-1.5 text-left text-xs text-text-secondary transition-colors hover:bg-primary-soft/60',
                                  ativo && 'bg-primary-soft ring-1 ring-primary/30',
                                )}
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    'mt-0.5 inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-bold',
                                    classeBadgePonto(ponto.tipo),
                                  )}
                                >
                                  {sigla}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-text">{ponto.rotulo}</p>
                                  <p className="text-[11.5px] text-text-muted">
                                    {ponto.endereco ??
                                      `${ponto.coordenadas!.latitude.toFixed(6)}, ${ponto.coordenadas!.longitude.toFixed(6)}`}
                                  </p>
                                </div>
                              </button>
                            ) : (
                              <div className="flex items-start gap-2.5 p-1.5 text-xs text-text-secondary">
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    'mt-0.5 inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-bold',
                                    classeBadgePonto(ponto.tipo),
                                  )}
                                >
                                  {sigla}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-text">{ponto.rotulo}</p>
                                  <p className="text-[11.5px] text-text-muted">
                                    {ponto.endereco ?? 'Sem coordenadas cadastradas'}
                                  </p>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}

                {(checkpointsValidos.length > 0 || lacunas.length > 0) && (
                  <div className="rounded-lg border border-border bg-surface px-3.5 py-3">
                    <h4 className="mb-2 font-display text-xs font-bold text-text">
                      Linha do tempo GPS (checkpoints)
                    </h4>
                    <ol className="flex flex-col gap-2">
                      {checkpointsValidos.map((cp) => {
                        const baixaPrecisao =
                          typeof cp.precisaoMetros === 'number' &&
                          cp.precisaoMetros > LIMITE_PRECISAO_CIRCULO_METROS;
                        return (
                          <li
                            key={`lista-cp-${cp.id}`}
                            className="flex items-start gap-2.5 text-xs text-text-secondary"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full border-2 border-white shadow-xs"
                              style={{
                                backgroundColor: baixaPrecisao ? cores.estimada : cores.observada,
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-text">
                                {cp.rotulo} — {formatarHorarioCheckpoint(cp.horario)}
                              </p>
                              <p className="text-[11.5px] text-text-muted">
                                {typeof cp.precisaoMetros === 'number'
                                  ? `Precisão: ±${Math.round(cp.precisaoMetros)}m${
                                      baixaPrecisao
                                        ? ` · Círculo de incerteza exibido (> ${LIMITE_PRECISAO_CIRCULO_METROS}m)`
                                        : ' · Ponto real confirmado'
                                    }`
                                  : 'Precisão não informada'}
                              </p>
                            </div>
                          </li>
                        );
                      })}

                      {lacunas.map((lacuna) => (
                        <li
                          key={`lista-lacuna-${lacuna.id}`}
                          className="flex items-start gap-2 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-2.5 py-2 text-xs text-amber-900"
                        >
                          <WifiOff size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                          <span>
                            <strong>
                              Sinal GPS interrompido ({formatarHorarioCheckpoint(lacuna.inicioEm)}–
                              {formatarHorarioCheckpoint(lacuna.fimEm)})
                            </strong>
                            {' · '}
                            {lacuna.motivo ??
                              'Sem registro de localização neste intervalo (não ligado no mapa)'}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
