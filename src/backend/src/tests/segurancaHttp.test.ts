import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/authService', () => ({
  authService: { usuarioDoToken: vi.fn() },
}));

import { app } from '../app';
import { env } from '../config/env';
import { cabecalhosDeSeguranca } from '../config/segurancaHttp';
import { criarLimitador } from '../middlewares/limitarTentativasLogin';
import { authService } from '../services/authService';

const ORIGEM_FRONT = 'http://localhost:5173';
const ORIGEM_MALICIOSA = 'https://site-malicioso.example';
const ambiente = env as { producao: boolean };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 1, perfil: 'ADMINISTRADOR' } as never);
});

afterEach(() => {
  ambiente.producao = false;
  vi.restoreAllMocks();
});

describe('Cabeçalhos HTTP de segurança', () => {
  it.each([
    ['rota autenticada', '/api/auth/me'],
    ['rota inexistente (404)', '/api/nao-existe'],
  ])('são aplicados em %s', async (_caso, rota) => {
    const res = await request(app).get(rota).set('Authorization', 'Bearer abc.def.ghi');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');
  });

  it('mantém o X-Powered-By desativado', async () => {
    const res = await request(app).get('/api/nao-existe');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('não envia HSTS fora de produção (API local em http)', async () => {
    const res = await request(app).get('/api/nao-existe');

    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('envia HSTS em produção', async () => {
    ambiente.producao = true;
    const appProducao = express().use(cabecalhosDeSeguranca()).get('/', (_req, res) => res.json({}));

    const res = await request(appProducao).get('/');

    expect(res.headers['strict-transport-security']).toBe('max-age=15552000; includeSubDomains');
  });
});

describe('CORS por ambiente', () => {
  it('permite a origem autorizada acessar a API com credenciais', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Origin', ORIGEM_FRONT)
      .set('Authorization', 'Bearer abc.def.ghi');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGEM_FRONT);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('responde ao preflight da origem autorizada com métodos e cabeçalhos permitidos', async () => {
    const res = await request(app)
      .options('/api/veiculos')
      .set('Origin', ORIGEM_FRONT)
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGEM_FRONT);
    expect(res.headers['access-control-allow-methods']).toBe('GET,POST,PUT,PATCH,DELETE');
    expect(res.headers['access-control-allow-headers']).toBe('Content-Type,Authorization');
    expect(res.headers['access-control-max-age']).toBe('600');
  });

  it('não libera a origem não autorizada no preflight nem na resposta', async () => {
    const preflight = await request(app)
      .options('/api/veiculos')
      .set('Origin', ORIGEM_MALICIOSA)
      .set('Access-Control-Request-Method', 'GET');
    const resposta = await request(app)
      .get('/api/auth/me')
      .set('Origin', ORIGEM_MALICIOSA)
      .set('Authorization', 'Bearer abc.def.ghi');

    // Sem Access-Control-Allow-Origin o navegador bloqueia a leitura da resposta pela página
    for (const res of [preflight, resposta]) {
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('nunca responde com curinga', async () => {
    const res = await request(app).get('/api/nao-existe').set('Origin', ORIGEM_FRONT);

    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });
});

// Simula a cadeia Vercel → balanceador do Render → API. No teste, o socket vem de 127.0.0.1
// (o balanceador); o X-Forwarded-For chega como "<forjado pelo cliente>, <cliente>, <Vercel>".
const CLIENTE = '203.0.113.10';
const VERCEL = '76.76.21.21';
const FORJADO = '6.6.6.6';
const CADEIA = `${FORJADO}, ${CLIENTE}, ${VERCEL}`;

function appComProxy(confianca: false | number | readonly string[]) {
  return express()
    .set('trust proxy', confianca)
    .get('/ip', (req, res) => res.json({ ip: req.ip }));
}

describe('IP real do cliente atrás do proxy (trust proxy)', () => {
  it('sem proxy confiável, usa o IP da conexão e ignora o X-Forwarded-For', async () => {
    const res = await request(appComProxy(false)).get('/ip').set('X-Forwarded-For', CADEIA);

    expect(res.body.ip).toMatch(/127\.0\.0\.1$/);
  });

  it('com a quantidade correta de saltos (balanceador + Vercel), identifica o cliente', async () => {
    const res = await request(appComProxy(2)).get('/ip').set('X-Forwarded-For', CADEIA);

    expect(res.body.ip).toBe(CLIENTE);
  });

  it('com a lista de IPs/CIDRs dos proxies, identifica o cliente', async () => {
    const res = await request(appComProxy(['loopback', '76.76.21.0/24'])).get('/ip').set('X-Forwarded-For', CADEIA);

    expect(res.body.ip).toBe(CLIENTE);
  });

  it('o IP forjado pelo cliente no X-Forwarded-For nunca é usado', async () => {
    for (const confianca of [false, 2, ['loopback', '76.76.21.0/24']] as const) {
      const res = await request(appComProxy(confianca)).get('/ip').set('X-Forwarded-For', CADEIA);
      expect(res.body.ip).not.toBe(FORJADO);
    }
  });

  it('presumir 1 salto numa cadeia de 2 identifica o proxy da Vercel, não o cliente', async () => {
    const res = await request(appComProxy(1)).get('/ip').set('X-Forwarded-For', CADEIA);

    expect(res.body.ip).toBe(VERCEL);
  });
});

describe('Rate limit atrás do proxy', () => {
  function appLimitado(confianca: false | number | string[]) {
    return express()
      .set('trust proxy', confianca)
      .post('/login', criarLimitador(2, 'Muitas tentativas'), (_req, res) => {
        res.status(401).json({ erro: 'E-mail ou senha inválidos' });
      });
  }

  const tentar = (alvo: ReturnType<typeof appLimitado>, cliente: string) =>
    request(alvo).post('/login').set('X-Forwarded-For', `${cliente}, ${VERCEL}`);

  it('conta as tentativas por cliente real, sem erro de configuração', async () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const alvo = appLimitado(2);

    await tentar(alvo, CLIENTE);
    await tentar(alvo, CLIENTE);
    const bloqueado = await tentar(alvo, CLIENTE);
    const outroCliente = await tentar(alvo, '198.51.100.7');

    expect(bloqueado.status).toBe(429);
    expect(outroCliente.status).toBe(401);
    expect(JSON.stringify([...erros.mock.calls, ...avisos.mock.calls])).not.toContain('ERR_ERL');
  });

  it('acusa erro de configuração quando há proxy mas TRUST_PROXY não foi definido', async () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await tentar(appLimitado(false), CLIENTE);

    expect(JSON.stringify(erros.mock.calls)).toContain('ERR_ERL_UNEXPECTED_X_FORWARDED_FOR');
  });

  it('sem TRUST_PROXY, todos os clientes atrás do proxy dividiriam o mesmo limite', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const alvo = appLimitado(false);

    await tentar(alvo, CLIENTE);
    await tentar(alvo, CLIENTE);
    const outroCliente = await tentar(alvo, '198.51.100.7');

    expect(outroCliente.status).toBe(429);
  });
});
