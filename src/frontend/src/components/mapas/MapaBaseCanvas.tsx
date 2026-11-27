import { useEffect, useRef, type ReactNode } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre';
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
  marcadorPadrao?: MarcadorMapaPadrao | null;
  altura?: string;
  tema?: TemaMapa;
  tituloAcessivel?: string;
  onErroCarregamento?: () => void;
  children?: ReactNode;
}

export default function MapaBaseCanvas({
  centroInicial,
  marcadorPadrao,
  altura = '320px',
  tema = 'claro',
  tituloAcessivel = 'Mapa interativo da frota FSPH',
  onErroCarregamento,
  children,
}: MapaBaseCanvasProps) {
  const latitude = centroInicial?.latitude ?? marcadorPadrao?.latitude ?? CENTRO_PADRAO_SERGIPE.latitude;
  const longitude = centroInicial?.longitude ?? marcadorPadrao?.longitude ?? CENTRO_PADRAO_SERGIPE.longitude;
  const zoom = centroInicial?.zoom ?? CENTRO_PADRAO_SERGIPE.zoom;
  const estiloMapa = obterEstiloMapa(tema);
  const carregamento = useRef({ abriu: false, recebeuTile: false });
  const aoFalhar = useRef(onErroCarregamento);

  useEffect(() => { aoFalhar.current = onErroCarregamento; }, [onErroCarregamento]);
  useEffect(() => {
    const prazo = window.setTimeout(() => {
      const { abriu, recebeuTile } = carregamento.current;
      if (!abriu || !recebeuTile) aoFalhar.current?.();
    }, LIMITE_CARREGAMENTO_MAPA_MS);
    return () => window.clearTimeout(prazo);
  }, []);

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
      style={{ height: altura }}
      role="region"
      aria-label={tituloAcessivel}
    >
      <Map
        initialViewState={{ latitude, longitude, zoom }}
        mapStyle={estiloMapa}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        onLoad={() => { carregamento.current.abriu = true; }}
        onSourceData={(evento) => {
          if (evento.tile && (evento.source?.type === 'vector' || evento.source?.type === 'raster')) {
            carregamento.current.recebeuTile = true;
          }
        }}
        onError={(evento) => {
          // react-map-gl informa target nulo quando a instância não pôde ser criada.
          // Erros com mapa existente podem ser de um único tile. O prazo verifica a renderização inicial.
          if (!evento.target) onErroCarregamento?.();
        }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {marcadorPadrao && (
          <Marker
            latitude={marcadorPadrao.latitude}
            longitude={marcadorPadrao.longitude}
            anchor="bottom"
          >
            <img
              src={PIN_FSPH_URL}
              alt={marcadorPadrao.titulo ?? 'Localização marcada no mapa'}
              className="h-9 w-9 select-none drop-shadow-md"
              draggable={false}
            />
          </Marker>
        )}

        {children}
      </Map>

      <div
        className="pointer-events-auto absolute right-2 bottom-2 z-10 max-w-[calc(100%-1rem)] flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-white/90 px-2 py-1 text-[11px] text-slate-700 shadow-sm backdrop-blur-xs"
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
