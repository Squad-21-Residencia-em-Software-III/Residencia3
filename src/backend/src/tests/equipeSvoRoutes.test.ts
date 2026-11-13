
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { app } from '../app';
import { authService } from '../services/authService';
import { equipeSvoService } from '../services/equipeSvoService';
import { PERFIS } from '../constants/perfis';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/equipeSvoService', () => ({
  equipeSvoService: {
    consultarDisponibilidade: vi.fn(),
  },
}));

describe('GET /api/equipes-svo/disponibilidade', () => {
  const endpoint =
    '/api/equipes-svo/disponibilidade';

  const parametros = {
    inicio: '2026-11-13T08:00:00-03:00',
    fim: '2026-11-13T18:00:00-03:00',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(authService.usuarioDoToken).mockResolvedValue({
      id: 1,
      perfil: PERFIS.GESTOR_SVO,
    } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

    vi.mocked(equipeSvoService.consultarDisponibilidade).mockResolvedValue({
      periodo: {
        inicio: new Date(parametros.inicio),
        fim: new Date(parametros.fim),
      },
      equipes: [
        { id: 1, nome_equipe: 'Equipe Alfa' },
      ],
    });
  });

  it('permite consulta ao Gestor SVO', async () => {
    const resposta = await request(app)
      .get(endpoint)
      .query(parametros)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(200);
    expect(resposta.body.equipes).toHaveLength(1);
    expect(resposta.body.equipes[0].nome_equipe).toBe('Equipe Alfa');
    expect(equipeSvoService.consultarDisponibilidade)
      .toHaveBeenCalledWith(parametros);
  });

  it('permite consulta ao Administrador', async () => {
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({
      id: 2,
      perfil: PERFIS.ADMINISTRADOR,
    } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

    const resposta = await request(app)
      .get(endpoint)
      .query(parametros)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(200);
  });

  it('retorna 401 sem autenticação', async () => {
    const resposta = await request(app)
      .get(endpoint)
      .query(parametros);

    expect(resposta.status).toBe(401);
  });

  it('retorna 403 para perfil sem permissão', async () => {
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({
      id: 3,
      perfil: PERFIS.SOLICITANTE,
    } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

    const resposta = await request(app)
      .get(endpoint)
      .query(parametros)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(403);
  });

  it('retorna 400 para período inválido', async () => {
    const resposta = await request(app)
      .get(endpoint)
      .query({
        inicio: '2026-11-13T18:00:00-03:00',
        fim: '2026-11-13T08:00:00-03:00',
      })
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(400);
    expect(equipeSvoService.consultarDisponibilidade)
      .not.toHaveBeenCalled();
  });
});
