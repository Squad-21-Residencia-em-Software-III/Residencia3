export const ORIGEM_MAPAS_SW = 'https://tiles.openfreemap.org';

export const CACHE_MAPA_ESTILOS = 'openfreemap-styles';
export const CACHE_MAPA_RECURSOS = 'openfreemap-assets';

export const ORCAMENTO_CACHE_MAPAS = {
  maxEntradasTotal: 250,
  maxEntradasEstilo: 10,
  maxEntradasRecursos: 240,
  maxIdadeSegundos: 60 * 60 * 24 * 7,
  limparAoExcederCota: true,
} as const;

const PREFIXOS_ESTILO = ['/styles/', '/planet', '/backup_planet'] as const;
const PREFIXOS_RECURSO = ['/sprites/', '/fonts/', '/natural_earth/'] as const;
const EXTENSOES_TILE = ['.pbf', '.mvt', '.png', '.webp'] as const;

function ehGetNaOrigemAutorizada(url: URL, method = 'GET'): boolean {
  if (method.toUpperCase() !== 'GET') return false;
  if (url.origin !== ORIGEM_MAPAS_SW) return false;
  if (url.pathname.startsWith('/api/')) return false;
  return true;
}

/**
 * Identifica arquivos de estilo JSON e TileJSON do OpenFreeMap (estratégia StaleWhileRevalidate).
 */
export function ehRequisicaoEstiloMapa(url: URL, method = 'GET'): boolean {
  if (!ehGetNaOrigemAutorizada(url, method)) return false;

  const { pathname } = url;
  if (pathname.startsWith('/styles/')) return true;
  return pathname === '/planet' || pathname === '/backup_planet';
}

/**
 * Identifica tiles vetoriais/raster, sprites e glyphs autorizados do OpenFreeMap (estratégia CacheFirst).
 */
export function ehRequisicaoRecursoMapa(url: URL, method = 'GET'): boolean {
  if (!ehGetNaOrigemAutorizada(url, method)) return false;
  if (ehRequisicaoEstiloMapa(url, method)) return false;

  const { pathname } = url;
  if (PREFIXOS_RECURSO.some((prefixo) => pathname.startsWith(prefixo))) {
    return true;
  }

  const normalizado = pathname.toLowerCase();
  if (PREFIXOS_ESTILO.some((prefixo) => pathname.startsWith(`${prefixo}/`))) {
    return EXTENSOES_TILE.some((ext) => normalizado.endsWith(ext));
  }

  return EXTENSOES_TILE.some((ext) => normalizado.endsWith(ext));
}
