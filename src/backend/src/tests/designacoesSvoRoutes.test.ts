import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { AppError } from '../errors/AppError';
import { authService } from '../services/authService';
import { unidadeModel } from '../models/unidadeModel';
import type { Perfil } from '../constants/perfis';

const { consulta } = vi.hoisted(() => ({ consulta: vi.fn() }));
vi.mock('../config/database', () => ({ db: consulta }));
vi.mock('../models/unidadeModel', () => ({ unidadeModel: { estaAssociadoPorNome: vi.fn() } }));
vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn() } }));

const endpoint = '/api/viagens/ordens-svo/12/designacoes';
function autenticarComo(perfil: Perfil) {
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 7, perfil } as never);
}

describe('GET designações de ordem SVO', () => {
  const join = { on: vi.fn().mockReturnThis(), onNull: vi.fn().mockReturnThis() };
  const query = {
    leftJoin: vi.fn((_tabela, on) => { on.call(join); return query; }),
    where: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), orderBy: vi.fn(),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    consulta.mockReturnValue(query);
    vi.mocked(unidadeModel.estaAssociadoPorNome).mockResolvedValue(true);
  });

  it('exige token válido', async () => {
    expect((await request(app).get(endpoint)).status).toBe(401);
    vi.mocked(authService.usuarioDoToken).mockRejectedValueOnce(new AppError('Token inválido', 401));
    expect((await request(app).get(endpoint).set('Authorization', 'Bearer invalido')).status).toBe(401);
    expect(consulta).not.toHaveBeenCalled();
  });

  it.each(['ADMINISTRADOR', 'GESTOR_SVO'] as const)('retorna a composição ativa para %s', async (perfil) => {
    autenticarComo(perfil);
    query.orderBy.mockResolvedValue([{ equipe_id: 3, data_hora_saida: null, usuario_id: 9 }, { equipe_id: 3, data_hora_saida: null, usuario_id: 11 }]);
    const res = await request(app).get(endpoint).set('Authorization', 'Bearer valido');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ equipe_id: 3, iniciada: false, integrantes_ids: [9, 11] });
    expect(query.where).toHaveBeenCalledWith('o.id', 12);
    expect(join.onNull).toHaveBeenCalledWith('d.revogado_em');
  });

  it('retorna 404 para ordem inexistente e lista vazia para ordem legada', async () => {
    autenticarComo('ADMINISTRADOR');
    query.orderBy.mockResolvedValueOnce([]).mockResolvedValueOnce([{ equipe_id: 3, data_hora_saida: new Date(), usuario_id: null }]);
    expect((await request(app).get(endpoint).set('Authorization', 'Bearer valido')).status).toBe(404);
    expect((await request(app).get(endpoint).set('Authorization', 'Bearer valido')).body)
      .toEqual({ equipe_id: 3, iniciada: true, integrantes_ids: [] });
  });

  it.each(['MOTORISTA_SVO', 'INTEGRANTE_SVO', 'GESTOR_FROTA'] as const)('rejeita acesso direto por %s', async (perfil) => {
    autenticarComo(perfil);
    expect((await request(app).get(endpoint).set('Authorization', 'Bearer valido')).status).toBe(403);
    expect(consulta).not.toHaveBeenCalled();
  });

  it('rejeita gestor sem associação à unidade SVO', async () => {
    autenticarComo('GESTOR_SVO');
    vi.mocked(unidadeModel.estaAssociadoPorNome).mockResolvedValue(false);
    expect((await request(app).get(endpoint).set('Authorization', 'Bearer valido')).status).toBe(403);
    expect(consulta).not.toHaveBeenCalled();
  });
});
