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

const CAMINHO_TILES = /^\/(?:planet|backup_planet|natural_earth)\/.+\.(?:pbf|mvt|png|webp)$/;
const CAMINHO_SPRITES = /^\/sprites\/.+\.(?:json|png|webp)$/;
const CAMINHO_GLYPHS = /^\/fonts\/.+\.pbf$/;

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
  const { pathname } = url;
  return CAMINHO_TILES.test(pathname) || CAMINHO_SPRITES.test(pathname) || CAMINHO_GLYPHS.test(pathname);
}
