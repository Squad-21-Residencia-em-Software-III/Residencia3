import { describe, expect, it } from 'vitest';
import vercel from '../../vercel.json';

// SCRUM-241: o que a Vercel precisa manter para os alertas no aparelho (docs/scrum-241-implantacao-push.md).
// As rotas valem na ordem: um cabeçalho depois do `filesystem` nunca chega aos arquivos.

interface Rota {
  src?: string;
  dest?: string;
  handle?: string;
  continue?: boolean;
  headers?: Record<string, string>;
  transforms?: { target: { key: string }; args: string; env?: string[] }[];
}

const rotas = vercel.routes as Rota[];
const posicao = (teste: (rota: Rota) => boolean) => rotas.findIndex(teste);
const filesystem = posicao((rota) => rota.handle === 'filesystem');
const casa = (rota: Rota, caminho: string) => rota.src !== undefined && new RegExp(rota.src).test(caminho);
const rotasDe = (caminho: string) => rotas.slice(0, filesystem).filter((rota) => casa(rota, caminho));

describe('vercel.json', () => {
  it('serve o service worker e o registro sempre atualizados', () => {
    for (const arquivo of ['/sw.js', '/registerSW.js']) {
      const rota = rotasDe(arquivo).find((r) => r.headers?.['Cache-Control']);
      expect(rota?.headers?.['Cache-Control']).toBe('public, max-age=0, must-revalidate');
      expect(rota?.continue).toBe(true);
    }
  });

  it('serve o manifesto com o tipo certo e sem cache longo', () => {
    const rota = rotasDe('/manifest.webmanifest').find((r) => r.headers?.['Content-Type']);
    expect(rota?.headers).toMatchObject({
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    });
  });

  it('leva /api ao backend com o segredo do proxy, antes dos arquivos e do index.html', () => {
    const indice = posicao((rota) => rota.dest?.startsWith('https://') === true);
    expect(indice).toBeGreaterThanOrEqual(0);
    expect(indice).toBeLessThan(filesystem);
    const api = rotas[indice];
    for (const caminho of ['/api', '/api/notificacoes/vapid-public-key', '/api/notificacoes/subscribe']) {
      expect(casa(api, caminho)).toBe(true);
    }
    expect(casa(api, '/apis')).toBe(false);
    expect(api.transforms).toContainEqual(
      expect.objectContaining({ target: { key: 'x-proxy-secret' }, args: '$PROXY_SECRET', env: ['PROXY_SECRET'] })
    );
  });

  it('aplica os cabeçalhos de segurança a tudo e deixa o index.html por último', () => {
    expect(rotas[0]).toMatchObject({
      src: '/(.*)',
      continue: true,
      headers: { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' },
    });
    expect(rotas.at(-1)).toEqual({ src: '/(.*)', dest: '/index.html' });
  });
});
