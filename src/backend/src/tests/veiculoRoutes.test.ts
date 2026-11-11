
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { app } from '../app';
import { authService } from '../services/authService';
import { veiculoService } from '../services/veiculoService';
import { PERFIS } from '../constants/perfis';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/veiculoService', () => ({
  veiculoService: {
    listar: vi.fn(),
    listarSvoDisponiveis: vi.fn(),
    listarOcupacaoSvo: vi.fn(),
    criar: vi.fn(),
  },
}));

describe('GET /api/veiculos/svo/ocupacao', () => {
  const endpoint = '/api/veiculos/svo/ocupacao';

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(authService.usuarioDoToken).mockResolvedValue({
      id: 3,
      perfil: PERFIS.GESTOR_SVO,
    } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

    vi.mocked(veiculoService.listarOcupacaoSvo).mockResolvedValue([
      {
        id: 1,
        placa: 'ABC1D23',
        modelo: 'Van SVO 1',
        capacidade_maxima: 4,
        status: 'DISPONIVEL',
        capacidade_utilizada: 0,
        vagas_disponiveis: 4,
      },
      {
        id: 2,
        placa: 'DEF4G56',
        modelo: 'Van SVO 2',
        capacidade_maxima: 4,
        status: 'RESERVADO',
        capacidade_utilizada: 2,
        vagas_disponiveis: 2,
      },
      {
        id: 3,
        placa: 'GHI7J89',
        modelo: 'Van SVO 3',
        capacidade_maxima: 4,
        status: 'RESERVADO',
        capacidade_utilizada: 4,
        vagas_disponiveis: 0,
      },
      {
        id: 4,
        placa: 'JKL1M23',
        modelo: 'Van SVO 4',
        capacidade_maxima: 4,
        status: 'MANUTENCAO',
        capacidade_utilizada: 0,
        vagas_disponiveis: 4,
      },
    ]);
  });

  it('deve retornar a ocupacao de todos os veiculos SVO', async () => {
    const resposta = await request(app)
      .get(endpoint)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toHaveLength(4);

    expect(resposta.body[0]).toMatchObject({
      capacidade_utilizada: 0,
      vagas_disponiveis: 4,
    });

    expect(resposta.body[1]).toMatchObject({
      capacidade_utilizada: 2,
      vagas_disponiveis: 2,
    });

    expect(resposta.body[2]).toMatchObject({
      capacidade_utilizada: 4,
      vagas_disponiveis: 0,
    });
    expect(resposta.body[3]).toMatchObject({
        status: 'MANUTENCAO',
        capacidade_utilizada: 0,
        vagas_disponiveis: 4,
    });

    expect(veiculoService.listarOcupacaoSvo).toHaveBeenCalledOnce();
  });

  it('deve retornar 401 sem autenticacao', async () => {
    const resposta = await request(app).get(endpoint);

    expect(resposta.status).toBe(401);
    expect(veiculoService.listarOcupacaoSvo).not.toHaveBeenCalled();
  });

  it('deve retornar 403 para usuario sem permissao', async () => {
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({
      id: 2,
      perfil: PERFIS.SOLICITANTE,
    } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

    const resposta = await request(app)
      .get(endpoint)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(403);
    expect(veiculoService.listarOcupacaoSvo).not.toHaveBeenCalled();
  });
});
