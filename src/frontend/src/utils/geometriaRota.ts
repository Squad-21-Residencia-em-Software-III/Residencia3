import type { CoordenadaMapa, OdometroRotaMapa } from '../types/mapa';

export const LIMITE_PRECISAO_CIRCULO_METROS = 150;
const RAIO_TERRA_METROS = 6_371_000;

export type LimitesGeograficos = [[number, number], [number, number]];

export interface ResultadoDecodePolyline {
  pontos: CoordenadaMapa[];
  invalida: boolean;
}

export interface ResultadoEnquadramento {
  centroUnico: CoordenadaMapa | null;
  limites: LimitesGeograficos | null;
}

export function coordenadaMapaValida(ponto: unknown): ponto is CoordenadaMapa {
  if (typeof ponto !== 'object' || ponto === null) return false;
  const candidato = ponto as Partial<CoordenadaMapa>;
  return (
    typeof candidato.latitude === 'number' &&
    typeof candidato.longitude === 'number' &&
    Number.isFinite(candidato.latitude) &&
    Number.isFinite(candidato.longitude) &&
    Math.abs(candidato.latitude) <= 90 &&
    Math.abs(candidato.longitude) <= 180
  );
}

/**
 * Decodifica uma string no formato Google/OSRM polyline5 (precisão 1e5).
 * Trata entradas vazias, caracteres fora da faixa ASCII (63..126), truncamentos e coordenadas inválidas
 * sem lançar exceções.
 */
export function decodificarPolyline5(encoded: string | null | undefined): ResultadoDecodePolyline {
  if (!encoded) return { pontos: [], invalida: false };
  const texto = encoded.trim();
  if (texto.length === 0) return { pontos: [], invalida: false };

  const pontos: CoordenadaMapa[] = [];
  let indice = 0;
  let lat = 0;
  let lon = 0;

  while (indice < texto.length) {
    let resultado = 0;
    let shift = 0;
    let byte = 0;
    let completou = false;

    while (indice < texto.length) {
      const codigo = texto.charCodeAt(indice++);
      if (codigo < 63 || codigo > 126) {
        return { pontos: [], invalida: true };
      }
      byte = codigo - 63;
      resultado |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) {
        completou = true;
        break;
      }
      if (shift > 35) return { pontos: [], invalida: true };
    }
    if (!completou) return { pontos: [], invalida: true };
    const deltaLat = resultado & 1 ? ~(resultado >> 1) : resultado >> 1;
    lat += deltaLat;

    resultado = 0;
    shift = 0;
    completou = false;
    while (indice < texto.length) {
      const codigo = texto.charCodeAt(indice++);
      if (codigo < 63 || codigo > 126) {
        return { pontos: [], invalida: true };
      }
      byte = codigo - 63;
      resultado |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) {
        completou = true;
        break;
      }
      if (shift > 35) return { pontos: [], invalida: true };
    }
    if (!completou) return { pontos: [], invalida: true };
    const deltaLon = resultado & 1 ? ~(resultado >> 1) : resultado >> 1;
    lon += deltaLon;

    const ponto: CoordenadaMapa = {
      latitude: Number((lat / 1e5).toFixed(6)),
      longitude: Number((lon / 1e5).toFixed(6)),
    };
    if (!coordenadaMapaValida(ponto)) {
      return { pontos: [], invalida: true };
    }
    pontos.push(ponto);
  }

  if (pontos.length < 2) {
    return { pontos: [], invalida: true };
  }

  return { pontos, invalida: false };
}

/**
 * Calcula enquadramento (`fitBounds` para ≥ 2 pontos distintos ou `centroUnico` para 1 ponto).
 */
export function calcularLimitesCoordenadas(pontos: CoordenadaMapa[]): ResultadoEnquadramento {
  const validos = pontos.filter(coordenadaMapaValida);
  if (validos.length === 0) {
    return { centroUnico: null, limites: null };
  }

  let minLat = validos[0]!.latitude;
  let maxLat = validos[0]!.latitude;
  let minLon = validos[0]!.longitude;
  let maxLon = validos[0]!.longitude;

  for (const ponto of validos) {
    if (ponto.latitude < minLat) minLat = ponto.latitude;
    if (ponto.latitude > maxLat) maxLat = ponto.latitude;
    if (ponto.longitude < minLon) minLon = ponto.longitude;
    if (ponto.longitude > maxLon) maxLon = ponto.longitude;
  }

  const deltaLat = Math.abs(maxLat - minLat);
  const deltaLon = Math.abs(maxLon - minLon);
  if (deltaLat < 1e-6 && deltaLon < 1e-6) {
    return { centroUnico: validos[0]!, limites: null };
  }

  return {
    centroUnico: null,
    limites: [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
  };
}

export interface GeoJsonFeaturePoligono {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
}

export interface GeoJsonFeatureCollectionPoligonos {
  type: 'FeatureCollection';
  features: GeoJsonFeaturePoligono[];
}

export interface GeoJsonFeatureLinha {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export interface GeoJsonFeatureCollectionLinhas {
  type: 'FeatureCollection';
  features: GeoJsonFeatureLinha[];
}

/**
 * Gera um polígono GeoJSON aproximando um círculo de incerteza em metros ao redor de um checkpoint.
 */
export function gerarCirculoGeoJson(
  centro: CoordenadaMapa,
  raioMetros: number,
  segmentos = 48,
): GeoJsonFeaturePoligono {
  const passo = Math.max(12, segmentos);
  const raioSeguro = Math.max(1, raioMetros);
  const latRad = (centro.latitude * Math.PI) / 180;
  const deltaLat = (raioSeguro / RAIO_TERRA_METROS) * (180 / Math.PI);
  const cosLat = Math.max(0.01, Math.cos(latRad));
  const deltaLon = deltaLat / cosLat;

  const anel: [number, number][] = [];
  for (let i = 0; i <= passo; i += 1) {
    const angulo = (i / passo) * 2 * Math.PI;
    const lon = Number((centro.longitude + deltaLon * Math.cos(angulo)).toFixed(6));
    const lat = Number((centro.latitude + deltaLat * Math.sin(angulo)).toFixed(6));
    anel.push([lon, lat]);
  }

  return {
    type: 'Feature',
    properties: { raioMetros: Math.round(raioSeguro) },
    geometry: {
      type: 'Polygon',
      coordinates: [anel],
    },
  };
}

export function criarFeatureCollectionLinhas(
  segmentos: CoordenadaMapa[][],
): GeoJsonFeatureCollectionLinhas {
  const features: GeoJsonFeatureLinha[] = [];
  for (const segmento of segmentos) {
    const validos = segmento.filter(coordenadaMapaValida);
    if (validos.length < 2) continue;
    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: validos.map((ponto) => [ponto.longitude, ponto.latitude]),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function formatarDistanciaKm(metros: number | null | undefined): string {
  if (typeof metros !== 'number' || !Number.isFinite(metros) || metros < 0) return '—';
  if (metros < 1000) {
    return `${Math.round(metros)} m`;
  }
  const km = metros / 1000;
  return `${km.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export function calcularDistanciaOdometroKm(odometro?: OdometroRotaMapa | null): number | null {
  if (!odometro) return null;
  const { kmInicial, kmFinal } = odometro;
  if (
    typeof kmInicial !== 'number' ||
    typeof kmFinal !== 'number' ||
    !Number.isFinite(kmInicial) ||
    !Number.isFinite(kmFinal) ||
    kmFinal < kmInicial
  ) {
    return null;
  }
  return kmFinal - kmInicial;
}

export function formatarHorarioCheckpoint(valor: string): string {
  const limpo = valor.trim();
  if (!limpo) return '—';
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(limpo)) {
    return limpo.slice(0, 5);
  }
  const data = new Date(limpo);
  if (Number.isNaN(data.getTime())) return limpo;
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
