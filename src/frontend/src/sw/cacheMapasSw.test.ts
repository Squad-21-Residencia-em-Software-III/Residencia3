import { describe, expect, it } from 'vitest';
import {
  ORCAMENTO_CACHE_MAPAS,
  ORIGEM_MAPAS_SW,
  ehRequisicaoEstiloMapa,
  ehRequisicaoRecursoMapa,
} from './cacheMapasSw';

describe('cacheMapasSw', () => {
  it('respeita o orçamento conjunto de 250 entradas, 7 dias e purgeOnQuotaError', () => {
    expect(
      ORCAMENTO_CACHE_MAPAS.maxEntradasEstilo + ORCAMENTO_CACHE_MAPAS.maxEntradasRecursos,
    ).toBeLessThanOrEqual(ORCAMENTO_CACHE_MAPAS.maxEntradasTotal);
    expect(ORCAMENTO_CACHE_MAPAS.maxEntradasTotal).toBe(250);
    expect(ORCAMENTO_CACHE_MAPAS.maxIdadeSegundos).toBe(60 * 60 * 24 * 7);
    expect(ORCAMENTO_CACHE_MAPAS.limparAoExcederCota).toBe(true);
  });

  it('classifica estilo Liberty e TileJSON do OpenFreeMap como StaleWhileRevalidate', () => {
    const urlsEstilo = [
      `${ORIGEM_MAPAS_SW}/styles/liberty`,
      `${ORIGEM_MAPAS_SW}/backup_planet`,
      `${ORIGEM_MAPAS_SW}/planet`,
    ];

    for (const raw of urlsEstilo) {
      const url = new URL(raw);
      expect(ehRequisicaoEstiloMapa(url, 'GET')).toBe(true);
      expect(ehRequisicaoRecursoMapa(url, 'GET')).toBe(false);
    }
  });

  it('classifica sprites, glyphs e tiles do OpenFreeMap como CacheFirst', () => {
    const urlsRecurso = [
      `${ORIGEM_MAPAS_SW}/sprites/ofm_f384/ofm.json`,
      `${ORIGEM_MAPAS_SW}/sprites/ofm_f384/ofm@2x.png`,
      `${ORIGEM_MAPAS_SW}/fonts/Noto%20Sans%20Regular/0-255.pbf`,
      `${ORIGEM_MAPAS_SW}/natural_earth/ne2sr/4/6/8.png`,
      `${ORIGEM_MAPAS_SW}/planet/20261125/12/1630/2170.pbf`,
    ];

    for (const raw of urlsRecurso) {
      const url = new URL(raw);
      expect(ehRequisicaoRecursoMapa(url, 'GET')).toBe(true);
      expect(ehRequisicaoEstiloMapa(url, 'GET')).toBe(false);
    }
  });

  it('nunca permite cache de /api/*, métodos não-GET ou origens de terceiros', () => {
    const bloqueadas = [
      { url: 'https://frota.fsph.se.gov.br/api/mapas/buscar?q=aracaju', method: 'GET' },
      { url: 'https://frota.fsph.se.gov.br/api/viagens', method: 'GET' },
      { url: 'https://tile.openstreetmap.org/12/1630/2170.png', method: 'GET' },
      { url: 'https://maps.googleapis.com/maps/api/js', method: 'GET' },
      { url: ORIGEM_MAPAS_SW + '/qualquer/imagem.png', method: 'GET' },
      { url: ORIGEM_MAPAS_SW + '/fonts/index.json', method: 'GET' },
      { url: `${ORIGEM_MAPAS_SW}/styles/liberty`, method: 'POST' },
      { url: `${ORIGEM_MAPAS_SW}/api/interno`, method: 'GET' },
    ];

    for (const item of bloqueadas) {
      const url = new URL(item.url);
      expect(ehRequisicaoEstiloMapa(url, item.method)).toBe(false);
      expect(ehRequisicaoRecursoMapa(url, item.method)).toBe(false);
    }
  });
});
