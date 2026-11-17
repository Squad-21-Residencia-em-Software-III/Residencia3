import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { errorHandler } from '../middlewares/errorHandler';

describe('compatibilidade com banco sem migration da agenda', () => {
  it('informa indisponibilidade ao tentar gravar material sensível sem a coluna administrativa', () => {
    const json = vi.fn();
    const res = { headersSent: false, status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
    errorHandler({ code: '42703', message: 'column "material_sensivel" does not exist' }, {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({ erro: 'O registro de material sensível ainda não está disponível: o banco precisa ser atualizado.' });
  });
  it.each([
    { code: '42703', message: 'column o.liberada_em does not exist' },
    { code: '42P01', message: 'relation "alertas_atraso_svo" does not exist' },
  ])('explica a dependência sem expor a consulta SQL', (erro) => {
    const json = vi.fn();
    const res = { headersSent: false, status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
    errorHandler(erro, {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      erro: 'A agenda SVO ainda não está disponível: a estrutura do banco precisa ser atualizada pela equipe responsável.',
    });
  });
});
