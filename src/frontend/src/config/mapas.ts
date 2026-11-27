export type TemaMapa = 'claro' | 'escuro';

export interface CoordenadaMapa {
  latitude: number;
  longitude: number;
}

export interface VisaoInicialMapa extends CoordenadaMapa {
  zoom: number;
}

export interface AtribuicaoMapa {
  nome: string;
  url: string;
}

export const ORIGEM_MAPA_AUTORIZADA = 'https://tiles.openfreemap.org';
export const ESTILO_MAPA_LIBERTY_URL = `${ORIGEM_MAPA_AUTORIZADA}/styles/liberty`;
export const PIN_FSPH_URL = '/assets/FSPH_PIN.png';

export const CENTRO_PADRAO_SERGIPE: VisaoInicialMapa = {
  latitude: -10.9111,
  longitude: -37.0717,
  zoom: 12,
};

export const LIMITES_SERGIPE = {
  minLatitude: -11.6,
  maxLatitude: -9.5,
  minLongitude: -38.3,
  maxLongitude: -36.3,
} as const;

export const ATRIBUICOES_MAPA: readonly AtribuicaoMapa[] = [
  { nome: 'OpenFreeMap', url: 'https://openfreemap.org/' },
  { nome: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' },
  { nome: 'Corrigir mapa', url: 'https://www.openstreetmap.org/fixthemap' },
  { nome: 'FOSSGIS/OSRM', url: 'https://routing.openstreetmap.de/about.html' },
] as const;

/**
 * Valida se a URL de estilo pertence exclusivamente à origem cartográfica autorizada
 * (https://tiles.openfreemap.org). Qualquer valor vazio ou fora da allowlist volta ao Liberty.
 */
export function validarUrlEstiloMapa(urlBruta?: string | null): string {
  const valor = urlBruta?.trim();
  if (!valor) return ESTILO_MAPA_LIBERTY_URL;

  try {
    const parsed = new URL(valor);
    if (parsed.origin === ORIGEM_MAPA_AUTORIZADA && parsed.pathname.startsWith('/styles/')) {
      return parsed.toString();
    }
  } catch {
    // URL inválida cai no fallback seguro.
  }

  return ESTILO_MAPA_LIBERTY_URL;
}

/**
 * Resolve o estilo do mapa. O parâmetro `tema` já deixa a interface preparada
 * para a futura alternância de temas (claro/escuro) sem retrabalho nos consumidores.
 */
export function obterEstiloMapa(_tema: TemaMapa = 'claro'): string {
  return validarUrlEstiloMapa(import.meta.env.VITE_MAPA_ESTILO_URL);
}
