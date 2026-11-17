import { afterEach, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../config/database', () => ({ db: { raw: vi.fn() } }));
import { db } from '../config/database';
import { app } from '../app';

afterEach(() => vi.restoreAllMocks());

it('correlaciona falha de status sem registrar exceção ou alterar resposta', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.mocked(db.raw).mockRejectedValueOnce(new Error('SELECT senha token secreto'));
  const res = await request(app).get('/api/status?token=secreto');
  expect(res.status).toBe(500);
  expect(res.body).toEqual({ status: 'Erro', banco_conectado: false });
  expect(JSON.parse(erro.mock.calls[0]![0] as string)).toMatchObject({
    codigo: 'STATUS_BANCO', requestId: res.headers['x-request-id'],
  });
  expect(JSON.stringify([log.mock.calls, erro.mock.calls])).not.toContain('secreto');
});
