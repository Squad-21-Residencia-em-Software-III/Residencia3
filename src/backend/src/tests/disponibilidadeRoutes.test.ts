
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { app } from '../app';
import { authService } from '../services/authService';
import { disponibilidadeService } from '../services/disponibilidadeService';
import { PERFIS } from '../constants/perfis';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/disponibilidadeService', () => ({
  disponibilidadeService: {
    consultar: vi.fn(),
  },
}));

describe('GET /api/solicitacoes-viagem/:id/disponibilidade', () => {
  const endpoint = '/api/solicitacoes-viagem/1/disponibilidade';

  beforeEach(() => {
    vi.clearAllMocks();

    // Simula um Gestor de Frota autenticado
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({
      id: 3,
      perfil: PERFIS.GESTOR_FROTA,
    } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

    // Simula a resposta do serviço de disponibilidade
    vi.mocked(disponibilidadeService.consultar).mockResolvedValue({
      solicitacao_id: 1,
      periodo: {
        inicio: new Date('2026-11-10T11:00:00.000Z'),
        fim: new Date('2026-11-10T20:00:00.000Z'),
      },
      veiculos_disponiveis: [
        {
          id: 1,
          placa: 'ABC1D23',
          modelo: 'Fiat Mobi',
          capacidade_maxima: 4,
          status: 'DISPONIVEL',
        },
      ],
      motoristas_disponiveis: [
        {
          id: 1,
          usuario_id: 5,
          categoria_cnh: 'B',
          validade_cnh: '2030-12-31',
          status: 'DISPONIVEL',
        },
      ],
    });
  });

  it('deve retornar 200 para o Gestor de Frota', async () => {
    const resposta = await request(app)
      .get(endpoint)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(200);
    expect(resposta.body.solicitacao_id).toBe(1);
    expect(resposta.body.veiculos_disponiveis).toHaveLength(1);
    expect(resposta.body.motoristas_disponiveis).toHaveLength(1);

    expect(disponibilidadeService.consultar).toHaveBeenCalledWith(1);
  });

  it('deve retornar 401 sem autenticação', async () => {
    const resposta = await request(app).get(endpoint);

    expect(resposta.status).toBe(401);
    expect(disponibilidadeService.consultar).not.toHaveBeenCalled();
  });

  it('deve retornar 403 para usuário sem permissão', async () => {
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({
      id: 2,
      perfil: PERFIS.SOLICITANTE,
    } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

    const resposta = await request(app)
      .get(endpoint)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(403);
    expect(disponibilidadeService.consultar).not.toHaveBeenCalled();
  });

  it('deve retornar 400 para ID inválido', async () => {
    const resposta = await request(app)
      .get('/api/solicitacoes-viagem/abc/disponibilidade')
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(400);
    expect(disponibilidadeService.consultar).not.toHaveBeenCalled();
  });
});
