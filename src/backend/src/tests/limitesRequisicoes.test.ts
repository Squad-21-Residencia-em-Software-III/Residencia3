import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer } from 'node:http';
import request from 'supertest';

vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn(), login: vi.fn() } }));
vi.mock('../services/dashboardService', () => ({ dashboardService: { consultar: vi.fn(async () => ({})) } }));
vi.mock('../services/veiculoService', () => ({ veiculoService: { listar: vi.fn(async () => []), criar: vi.fn() } }));
vi.mock('../config/database', () => ({ db: { raw: vi.fn(async () => ({ rows: [{ now: new Date() }] })) } }));

import { app } from '../app';
import { env } from '../config/env';
import { configurarServidor, TEMPO_CABECALHOS_MS, TEMPO_KEEP_ALIVE_MS } from '../config/servidor';
import { AppError } from '../errors/AppError';
import { errorHandler } from '../middlewares/errorHandler';
import { criarLimitadorConcorrencia } from '../middlewares/limitarConcorrencia';
import { criarLimitadorTempo, MENSAGEM_TEMPO_ESGOTADO } from '../middlewares/limitarTempoRequisicao';
import { authService } from '../services/authService';

type Ambiente = {
  limitarRequisicoes: boolean;
  rateLimitLeituraPorMin: number;
  rateLimitEscritaPorMin: number;
  rateLimitPesadasPorMin: number;
};
const ambiente = env as unknown as Ambiente;
const original = { ...ambiente };

// Cada teste usa um IP próprio (via X-Forwarded-For com trust proxy), para não herdar contagens
let ipDoTeste = 0;
let ip = '';
const comIp = (req: request.Test) => req.set('X-Forwarded-For', ip).set('Authorization', 'Bearer token');

beforeEach(() => {
  ipDoTeste += 1;
  ip = `198.51.100.${ipDoTeste}`;
  app.set('trust proxy', 1);
  Object.assign(ambiente, { limitarRequisicoes: true, rateLimitLeituraPorMin: 5, rateLimitEscritaPorMin: 3, rateLimitPesadasPorMin: 2 });
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 1, perfil: 'ADMINISTRADOR', ativo: true } as never);
});

afterEach(() => {
  Object.assign(ambiente, original);
  app.set('trust proxy', env.trustProxy);
  vi.restoreAllMocks();
});

async function repetir(vezes: number, fazer: () => request.Test) {
  const respostas: request.Response[] = [];
  for (let i = 0; i < vezes; i += 1) respostas.push(await fazer());
  return respostas;
}

describe('Limites por tipo de operação (app real)', () => {
  it('permite consultas até o limite e responde 429 com Retry-After depois dele', async () => {
    const respostas = await repetir(6, () => comIp(request(app).get('/api/veiculos')));

    expect(respostas.slice(0, 5).map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(respostas[5]!.status).toBe(429);
    expect(respostas[5]!.headers['retry-after']).toBeDefined();
    expect(respostas[5]!.body.erro).toContain('Muitas consultas');
  });

  it('limita as alterações com contador próprio, separado das consultas', async () => {
    await repetir(5, () => comIp(request(app).get('/api/veiculos')));
    // Leituras esgotadas não bloqueiam a escrita
    const escritas = await repetir(4, () => comIp(request(app).post('/api/veiculos')).send({}));

    expect(escritas.slice(0, 3).every((r) => r.status !== 429)).toBe(true);
    expect(escritas[3]!.status).toBe(429);
    expect(escritas[3]!.body.erro).toContain('Muitas alterações');
  });

  it('aplica limite menor às consultas pesadas (dashboard)', async () => {
    const respostas = await repetir(3, () => comIp(request(app).get('/api/dashboard')));

    expect(respostas.map((r) => r.status)).toEqual([200, 200, 429]);
    expect(respostas[2]!.body.erro).toContain('relatórios');
  });

  it('não conta o login no limite geral de escrita (ele tem limite próprio)', async () => {
    vi.mocked(authService.login).mockResolvedValue({ resposta: {}, refreshToken: 'r', sessaoExp: 9999999999 } as never);
    const respostas = await repetir(5, () =>
      request(app).post('/api/auth/login').set('Origin', 'http://localhost:5173').set('X-Forwarded-For', ip).send({ email: 'a@b.com', senha: 'x' })
    );

    expect(respostas.every((r) => r.status === 200)).toBe(true);
  });

  it('clientes diferentes não dividem o mesmo limite', async () => {
    await repetir(6, () => comIp(request(app).get('/api/veiculos')));

    const outroCliente = await request(app)
      .get('/api/veiculos')
      .set('X-Forwarded-For', `203.0.113.${ipDoTeste}`)
      .set('Authorization', 'Bearer token');

    expect(outroCliente.status).toBe(200);
  });

  it('informa o limite nos cabeçalhos RateLimit para requisições legítimas', async () => {
    const res = await comIp(request(app).get('/api/veiculos'));

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-policy']).toContain('5');
  });
});

describe('Limite de requisições simultâneas', () => {
  function appConcorrente(maximo: number) {
    const limitador = criarLimitadorConcorrencia(() => maximo);
    const pendentes: (() => void)[] = [];
    const alvo = express()
      .use(limitador)
      .get('/api/status', (_req, res) => res.json({ ok: true }))
      .get('/lento', (_req, res) => {
        pendentes.push(() => res.json({ ok: true }));
      })
      .get('/rapido', (_req, res) => res.json({ ok: true }));
    return { alvo, limitador, liberarTodas: () => pendentes.splice(0).forEach((f) => f()), pendentes };
  }

  it('recusa com 503 acima do máximo e libera vaga quando as requisições terminam', async () => {
    const { alvo, limitador, liberarTodas, pendentes } = appConcorrente(2);
    const servidor = createServer(alvo).listen(0);

    const lentas = [request(servidor).get('/lento'), request(servidor).get('/lento')].map((r) => r.then((x) => x));
    await vi.waitFor(() => expect(pendentes).toHaveLength(2));

    const excedente = await request(servidor).get('/rapido');
    expect(excedente.status).toBe(503);
    expect(excedente.headers['retry-after']).toBe('1');

    // O health check continua respondendo
    expect((await request(servidor).get('/api/status')).status).toBe(200);

    liberarTodas();
    await Promise.all(lentas);
    expect(limitador.emAndamento()).toBe(0);
    expect((await request(servidor).get('/rapido')).status).toBe(200);
    servidor.close();
  });
});

describe('Tempo limite da requisição', () => {
  it('responde 503 quando o handler passa do tempo e descarta a resposta tardia sem erro', async () => {
    const erros = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let respostaTardia: () => void = () => undefined;
    const alvo = express()
      .use(criarLimitadorTempo(() => 50))
      .get('/lento', (_req, res) => {
        respostaTardia = () => res.json({ tarde: true });
      })
      .use(errorHandler);

    const res = await request(alvo).get('/lento');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ erro: MENSAGEM_TEMPO_ESGOTADO });
    expect(res.headers['retry-after']).toBe('5');
    expect(() => respostaTardia()).not.toThrow();
    expect(erros).not.toHaveBeenCalled();
  });

  it('não interfere em requisições que respondem dentro do tempo', async () => {
    const alvo = express()
      .use(criarLimitadorTempo(() => 1000))
      .get('/rapido', (_req, res) => res.json({ ok: true }));

    const res = await request(alvo).get('/rapido');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('o errorHandler não tenta responder de novo depois do tempo esgotado', async () => {
    let falharDepois: (erro: unknown) => void = () => undefined;
    const alvo = express()
      .use(criarLimitadorTempo(() => 30))
      .get('/lento', (_req, _res, next) => {
        falharDepois = next;
      })
      .use(errorHandler);

    const res = await request(alvo).get('/lento');
    expect(res.status).toBe(503);
    expect(() => falharDepois(new AppError('tarde', 400))).not.toThrow();
  });
});

describe('Tempo limite no banco de dados (errorHandler)', () => {
  const appComErro = (erro: unknown) =>
    express()
      .get('/', () => {
        throw erro;
      })
      .use(errorHandler);

  it.each([
    ['statement_timeout (57014)', Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014', sql: 'SELECT * FROM usuarios WHERE senha = $1' })],
    ['query_timeout do driver', new Error('Query read timeout')],
  ])('converte %s em 503 sem expor o SQL', async (_caso, erro) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(appComErro(erro)).get('/');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ erro: 'A operação demorou mais que o permitido. Tente novamente.' });
    expect(res.headers['retry-after']).toBe('5');
    expect(JSON.stringify(log.mock.calls)).not.toContain('SELECT');
  });

  it('converte pool esgotado (KnexTimeoutError) em 503', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const erro = Object.assign(new Error('Knex: Timeout acquiring a connection'), { name: 'KnexTimeoutError' });

    const res = await request(appComErro(erro)).get('/');

    expect(res.status).toBe(503);
    expect(res.body.erro).toBe('Banco de dados ocupado. Tente novamente em instantes.');
  });
});

describe('Limites preservados e do servidor HTTP', () => {
  it('mantém o limite de 100 KB no corpo JSON (413)', async () => {
    const corpo = JSON.stringify({ dados: 'x'.repeat(101 * 1024) });

    const res = await comIp(request(app).post('/api/veiculos')).set('Content-Type', 'application/json').send(corpo);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ erro: 'O corpo da requisição excede o limite de 100 KB' });
  });

  it('configura os tempos do servidor Node (requisição, cabeçalhos e keep-alive)', () => {
    const servidor = configurarServidor(createServer(), 15_000);

    expect(servidor.requestTimeout).toBe(20_000);
    expect(servidor.headersTimeout).toBe(TEMPO_CABECALHOS_MS);
    expect(servidor.keepAliveTimeout).toBe(TEMPO_KEEP_ALIVE_MS);
  });
});
