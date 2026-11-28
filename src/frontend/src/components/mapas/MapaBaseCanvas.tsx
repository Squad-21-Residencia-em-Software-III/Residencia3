import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import Map, { Marker, NavigationControl, type MapRef } from 'react-map-gl/maplibre';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  ATRIBUICOES_MAPA,
  CENTRO_PADRAO_SERGIPE,
  PIN_FSPH_URL,
  obterEstiloMapa,
  type CoordenadaMapa,
  type TemaMapa,
  type VisaoInicialMapa,
} from '../../config/mapas';

// O Vite publica o worker e suas dependências junto aos chunks do build.
setWorkerUrl(workerUrl);

export const LIMITE_CARREGAMENTO_MAPA_MS = 12_000;

export interface MarcadorMapaPadrao extends CoordenadaMapa {
  titulo?: string;
}

export interface MapaBaseCanvasProps {
  centroInicial?: Partial<VisaoInicialMapa>;
  /** Quando atualizado, centraliza o mapa suavemente no novo ponto (sem bloquear pan/zoom do usuário). */
  centroControlado?: Partial<VisaoInicialMapa> | null;
  marcadorPadrao?: MarcadorMapaPadrao | null;
  marcadorArrastavel?: boolean;
  onDragEndMarcador?: (coordenada: CoordenadaMapa) => void;
  onClickMapa?: (coordenada: CoordenadaMapa) => void;
  altura?: string;
  tema?: TemaMapa;
  tituloAcessivel?: string;
  onErroCarregamento?: () => void;
  children?: ReactNode;
}

export default function MapaBaseCanvas({
  centroInicial,
  centroControlado,
  marcadorPadrao,
  marcadorArrastavel = false,
  onDragEndMarcador,
  onClickMapa,
  altura = '320px',
  tema = 'claro',
  tituloAcessivel = 'Mapa interativo da frota FSPH',
  onErroCarregamento,
  children,
}: MapaBaseCanvasProps) {
  const latitude =
    centroControlado?.latitude ??
    centroInicial?.latitude ??
    marcadorPadrao?.latitude ??
    CENTRO_PADRAO_SERGIPE.latitude;
  const longitude =
    centroControlado?.longitude ??
    centroInicial?.longitude ??
    marcadorPadrao?.longitude ??
    CENTRO_PADRAO_SERGIPE.longitude;
  const zoom = centroControlado?.zoom ?? centroInicial?.zoom ?? CENTRO_PADRAO_SERGIPE.zoom;
  const estiloMapa = obterEstiloMapa(tema);
  const mapaRef = useRef<MapRef | null>(null);
  const carregamento = useRef({ estiloPronto: false, recebeuTile: false, perdeuContexto: false });
  const prazo = useRef<number | undefined>(undefined);
  const removerListeners = useRef<(() => void) | undefined>(undefined);
  const aoFalhar = useRef(onErroCarregamento);
  const falhaComunicada = useRef(false);

  useEffect(() => {
    aoFalhar.current = onErroCarregamento;
  }, [onErroCarregamento]);

  const cancelarPrazo = useCallback(() => {
    window.clearTimeout(prazo.current);
    prazo.current = undefined;
  }, []);
  const reportarFalha = useCallback(() => {
    if (falhaComunicada.current) return;
    falhaComunicada.current = true;
    cancelarPrazo();
    aoFalhar.current?.();
  }, [cancelarPrazo]);
  const aguardar = useCallback(
    (mapaRecuperado: () => boolean) => {
      if (prazo.current !== undefined) return;
      prazo.current = window.setTimeout(() => {
        prazo.current = undefined;
        if (!mapaRecuperado()) reportarFalha();
      }, LIMITE_CARREGAMENTO_MAPA_MS);
    },
    [reportarFalha],
  );
  const recuperado = useCallback(() => {
    const { estiloPronto, recebeuTile, perdeuContexto } = carregamento.current;
    return estiloPronto && recebeuTile && !perdeuContexto;
  }, []);
  const liberarPrazoSeRecuperado = useCallback(() => {
    if (recuperado()) cancelarPrazo();
  }, [cancelarPrazo, recuperado]);
  const registrarEstilo = useCallback(() => {
    carregamento.current.estiloPronto = true;
    liberarPrazoSeRecuperado();
  }, [liberarPrazoSeRecuperado]);

  const registrarMapa = useCallback(
    (referencia: MapRef | null) => {
      mapaRef.current = referencia;
      removerListeners.current?.();
      removerListeners.current = undefined;
      if (!referencia) return;
      const mapa = referencia.getMap();

      const perdeuContexto = () => {
        carregamento.current = { estiloPronto: false, recebeuTile: false, perdeuContexto: true };
        cancelarPrazo();
        aguardar(recuperado);
      };
      const restaurouContexto = () => {
        carregamento.current.perdeuContexto = false;
        if (mapa.isStyleLoaded()) registrarEstilo();
        liberarPrazoSeRecuperado();
      };

      mapa.on('style.load', registrarEstilo);
      mapa.on('webglcontextlost', perdeuContexto);
      mapa.on('webglcontextrestored', restaurouContexto);
      removerListeners.current = () => {
        mapa.off('style.load', registrarEstilo);
        mapa.off('webglcontextlost', perdeuContexto);
        mapa.off('webglcontextrestored', restaurouContexto);
      };
    },
    [aguardar, cancelarPrazo, liberarPrazoSeRecuperado, recuperado, registrarEstilo],
  );

  useEffect(() => {
    carregamento.current.estiloPronto = false;
    carregamento.current.recebeuTile = false;
    aguardar(recuperado);
    return cancelarPrazo;
  }, [estiloMapa, aguardar, cancelarPrazo, recuperado]);

  const latControlada = centroControlado?.latitude;
  const lonControlada = centroControlado?.longitude;
  const zoomControlado = centroControlado?.zoom;

  useEffect(() => {
    if (latControlada === undefined || lonControlada === undefined) return;
    const instancia = mapaRef.current;
    if (!instancia) return;
    const movimentoReduzido =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const opcoes = {
      center: [lonControlada, latControlada] as [number, number],
      ...(zoomControlado !== undefined ? { zoom: zoomControlado } : {}),
    };
    if (movimentoReduzido && typeof instancia.jumpTo === 'function') {
      instancia.jumpTo(opcoes);
    } else if (typeof instancia.flyTo === 'function') {
      instancia.flyTo({ ...opcoes, duration: 350 });
    }
  }, [latControlada, lonControlada, zoomControlado]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
      style={{ height: altura }}
      role="region"
      aria-label={tituloAcessivel}
    >
      <Map
        ref={registrarMapa}
        initialViewState={{ latitude, longitude, zoom }}
        mapStyle={estiloMapa}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        onClick={
          onClickMapa
            ? (evento) => {
                onClickMapa({
                  latitude: evento.lngLat.lat,
                  longitude: evento.lngLat.lng,
                });
              }
            : undefined
        }
        onLoad={registrarEstilo}
        onSourceData={(evento) => {
          if (
            evento.tile?.hasData() &&
            (evento.source?.type === 'vector' || evento.source?.type === 'raster')
          ) {
            carregamento.current.recebeuTile = true;
            liberarPrazoSeRecuperado();
          }
        }}
        onError={(evento) => {
          const mapa = evento.target;
          if (!mapa) {
            reportarFalha();
            return;
          }
          // Preserve tiles que ainda renderizam durante falhas de rede ou de recursos.
          if (recuperado()) {
            aguardar(() => !!mapa.isStyleLoaded() && mapa.queryRenderedFeatures().length > 0);
          }
        }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {marcadorPadrao && (
          <Marker
            latitude={marcadorPadrao.latitude}
            longitude={marcadorPadrao.longitude}
            anchor="bottom"
            draggable={marcadorArrastavel}
            onDragEnd={
              onDragEndMarcador
                ? (evento) => {
                    onDragEndMarcador({
                      latitude: evento.lngLat.lat,
                      longitude: evento.lngLat.lng,
                    });
                  }
                : undefined
            }
          >
            <img
              src={PIN_FSPH_URL}
              alt={marcadorPadrao.titulo ?? 'Localização marcada no mapa'}
              className={`h-9 w-9 drop-shadow-md select-none ${marcadorArrastavel ? 'cursor-grab active:cursor-grabbing' : ''}`}
              draggable={false}
            />
          </Marker>
        )}

        {children}
      </Map>

      <div
        className="pointer-events-auto absolute right-2 bottom-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-white/90 px-2 py-1 text-[11px] text-slate-700 shadow-sm backdrop-blur-xs"
        aria-label="Atribuições cartográficas"
      >
        {ATRIBUICOES_MAPA.map((item, indice) => (
          <span key={item.nome} className="inline-flex items-center gap-1">
            {indice > 0 && <span aria-hidden="true">·</span>}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-slate-400 underline-offset-2 hover:text-slate-950"
            >
              {item.nome}
            </a>
          </span>
        ))}
      </div>
    </div>
  );
}
