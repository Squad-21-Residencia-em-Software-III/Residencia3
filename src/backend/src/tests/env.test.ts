import { describe, expect, it } from 'vitest';
import { carregarEnv } from '../config/env';

const SEGREDO_VALIDO = 'k3J9-qZx81_LmPv0Wb7Rt2Ys5Hn4Gc6Df';

const carregar = (extras: Record<string, string | undefined> = {}) =>
  carregarEnv({ JWT_SECRET: SEGREDO_VALIDO, ...extras });

describe('Configuração do JWT (env)', () => {
  it('aplica a política padrão: access de 2h e refresh de 12h', () => {
    expect(carregar()).toMatchObject({
      jwtExpiresIn: '2h',
      jwtExpiraEmSegundos: 7200,
      jwtRefreshExpiresIn: '12h',
      jwtRefreshExpiraEmSegundos: 43200,
    });
  });

  it('exige JWT_SECRET', () => {
    expect(() => carregarEnv({})).toThrow('JWT_SECRET');
  });

  it.each([
    ['curto', 'abc123'],
    ['valor de exemplo da documentação', 'troque_por_um_segredo_longo_e_aleatorio'],
    ['previsível', 'a'.repeat(40)],
    ['com poucos caracteres distintos', 'abababababcdcdcdcdcdabababababcdcd'],
  ])('rejeita segredo %s sem exibir o valor', (_caso, segredo) => {
    let mensagem = '';
    try {
      carregarEnv({ JWT_SECRET: segredo });
    } catch (erro) {
      mensagem = (erro as Error).message;
    }
    expect(mensagem).toContain('JWT_SECRET');
    expect(mensagem).not.toContain(segredo);
  });

  it.each(['8', '2 h', '2horas', '-1h', '1.5h', '0h'])('rejeita JWT_EXPIRES_IN inválido: %s', (valor) => {
    expect(() => carregar({ JWT_EXPIRES_IN: valor })).toThrow('JWT_EXPIRES_IN');
  });

  it('rejeita access token acima de 8h e refresh acima de 24h', () => {
    expect(() => carregar({ JWT_EXPIRES_IN: '9h', JWT_REFRESH_EXPIRES_IN: '12h' })).toThrow('JWT_EXPIRES_IN');
    expect(() => carregar({ JWT_REFRESH_EXPIRES_IN: '2d' })).toThrow('JWT_REFRESH_EXPIRES_IN');
  });

  it('exige refresh mais longo que o access token', () => {
    expect(() => carregar({ JWT_EXPIRES_IN: '2h', JWT_REFRESH_EXPIRES_IN: '120m' })).toThrow(
      'JWT_REFRESH_EXPIRES_IN deve ser maior'
    );
  });

  it('aceita durações em minutos', () => {
    expect(carregar({ JWT_EXPIRES_IN: '30m', JWT_REFRESH_EXPIRES_IN: '8h' })).toMatchObject({
      jwtExpiraEmSegundos: 1800,
      jwtRefreshExpiraEmSegundos: 28800,
    });
  });
});

describe('Configuração de CORS, proxy e cookie (env)', () => {
  it('usa a origem do Vite no desenvolvimento e nenhuma origem cruzada em produção', () => {
    expect(carregar().corsOrigens).toEqual(['http://localhost:5173']);
    expect(carregar({ NODE_ENV: 'production', TRUST_PROXY: '2' }).corsOrigens).toEqual([]);
  });

  it('aceita uma lista explícita de origens', () => {
    expect(carregar({ CORS_ORIGIN: 'https://fsph-web.vercel.app, http://localhost:5173' }).corsOrigens).toEqual([
      'https://fsph-web.vercel.app',
      'http://localhost:5173',
    ]);
  });

  it.each(['*', 'fsph-web.vercel.app', 'https://fsph-web.vercel.app/', 'https://fsph-web.vercel.app/api', 'ftp://x.com'])(
    'rejeita CORS_ORIGIN inválido: %s',
    (valor) => {
      expect(() => carregar({ CORS_ORIGIN: valor })).toThrow('CORS_ORIGIN');
    }
  );

  it('sem TRUST_PROXY fora de produção, não confia em nenhum proxy', () => {
    expect(carregar().trustProxy).toBe(false);
    expect(carregar({ TRUST_PROXY: '0' }).trustProxy).toBe(false);
  });

  it('lê TRUST_PROXY como número de saltos', () => {
    expect(carregar({ TRUST_PROXY: '2' }).trustProxy).toBe(2);
  });

  it('lê TRUST_PROXY como lista de IPs, CIDRs e sub-redes nomeadas', () => {
    expect(carregar({ TRUST_PROXY: 'loopback, 10.0.0.0/8, 76.76.21.21, 2001:db8::/32' }).trustProxy).toEqual([
      'loopback',
      '10.0.0.0/8',
      '76.76.21.21',
      '2001:db8::/32',
    ]);
  });

  it.each(['true', '*', '-1', '1.5', '99', '0.0.0.0/0', '::/0', '10.0.0.0/33', '300.1.1.1', 'proxy.render.com', '10.0.0.0/8/1', ','])(
    'rejeita TRUST_PROXY inválido ou irrestrito: %s',
    (valor) => {
      expect(() => carregar({ TRUST_PROXY: valor })).toThrow('TRUST_PROXY');
    }
  );

  it('exige TRUST_PROXY em produção, sem presumir a cadeia de proxies', () => {
    expect(() => carregar({ NODE_ENV: 'production' })).toThrow('TRUST_PROXY é obrigatório em produção');
    expect(carregar({ NODE_ENV: 'production', TRUST_PROXY: '2' }).trustProxy).toBe(2);
  });

  it('aceita apenas origens https no CORS_ORIGIN em produção', () => {
    const producao = { NODE_ENV: 'production', TRUST_PROXY: '2' };
    expect(() => carregar({ ...producao, CORS_ORIGIN: 'http://fsph-web.vercel.app' })).toThrow('https');
    expect(carregar({ ...producao, CORS_ORIGIN: 'https://fsph-web.vercel.app' }).corsOrigens).toEqual([
      'https://fsph-web.vercel.app',
    ]);
  });

  it('exige cookie Secure em produção', () => {
    expect(carregar({ NODE_ENV: 'production', TRUST_PROXY: '2' }).cookieSecure).toBe(true);
    expect(carregar().cookieSecure).toBe(false);
    expect(carregar({ COOKIE_SECURE: 'true' }).cookieSecure).toBe(true);
    expect(() => carregar({ NODE_ENV: 'production', TRUST_PROXY: '2', COOKIE_SECURE: 'false' })).toThrow('COOKIE_SECURE');
    expect(() => carregar({ COOKIE_SECURE: 'sim' })).toThrow('COOKIE_SECURE');
  });
});
