import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn() } }));

import { app } from '../app';
import { env } from '../config/env';
import { identificarCliente } from '../middlewares/identificarCliente';
import { criarLimitador } from '../middlewares/limitarTentativasLogin';

// Os dois caminhos de acesso em produção (docs/seguranca-http.md). No teste, o socket vem de
// 127.0.0.1, no papel da borda do Render, com TRUST_PROXY=1 (o salto da borda).
//   direto: X-Forwarded-For = "<forjado pelo cliente>, <cliente>" (a borda acrescenta o cliente)
//   Vercel: X-Forwarded-For = "<cliente>, <Vercel>" + X-Proxy-Secret (a Vercel substitui o XFF)
const SEGREDO = 'Vx7-pQ2_mZ9rT4kW8nB1cY6hJ3fL0sD5gA';
const TOKEN = 'Dg4-tR8_wK2pM6zX1cV9bN3jH7qL5sF0yE';
const CLIENTE_A = '203.0.113.10';
const CLIENTE_B = '198.51.100.7';
const VERCEL = '76.76.21.21';
const FORJADO = '6.6.6.6';

type Ambiente = { trustProxy: unknown; proxySecret?: string; diagnosticoProxyToken?: string };
const ambiente = env as unknown as Ambiente;
const original = { ...ambiente };

beforeEach(() => {
  Object.assign(ambiente, { trustProxy: 1, proxySecret: SEGREDO, diagnosticoProxyToken: TOKEN });
  app.set('trust proxy', 1);
});

afterEach(() => {
  Object.assign(ambiente, original);
  app.set('trust proxy', env.trustProxy);
  vi.restoreAllMocks();
});

type Alvo = Parameters<typeof request>[0];
const direto = (alvo: Alvo, xff: string) => request(alvo).get('/api/diagnostico/ip').set('X-Forwarded-For', xff);
const viaVercel = (alvo: Alvo, cliente: string, segredo = SEGREDO) =>
  request(alvo)
    .get('/api/diagnostico/ip')
    .set('X-Forwarded-For', `${cliente}, ${VERCEL}`)
    .set('X-Proxy-Secret', segredo);

describe('IP do cliente nos dois caminhos de acesso', () => {
  it('caminho direto: usa o IP acrescentado pela borda e ignora o forjado', async () => {
    const res = await direto(app, `${FORJADO}, ${CLIENTE_A}`).set('X-Diagnostico-Token', TOKEN);

    expect(res.body).toMatchObject({ clienteIdentificado: CLIENTE_A, caminho: 'direto' });
  });

  it('caminho da Vercel com o segredo: identifica o cliente, e não a Vercel', async () => {
    const res = await viaVercel(app, CLIENTE_A).set('X-Diagnostico-Token', TOKEN);

    expect(res.body).toMatchObject({ clienteIdentificado: CLIENTE_A, caminho: 'vercel', ipPeloTrustProxy: VERCEL });
  });

  it('caminho da Vercel, se a borda não acrescentar a Vercel: mantém o req.ip', async () => {
    const res = await request(app)
      .get('/api/diagnostico/ip')
      .set('X-Forwarded-For', CLIENTE_A)
      .set('X-Proxy-Secret', SEGREDO)
      .set('X-Diagnostico-Token', TOKEN);

    expect(res.body).toMatchObject({ clienteIdentificado: CLIENTE_A, caminho: 'vercel' });
  });

  it.each([
    ['inválido', 'segredo-errado'],
    ['vazio', ''],
  ])('segredo %s: tratado como acesso direto, sem confiar no salto extra', async (_caso, segredo) => {
    const res = await viaVercel(app, FORJADO, segredo).set('X-Diagnostico-Token', TOKEN);

    expect(res.body).toMatchObject({ clienteIdentificado: VERCEL, caminho: 'direto' });
  });

  it('sem PROXY_SECRET configurado, nenhum cabeçalho ativa o caminho da Vercel', async () => {
    ambiente.proxySecret = undefined;
    const res = await viaVercel(app, FORJADO).set('X-Diagnostico-Token', TOKEN);

    expect(res.body).toMatchObject({ clienteIdentificado: VERCEL, caminho: 'direto' });
  });

  it('o segredo não chega às rotas', async () => {
    const alvo = express()
      .set('trust proxy', 1)
      .use(identificarCliente)
      .get('/eco', (req, res) => res.json({ segredo: req.headers['x-proxy-secret'] ?? null }));

    const res = await request(alvo).get('/eco').set('X-Proxy-Secret', SEGREDO);

    expect(res.body.segredo).toBeNull();
  });
});

describe('Rota de diagnóstico /api/diagnostico/ip', () => {
  it('não existe sem DIAGNOSTICO_PROXY_TOKEN', async () => {
    ambiente.diagnosticoProxyToken = undefined;
    const res = await direto(app, CLIENTE_A).set('X-Diagnostico-Token', TOKEN);

    expect(res.status).toBe(404);
  });

  it('recusa token ausente', async () => {
    const res = await direto(app, CLIENTE_A);

    expect(res.status).toBe(401);
  });

  it('recusa token errado', async () => {
    const res = await direto(app, CLIENTE_A).set('X-Diagnostico-Token', 'x'.repeat(34));

    expect(res.status).toBe(401);
  });

  it('expõe só os cabeçalhos de proxy, sem cookies, Authorization ou o segredo', async () => {
    const res = await viaVercel(app, CLIENTE_A)
      .set('X-Diagnostico-Token', TOKEN)
      .set('Cookie', 'refreshToken=abc')
      .set('Authorization', 'Bearer abc');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body.cabecalhos)).toEqual([
      'x-forwarded-for',
      'x-forwarded-proto',
      'x-forwarded-host',
      'x-real-ip',
      'x-vercel-forwarded-for',
      'cf-connecting-ip',
      'true-client-ip',
    ]);
    const corpo = JSON.stringify(res.body);
    expect(corpo).not.toContain(SEGREDO);
    expect(corpo).not.toContain('refreshToken');
    expect(corpo).not.toContain('Bearer');
  });
});

describe('Rate limit por cliente nos dois caminhos', () => {
  function appLimitado() {
    return express()
      .set('trust proxy', 1)
      .use(identificarCliente)
      .post('/login', criarLimitador(2, 'Muitas tentativas'), (_req, res) => {
        res.status(401).json({ erro: 'E-mail ou senha inválidos' });
      });
  }
  const loginDireto = (alvo: Alvo, xff: string) => request(alvo).post('/login').set('X-Forwarded-For', xff);
  const loginVercel = (alvo: Alvo, cliente: string) =>
    request(alvo).post('/login').set('X-Forwarded-For', `${cliente}, ${VERCEL}`).set('X-Proxy-Secret', SEGREDO);

  function espionarLogs() {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    return () => JSON.stringify([...erros.mock.calls, ...avisos.mock.calls]);
  }

  it('via Vercel: cada cliente tem o próprio limite, sem erros ERR_ERL', async () => {
    const logs = espionarLogs();
    const alvo = appLimitado();

    await loginVercel(alvo, CLIENTE_A);
    await loginVercel(alvo, CLIENTE_A);
    const bloqueado = await loginVercel(alvo, CLIENTE_A);
    const outroCliente = await loginVercel(alvo, CLIENTE_B);

    expect(bloqueado.status).toBe(429);
    expect(outroCliente.status).toBe(401);
    expect(logs()).not.toContain('ERR_ERL');
  });

  it('direto: trocar o X-Forwarded-For forjado não zera o contador, sem erros ERR_ERL', async () => {
    const logs = espionarLogs();
    const alvo = appLimitado();

    await loginDireto(alvo, `1.1.1.1, ${CLIENTE_A}`);
    await loginDireto(alvo, `2.2.2.2, ${CLIENTE_A}`);
    const bloqueado = await loginDireto(alvo, `3.3.3.3, ${CLIENTE_A}`);
    const outroCliente = await loginDireto(alvo, CLIENTE_B);

    expect(bloqueado.status).toBe(429);
    expect(outroCliente.status).toBe(401);
    expect(logs()).not.toContain('ERR_ERL');
  });

  it('o mesmo cliente compartilha o limite entre os dois caminhos', async () => {
    const alvo = appLimitado();

    await loginVercel(alvo, CLIENTE_A);
    await loginDireto(alvo, CLIENTE_A);
    const bloqueado = await loginVercel(alvo, CLIENTE_A);

    expect(bloqueado.status).toBe(429);
  });
});
