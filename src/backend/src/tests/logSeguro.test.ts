import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../errors/AppError';
import { errorHandler, rotaNaoEncontrada } from '../middlewares/errorHandler';
import { logRequisicao } from '../middlewares/logRequisicao';

afterEach(() => vi.restoreAllMocks());

function criarApp(erro?: unknown) {
  return express().use(logRequisicao).use(express.json({ limit: '100kb' }))
    .post('/teste/:id', (_req, res, next) => erro === undefined ? res.json({ ok: true }) : next(erro))
    .use(rotaNaoEncontrada).use(errorHandler);
}

describe('rastreabilidade e dados sensíveis', () => {
  it('gera UUID e correlaciona resposta e logs sem corpo, caminho ou exceção', async () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const erros = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const segredo = 'SQL SELECT senha CPF 12345678900 token segredo';
    const res = await request(criarApp(new Error(segredo))).post('/teste/12345678900?token=segredo')
      .send({ nested: [{ texto: segredo, senha: 'segredo' }], descricao: segredo });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ erro: 'Erro interno do servidor' });
    const id = res.headers['x-request-id'];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const acesso = JSON.parse(info.mock.calls[0]![0] as string);
    const falha = JSON.parse(erros.mock.calls[0]![0] as string);
    expect(acesso).toMatchObject({ requestId: id, method: 'POST', statusCode: 500, level: 'INFO' });
    expect(falha).toMatchObject({ requestId: id, codigo: 'ERRO_INTERNO', level: 'ERROR' });
    const saida = JSON.stringify([res.body, info.mock.calls, erros.mock.calls]);
    for (const valor of ['12345678900', 'segredo', 'SELECT', 'nested', 'descricao', '/teste']) expect(saida).not.toContain(valor);
  });

  it('preserva UUID válido e substitui identificadores inválidos ou excessivos', async () => {
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const valido = '550e8400-e29b-41d4-a716-446655440000';
    const ok = await request(criarApp()).post('/teste/1').set('X-Request-ID', valido);
    expect(ok.headers['x-request-id']).toBe(valido);
    for (const invalido of ['token-secreto', 'x'.repeat(200), '550e8400-e29b-41d4-a716-446655440000, outro']) {
      const res = await request(criarApp()).post('/teste/1').set('X-Request-ID', invalido);
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.headers['x-request-id']).not.toBe(invalido);
    }
    expect(JSON.stringify(logs.mock.calls)).not.toContain('token-secreto');
  });

  it('não devolve URL, query ou identificador pessoal em 404', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const res = await request(criarApp()).get('/pessoa/12345678900?token=segredo');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ erro: 'Rota não encontrada' });
  });

  it('preserva código e contexto operacional da confirmação SVO', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const contexto = { conflitos: [{ recurso: 'veiculo', intervalo_minutos: 10 }], token_confirmacao: 'desafio' };
    const res = await request(criarApp(new AppError('Confirme o intervalo inferior a 20 minutos', 409, 'CONFIRMACAO_INTERVALO_REDUZIDO', contexto))).post('/teste/1');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ erro: 'Confirme o intervalo inferior a 20 minutos', codigo: 'CONFIRMACAO_INTERVALO_REDUZIDO', contexto });
  });

  it('oculta mensagens de AppError interno', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(criarApp(new AppError('SQL segredo', 500))).post('/teste/1');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ erro: 'Erro interno do servidor' });
  });

  it.each([
    [Object.assign(new Error('SQL segredo'), { code: '23505' }), 409],
    [Object.assign(new Error('SQL segredo'), { code: '57014' }), 503],
    [Object.assign(new Error('material_sensivel SQL'), { code: '42703' }), 503],
    [Object.assign(new Error('liberada_em SQL'), { code: '42703' }), 503],
    [Object.assign(new Error('alertas_atraso_svo SQL'), { code: '42P01' }), 503],
    [z.string().safeParse(1).error, 400],
  ])('mantém status de erros conhecidos sem expor detalhes internos', async (erro, status) => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(criarApp(erro)).post('/teste/1');
    expect(res.status).toBe(status);
    expect(JSON.stringify(res.body)).not.toContain('SQL');
  });

  it('mantém erros de JSON inválido e limite de payload', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const app = criarApp();
    expect((await request(app).post('/teste/1').set('Content-Type', 'application/json').send('{')).status).toBe(400);
    expect((await request(app).post('/teste/1').send({ texto: 'x'.repeat(103000) })).status).toBe(413);
  });
});
