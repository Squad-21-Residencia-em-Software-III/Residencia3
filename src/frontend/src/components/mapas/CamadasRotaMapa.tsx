import { Layer, Marker, Source } from 'react-map-gl/maplibre';
import { X } from 'lucide-react';
import { PIN_FSPH_URL } from '../../config/mapas';
import type { CheckpointGpsMapa, PontoRotaMapa } from '../../types/mapa';
import {
  LIMITE_PRECISAO_CIRCULO_METROS,
  formatarHorarioCheckpoint,
  type GeoJsonFeatureCollectionLinhas,
  type GeoJsonFeatureCollectionPoligonos,
} from '../../utils/geometriaRota';

export interface ItemSelecionadoMapa {
  tipo: 'ponto' | 'checkpoint';
  chave: string;
}

export interface CamadasRotaMapaProps {
  pontosComCoordenadas: PontoRotaMapa[];
  rotaPlanejadaGeoJson: GeoJsonFeatureCollectionLinhas | null;
  ligacaoAproximadaGeoJson: GeoJsonFeatureCollectionLinhas | null;
  observadoGeoJson: GeoJsonFeatureCollectionLinhas | null;
  estimadoGeoJson: GeoJsonFeatureCollectionLinhas | null;
  circulosIncertezaGeoJson: GeoJsonFeatureCollectionPoligonos | null;
  checkpoints: CheckpointGpsMapa[];
  selecionado: ItemSelecionadoMapa | null;
  onSelecionar: (item: ItemSelecionadoMapa | null) => void;
  cores: {
    planejada: string;
    aproximada: string;
    observada: string;
    estimada: string;
  };
}

function siglaPonto(ponto: PontoRotaMapa, indiceParada: number): string {
  if (ponto.tipo === 'ORIGEM') return 'O';
  if (ponto.tipo === 'DESTINO') return 'D';
  if (ponto.tipo === 'RETORNO') return 'R';
  return String(ponto.ordem ?? indiceParada);
}

function corBadgePonto(ponto: PontoRotaMapa, corPlanejada: string): string {
  if (ponto.tipo === 'ORIGEM') return '#0e172e';
  if (ponto.tipo === 'DESTINO' || ponto.tipo === 'RETORNO') return '#1554b8';
  return corPlanejada;
}

function pontosCoincidentes(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): boolean {
  // ~25 metros: unifica checkpoint GPS no mesmo local do pin FSPH para evitar 2 marcadores empilhados
  return (
    Math.abs(a.latitude - b.latitude) < 0.00025 && Math.abs(a.longitude - b.longitude) < 0.00025
  );
}

export default function CamadasRotaMapa({
  pontosComCoordenadas,
  rotaPlanejadaGeoJson,
  ligacaoAproximadaGeoJson,
  observadoGeoJson,
  estimadoGeoJson,
  circulosIncertezaGeoJson,
  checkpoints,
  selecionado,
  onSelecionar,
  cores,
}: CamadasRotaMapaProps) {
  const temHistorico = Boolean(
    (observadoGeoJson && observadoGeoJson.features.length > 0) ||
    (estimadoGeoJson && estimadoGeoJson.features.length > 0) ||
    checkpoints.length > 0,
  );

  // Associa checkpoints coincidentes ao respectivo pin FSPH e mantém os demais como marcadores próprios
  const checkpointsPorPonto = new Map<string, CheckpointGpsMapa[]>();
  const checkpointsIndependentes: CheckpointGpsMapa[] = [];

  for (const cp of checkpoints) {
    const pontoAssociado = pontosComCoordenadas.find(
      (ponto) => ponto.coordenadas && pontosCoincidentes(ponto.coordenadas, cp.coordenadas),
    );
    if (pontoAssociado) {
      const indice = pontosComCoordenadas.indexOf(pontoAssociado);
      const chave = pontoAssociado.id ?? `ponto-${pontoAssociado.tipo}-${indice}`;
      const lista = checkpointsPorPonto.get(chave) ?? [];
      lista.push(cp);
      checkpointsPorPonto.set(chave, lista);
    } else {
      checkpointsIndependentes.push(cp);
    }
  }

  let contadorParada = 0;

  return (
    <>
      {/* Círculos de incerteza (> 150m) abaixo das linhas */}
      {circulosIncertezaGeoJson && circulosIncertezaGeoJson.features.length > 0 && (
        <Source id="rota-incerteza" type="geojson" data={circulosIncertezaGeoJson}>
          <Layer
            id="rota-incerteza-fill"
            type="fill"
            paint={{
              'fill-color': cores.estimada,
              'fill-opacity': 0.16,
            }}
          />
          <Layer
            id="rota-incerteza-borda"
            type="line"
            paint={{
              'line-color': cores.estimada,
              'line-width': 1.5,
              'line-dasharray': [4, 3],
            }}
          />
        </Source>
      )}

      {/* Rota planejada OSRM (linha sólida com halo de contraste) */}
      {rotaPlanejadaGeoJson && rotaPlanejadaGeoJson.features.length > 0 && (
        <Source id="rota-planejada" type="geojson" data={rotaPlanejadaGeoJson}>
          <Layer
            id="rota-planejada-halo"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#ffffff',
              'line-width': 7.5,
              'line-opacity': temHistorico ? 0.55 : 0.9,
            }}
          />
          <Layer
            id="rota-planejada-linha"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': cores.planejada,
              'line-width': 4.5,
              'line-opacity': temHistorico ? 0.45 : 1,
            }}
          />
        </Source>
      )}

      {/* Ligação aproximada (sem polyline5 — linha tracejada longa) */}
      {ligacaoAproximadaGeoJson && ligacaoAproximadaGeoJson.features.length > 0 && (
        <Source id="rota-aproximada" type="geojson" data={ligacaoAproximadaGeoJson}>
          <Layer
            id="rota-aproximada-halo"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#ffffff',
              'line-width': 6,
              'line-opacity': 0.75,
            }}
          />
          <Layer
            id="rota-aproximada-linha"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': cores.aproximada,
              'line-width': 3.5,
              'line-dasharray': [4, 3],
            }}
          />
        </Source>
      )}

      {/* Trechos estimados do histórico (linha pontilhada) */}
      {estimadoGeoJson && estimadoGeoJson.features.length > 0 && (
        <Source id="rota-estimada" type="geojson" data={estimadoGeoJson}>
          <Layer
            id="rota-estimada-linha"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': cores.estimada,
              'line-width': 3.5,
              'line-dasharray': [1, 2.5],
            }}
          />
        </Source>
      )}

      {/* Trechos observados (GPS real — linha sólida de destaque; lacunas não são ligadas) */}
      {observadoGeoJson && observadoGeoJson.features.length > 0 && (
        <Source id="rota-observada" type="geojson" data={observadoGeoJson}>
          <Layer
            id="rota-observada-halo"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#ffffff',
              'line-width': 7.5,
              'line-opacity': 0.88,
            }}
          />
          <Layer
            id="rota-observada-linha"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': cores.observada,
              'line-width': 4.5,
            }}
          />
        </Source>
      )}

      {/* Checkpoints GPS independentes (os coincidentes com pins FSPH são unificados no card do pin) */}
      {checkpointsIndependentes.map((cp) => {
        const baixaPrecisao =
          typeof cp.precisaoMetros === 'number' &&
          cp.precisaoMetros > LIMITE_PRECISAO_CIRCULO_METROS;
        const horario = formatarHorarioCheckpoint(cp.horario);
        const precisaoTexto =
          typeof cp.precisaoMetros === 'number' ? `±${Math.round(cp.precisaoMetros)}m` : null;
        const chave = `cp-${cp.id}`;
        const ativo = selecionado?.tipo === 'checkpoint' && selecionado.chave === chave;

        return (
          <Marker
            key={`checkpoint-${cp.id}`}
            latitude={cp.coordenadas.latitude}
            longitude={cp.coordenadas.longitude}
            anchor="center"
            style={{ zIndex: ativo ? 30 : 10 }}
          >
            <div className="relative flex items-center justify-center">
              {ativo && (
                <div
                  role="dialog"
                  aria-label={`Detalhes do checkpoint ${cp.rotulo}`}
                  className="absolute bottom-full left-1/2 z-40 mb-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-surface p-2.5 text-left text-xs text-text shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display leading-snug font-bold text-text">{cp.rotulo}</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelecionar(null);
                      }}
                      aria-label="Fechar detalhes do checkpoint"
                      className="rounded p-0.5 text-text-muted hover:bg-surface-alt hover:text-text"
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-text-secondary">
                    Horário: <strong>{horario}</strong>
                    {precisaoTexto ? ` · Precisão: ${precisaoTexto}` : ''}
                  </p>
                  {baixaPrecisao && (
                    <p className="mt-0.5 text-[11px] font-medium text-amber-800">
                      Círculo de incerteza exibido (&gt; {LIMITE_PRECISAO_CIRCULO_METROS}m)
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelecionar(ativo ? null : { tipo: 'checkpoint', chave });
                }}
                title={`${cp.rotulo} (${horario}${precisaoTexto ? `, ${precisaoTexto}` : ''})`}
                aria-label={`Checkpoint ${cp.rotulo}, ${horario}${precisaoTexto ? `, precisão ${precisaoTexto}` : ''}`}
                aria-expanded={ativo}
                className={`h-4 w-4 cursor-pointer rounded-full border-2 border-white shadow-sm transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:outline-none ${ativo ? 'scale-125 ring-2 ring-primary' : ''}`}
                style={{
                  backgroundColor: baixaPrecisao ? cores.estimada : cores.observada,
                }}
              />
            </div>
          </Marker>
        );
      })}

      {/* Pins FSPH oficiais (Origem, Paradas numeradas 1..N, Destino/Retorno) */}
      {pontosComCoordenadas.map((ponto, indice) => {
        if (!ponto.coordenadas) return null;
        if (ponto.tipo === 'PARADA') contadorParada += 1;
        const sigla = siglaPonto(ponto, contadorParada);
        const corBadge = corBadgePonto(ponto, cores.planejada);
        const chave = ponto.id ?? `ponto-${ponto.tipo}-${indice}`;
        const ativo = selecionado?.tipo === 'ponto' && selecionado.chave === chave;
        const checkpointsAssociados = checkpointsPorPonto.get(chave) ?? [];

        return (
          <Marker
            key={chave}
            latitude={ponto.coordenadas.latitude}
            longitude={ponto.coordenadas.longitude}
            anchor="bottom"
            style={{ zIndex: ativo ? 35 : 20 }}
          >
            <div className="relative inline-flex items-end select-none">
              {ativo && (
                <div
                  role="dialog"
                  aria-label={`Detalhes do ponto ${ponto.rotulo}`}
                  className="absolute bottom-full left-1/2 z-40 mb-2 w-64 -translate-x-1/2 rounded-lg border border-border bg-surface p-2.5 text-left text-xs text-text shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display leading-snug font-bold text-text">{ponto.rotulo}</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelecionar(null);
                      }}
                      aria-label="Fechar detalhes do ponto"
                      className="rounded p-0.5 text-text-muted hover:bg-surface-alt hover:text-text"
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </div>
                  {ponto.endereco && (
                    <p className="mt-1 text-[11px] leading-snug text-text-secondary">
                      {ponto.endereco}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-[10.5px] text-text-muted">
                    {ponto.coordenadas.latitude.toFixed(5)},{' '}
                    {ponto.coordenadas.longitude.toFixed(5)}
                  </p>

                  {checkpointsAssociados.length > 0 && (
                    <div className="mt-2 border-t border-border pt-2">
                      {checkpointsAssociados.map((cp) => {
                        const horario = formatarHorarioCheckpoint(cp.horario);
                        const precisaoTexto =
                          typeof cp.precisaoMetros === 'number'
                            ? ` · ±${Math.round(cp.precisaoMetros)}m`
                            : '';
                        const baixaPrecisao =
                          typeof cp.precisaoMetros === 'number' &&
                          cp.precisaoMetros > LIMITE_PRECISAO_CIRCULO_METROS;
                        return (
                          <div key={`unificado-${cp.id}`} className="mt-1 first:mt-0">
                            <p className="text-[11px] font-semibold text-text">
                              GPS: {cp.rotulo} ({horario}
                              {precisaoTexto})
                            </p>
                            {baixaPrecisao && (
                              <p className="text-[10.5px] font-medium text-amber-800">
                                Círculo de incerteza exibido (&gt; {LIMITE_PRECISAO_CIRCULO_METROS}
                                m)
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelecionar(ativo ? null : { tipo: 'ponto', chave });
                }}
                title={`${ponto.rotulo}${ponto.endereco ? ` — ${ponto.endereco}` : ''}`}
                aria-label={`Ver detalhes de ${ponto.rotulo}`}
                aria-expanded={ativo}
                className="group relative inline-flex cursor-pointer items-end rounded-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:outline-none"
              >
                <img
                  src={PIN_FSPH_URL}
                  alt={`${ponto.rotulo}${ponto.endereco ? ` — ${ponto.endereco}` : ''}`}
                  className={`h-9 w-9 drop-shadow-md transition-transform group-hover:scale-110 ${ativo ? 'scale-110' : ''}`}
                  draggable={false}
                />
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -right-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white px-1 text-[10px] font-bold text-white shadow-xs"
                  style={{ backgroundColor: corBadge }}
                >
                  {sigla}
                </span>
              </button>
            </div>
          </Marker>
        );
      })}
    </>
  );
}
