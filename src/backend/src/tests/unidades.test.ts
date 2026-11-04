import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { PERFIS, type Perfil } from '../constants/perfis';
import { unidadesQuePodeGerir } from '../constants/unidades';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    transaction: vi.fn(async (callback: Function) => callback('trx')),
  },
}));

vi.mock('../config/database', () => ({
  db: mockDb,
}));

vi.mock('../models/unidadeModel', () => ({
  unidadeModel: {
    listarComGestores: vi.fn(async () => []),
    buscarPorId: vi.fn(),
    buscarComGestores: vi.fn(async (id: number) => ({ id, nome: 'SVO', tipo: 'SVO', gestores: [] })),
    estaAssociado: vi.fn(async () => false),
    associar: vi.fn(),
    desassociar: vi.fn(async () => true),
  },
}));

vi.mock('../models/usuarioModel', () => ({
  usuarioModel: { buscarPorId: vi.fn() },
}));

vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() },
  MODULOS_AUDITORIA: { UNIDADES: 'UNIDADES' },
}));

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

import { app } from '../app';
import { authService } from '../services/authService';
import { unidadeService } from '../services/unidadeService';
import { unidadeModel } from '../models/unidadeModel';
import { usuarioModel } from '../models/usuarioModel';
import { auditoriaModel } from '../models/auditoriaModel';

type UnidadeDoBanco = Awaited<ReturnType<typeof unidadeModel.buscarPorId>>;
type UsuarioDoBanco = Awaited<ReturnType<typeof usuarioModel.buscarPorId>>;

const UNIDADES = {
  SVO: { id: 1, nome: 'SVO', tipo: 'SVO' },
  HEMOSE: { id: 2, nome: 'HEMOSE', tipo: 'ADMINISTRATIVA' },
} as const;

const unidadeNoBanco = (unidade: (typeof UNIDADES)[keyof typeof UNIDADES] | undefined) =>
  vi.mocked(unidadeModel.buscarPorId).mockResolvedValue(unidade as UnidadeDoBanco);

const gestorNoBanco = (perfil: Perfil, ativo = true) =>
  vi.mocked(usuarioModel.buscarPorId).mockResolvedValue({
    id: 5,
    nome: 'Gestor',
    email: 'gestor@exemplo.com',
    tipo_usuario: perfil,
    perfil,
    ativo,
  } as UsuarioDoBanco);

const autenticarComo = (perfil: Perfil) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id: 1,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

beforeEach(() => {
  vi.clearAllMocks();
  unidadeNoBanco(UNIDADES.SVO);
  gestorNoBanco(PERFIS.GESTOR_SVO);
  autenticarComo(PERFIS.ADMINISTRADOR);
});

describe('Unidades que cada perfil pode gerir', () => {
  it('Gestor de Frota gere todas as unidades', () => {
    expect(unidadesQuePodeGerir(PERFIS.GESTOR_FROTA)).toEqual(['SVO', 'HEMOSE', 'LACEN']);
  });

  it('Gestor SVO gere apenas o SVO', () => {
    expect(unidadesQuePodeGerir(PERFIS.GESTOR_SVO)).toEqual(['SVO']);
  });

  it('demais perfis não gerem unidades', () => {
    expect(unidadesQuePodeGerir(PERFIS.SOLICITANTE)).toEqual([]);
    expect(unidadesQuePodeGerir(PERFIS.ADMINISTRADOR)).toEqual([]);
  });
});

describe('unidadeService.associarGestor', () => {
  it('deve associar Gestor SVO à unidade SVO e registrar auditoria', async () => {
    await expect(unidadeService.associarGestor(1, 5, 1)).resolves.toMatchObject({ id: 1 });

    expect(unidadeModel.associar).toHaveBeenCalledWith(1, 5, 'trx');
    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'ASSOCIOU_GESTOR_UNIDADE unidade=SVO gestor=5', modulo: 'UNIDADES' }),
      'trx'
    );
  });

  it('deve associar Gestor de Frota a unidade administrativa', async () => {
    unidadeNoBanco(UNIDADES.HEMOSE);
    gestorNoBanco(PERFIS.GESTOR_FROTA);

    await expect(unidadeService.associarGestor(2, 5, 1)).resolves.toBeDefined();
  });

  it('não deve associar Gestor SVO ao HEMOSE', async () => {
    unidadeNoBanco(UNIDADES.HEMOSE);

    await expect(unidadeService.associarGestor(2, 5, 1)).rejects.toMatchObject({
      statusCode: 400,
      message: 'O perfil GESTOR_SVO não pode gerir a unidade HEMOSE',
    });
    expect(unidadeModel.associar).not.toHaveBeenCalled();
  });

  it('não deve associar usuário que não é gestor', async () => {
    gestorNoBanco(PERFIS.SOLICITANTE);

    await expect(unidadeService.associarGestor(1, 5, 1)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('não deve associar usuário inativo', async () => {
    gestorNoBanco(PERFIS.GESTOR_SVO, false);

    await expect(unidadeService.associarGestor(1, 5, 1)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('deve retornar 404 para unidade ou usuário inexistente', async () => {
    unidadeNoBanco(undefined);
    await expect(unidadeService.associarGestor(9, 5, 1)).rejects.toMatchObject({ statusCode: 404 });

    unidadeNoBanco(UNIDADES.SVO);
    vi.mocked(usuarioModel.buscarPorId).mockResolvedValue(undefined);
    await expect(unidadeService.associarGestor(1, 99, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deve retornar 409 para associação repetida', async () => {
    vi.mocked(unidadeModel.estaAssociado).mockResolvedValueOnce(true);

    await expect(unidadeService.associarGestor(1, 5, 1)).rejects.toMatchObject({ statusCode: 409 });
    expect(unidadeModel.associar).not.toHaveBeenCalled();
  });

  it('deve retornar 409 quando a associação simultânea violar a chave', async () => {
    vi.mocked(unidadeModel.associar).mockRejectedValueOnce(Object.assign(new Error('duplicada'), { code: '23505' }));

    await expect(unidadeService.associarGestor(1, 5, 1)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('unidadeService.removerGestor', () => {
  it('deve remover a associação e registrar auditoria', async () => {
    await unidadeService.removerGestor(1, 5, 1);

    expect(unidadeModel.desassociar).toHaveBeenCalledWith(1, 5, 'trx');
    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'REMOVEU_GESTOR_UNIDADE unidade=SVO gestor=5' }),
      'trx'
    );
  });

  it('deve retornar 404 quando o gestor não estiver associado', async () => {
    vi.mocked(unidadeModel.desassociar).mockResolvedValueOnce(false);

    await expect(unidadeService.removerGestor(1, 5, 1)).rejects.toMatchObject({ statusCode: 404 });
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });
});

describe('Rotas /api/unidades', () => {
  const token = 'Bearer token-teste';

  it('GET deve listar as unidades com os gestores', async () => {
    const resposta = await request(app).get('/api/unidades').set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(unidadeModel.listarComGestores).toHaveBeenCalled();
  });

  it('deve retornar 403 para quem não é administrador', async () => {
    autenticarComo(PERFIS.GESTOR_FROTA);

    const resposta = await request(app).get('/api/unidades').set('Authorization', token);

    expect(resposta.status).toBe(403);
  });

  it('POST deve associar e retornar 201', async () => {
    const resposta = await request(app)
      .post('/api/unidades/1/gestores')
      .set('Authorization', token)
      .send({ gestor_id: 5 });

    expect(resposta.status).toBe(201);
    expect(unidadeModel.associar).toHaveBeenCalledWith(1, 5, 'trx');
  });

  it('POST deve retornar 400 sem gestor_id', async () => {
    const resposta = await request(app).post('/api/unidades/1/gestores').set('Authorization', token).send({});

    expect(resposta.status).toBe(400);
    expect(unidadeModel.associar).not.toHaveBeenCalled();
  });

  it('DELETE deve remover e retornar 204', async () => {
    const resposta = await request(app).delete('/api/unidades/1/gestores/5').set('Authorization', token);

    expect(resposta.status).toBe(204);
  });

  it('DELETE deve retornar 400 para ID inválido', async () => {
    const resposta = await request(app).delete('/api/unidades/1/gestores/abc').set('Authorization', token);

    expect(resposta.status).toBe(400);
  });
});
