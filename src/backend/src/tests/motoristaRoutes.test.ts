
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
  },
}));

const autenticarComo = (perfil: Perfil) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id: 3,
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
