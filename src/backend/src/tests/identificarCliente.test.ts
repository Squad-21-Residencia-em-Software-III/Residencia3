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
    .set('X-Proxy-Secret', segredo).set('X-Vercel-Forwarded-For', cliente);

describe('IP do cliente nos dois caminhos de acesso', () => {
  it('caminho direto: usa o IP acrescentado pela borda e ignora o forjado', async () => {
    const res = await direto(app, `${FORJADO}, ${CLIENTE_A}`).set('X-Diagnostico-Token', TOKEN);

    expect(res.body).toMatchObject({ clienteIdentificado: CLIENTE_A, caminho: 'direto' });
  });

  it('caminho da Vercel com o segredo: identifica o cliente, e não a Vercel', async () => {
    const res = await viaVercel(app, CLIENTE_A).set('X-Diagnostico-Token', TOKEN);

    expect(res.body).toMatchObject({ clienteIdentificado: CLIENTE_A, caminho: 'vercel' });
  });

  it('caminho da Vercel, se a borda não acrescentar a Vercel: mantém o req.ip', async () => {
    const res = await request(app)
      .get('/api/diagnostico/ip')
      .set('X-Forwarded-For', CLIENTE_A)
      .set('X-Vercel-Forwarded-For', CLIENTE_A)
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

  it.each([
    ['ausente', undefined],
    ['múltiplos valores', '203.0.113.10, 198.51.100.7'],
    ['com porta', '203.0.113.10:443'],
    ['malformado', 'desconhecido'],
  ])('IP Vercel %s usa o caminho direto', async (_caso, ip) => {
    const consulta = direto(app, VERCEL).set('X-Proxy-Secret', SEGREDO).set('X-Diagnostico-Token', TOKEN);
    if (ip) consulta.set('X-Vercel-Forwarded-For', ip);

    const res = await consulta;
    expect(res.body).toEqual({ clienteIdentificado: VERCEL, caminho: 'direto' });
  });

  it('ignora IP Vercel sem prova de proxy', async () => {
    const res = await direto(app, CLIENTE_A)
      .set('X-Vercel-Forwarded-For', CLIENTE_B)
      .set('X-Diagnostico-Token', TOKEN);

    expect(res.body).toEqual({ clienteIdentificado: CLIENTE_A, caminho: 'direto' });
  });

  it('rejeita cabeçalhos de segredo duplicados', async () => {
    const res = await viaVercel(app, CLIENTE_A)
      .set('X-Proxy-Secret', [SEGREDO, SEGREDO] as unknown as string)
      .set('X-Diagnostico-Token', TOKEN);

    expect(res.body).toEqual({ clienteIdentificado: VERCEL, caminho: 'direto' });
  });

  it('usa o socket quando o endereço selecionado do caminho direto é inválido', async () => {
    const res = await direto(app, 'invalido').set('X-Diagnostico-Token', TOKEN);
    expect(res.body).toEqual({ clienteIdentificado: '127.0.0.1', caminho: 'direto' });
  });

  it('mantém o IP da Vercel independente da quantidade de entradas no XFF do Render', async () => {
    const res = await viaVercel(app, '2001:db8::10')
      .set('X-Forwarded-For', '203.0.113.10, 198.51.100.7, 192.0.2.4')
      .set('X-Diagnostico-Token', TOKEN);

    expect(res.body).toEqual({ clienteIdentificado: '2001:db8::10', caminho: 'vercel' });
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

  it('retorna apenas o IP e caminho, sem cookies, Authorization ou segredo', async () => {
    const res = await viaVercel(app, CLIENTE_A)
      .set('X-Diagnostico-Token', TOKEN)
      .set('Cookie', 'refreshToken=abc')
      .set('Authorization', 'Bearer abc');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ clienteIdentificado: CLIENTE_A, caminho: 'vercel' });
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
    request(alvo).post('/login').set('X-Forwarded-For', `${cliente}, ${VERCEL}`).set('X-Proxy-Secret', SEGREDO).set('X-Vercel-Forwarded-For', cliente);

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

  it('aplica a sub-rede IPv6 do limitador padrão e normaliza IPv4 mapeado', async () => {
    const ipv6 = appLimitado();
    await loginDireto(ipv6, '2001:db8:1234:5600::1');
    await loginVercel(ipv6, '2001:db8:1234:5600::2');
    expect((await loginVercel(ipv6, '2001:db8:1234:5600::3')).status).toBe(429);
    expect((await loginVercel(ipv6, '2001:db8:1234:5800::1')).status).toBe(401);

    const ipv4 = appLimitado();
    await loginDireto(ipv4, CLIENTE_A);
    await loginVercel(ipv4, '::ffff:203.0.113.10');
    expect((await loginVercel(ipv4, CLIENTE_A)).status).toBe(429);
  });

  it('mantém o alerta do limitador para confiança irrestrita', async () => {
    const logs = espionarLogs();
    const alvo = appLimitado().set('trust proxy', true);
    await loginDireto(alvo, CLIENTE_A);
    expect(logs()).toContain('ERR_ERL_PERMISSIVE_TRUST_PROXY');
  });
  it('o mesmo cliente compartilha o limite entre os dois caminhos', async () => {
    const alvo = appLimitado();

    await loginVercel(alvo, CLIENTE_A);
    await loginDireto(alvo, CLIENTE_A);
    const bloqueado = await loginVercel(alvo, CLIENTE_A);

    expect(bloqueado.status).toBe(429);
  });
});
