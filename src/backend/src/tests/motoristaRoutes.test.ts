
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { app } from '../app';
import { authService } from '../services/authService';
import { motoristaService } from '../services/motoristaService';
import { PERFIS, type Perfil } from '../constants/perfis';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/motoristaService', () => ({
  motoristaService: {
    listar: vi.fn().mockResolvedValue([
      {
        id: 1,
        usuario_id: 5,
        nome: 'Max Verstappen',
        numero_cnh: '33333333333',
        categoria_cnh: 'B',
        validade_cnh: '2030-12-31',
        tipo_motorista: 'FROTA',
        status: 'DISPONIVEL',
      },
    ]),
    buscarPorUsuarioId: vi.fn(),
  },
}));

const autenticarComo = (perfil: Perfil, id = 3) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

describe('GET /api/motoristas', () => {
  const token = 'Bearer token-teste';

  beforeEach(() => {
    vi.clearAllMocks();
    autenticarComo(PERFIS.GESTOR_FROTA);
  });

  it('deve listar motoristas com nome e status', async () => {
    const resposta = await request(app).get('/api/motoristas').set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.body[0]).toMatchObject({ nome: 'Max Verstappen', status: 'DISPONIVEL' });
    expect(motoristaService.listar).toHaveBeenCalledWith({});
  });

  it('deve repassar os filtros de status e tipo', async () => {
    await request(app)
      .get('/api/motoristas?status=DISPONIVEL&tipo_motorista=FROTA')
      .set('Authorization', token);

    expect(motoristaService.listar).toHaveBeenCalledWith({ status: 'DISPONIVEL', tipo_motorista: 'FROTA' });
  });

  it('deve retornar 400 para status inválido', async () => {
    const resposta = await request(app).get('/api/motoristas?status=FERIAS').set('Authorization', token);

    expect(resposta.status).toBe(400);
    expect(motoristaService.listar).not.toHaveBeenCalled();
  });

  it('deve retornar 403 para motorista', async () => {
    autenticarComo(PERFIS.MOTORISTA_FROTA);

    const resposta = await request(app).get('/api/motoristas').set('Authorization', token);

    expect(resposta.status).toBe(403);
  });
});

describe('GET /api/motoristas/me', () => {
  const token = 'Bearer token-teste';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar os dados do motorista autenticado', async () => {
    autenticarComo(PERFIS.MOTORISTA_FROTA, 5);
    vi.mocked(motoristaService.buscarPorUsuarioId).mockResolvedValueOnce({
      id: 2,
      usuario_id: 5,
      nome: 'Lewis Hamilton',
      numero_cnh: '44444444444',
      categoria_cnh: 'D',
      validade_cnh: '2029-05-15',
      tipo_motorista: 'FROTA',
      status: 'DISPONIVEL',
    });

    const resposta = await request(app).get('/api/motoristas/me').set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ id: 2, nome: 'Lewis Hamilton' });
    expect(motoristaService.buscarPorUsuarioId).toHaveBeenCalledWith(5);
  });

  it('deve retornar 404 se o usuário autenticado não for um motorista cadastrado', async () => {
    autenticarComo(PERFIS.SOLICITANTE, 99);
    vi.mocked(motoristaService.buscarPorUsuarioId).mockResolvedValueOnce(undefined);

    const resposta = await request(app).get('/api/motoristas/me').set('Authorization', token);

    expect(resposta.status).toBe(404);
    expect(resposta.body.erro).toContain('Registro de motorista não encontrado');
  });
});
