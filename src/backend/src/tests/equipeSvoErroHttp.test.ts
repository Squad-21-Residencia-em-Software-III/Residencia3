
import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { authService } from '../services/authService';
import { PERFIS } from '../constants/perfis';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

describe('Disponibilidade SVO - tratamento HTTP real', () => {
  it('retorna HTTP 400 quando o serviço rejeita período encerrado', async () => {
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({
      id: 1,
      perfil: PERFIS.GESTOR_SVO,
    } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

    const inicio = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const fim = new Date(inicio.getTime() + 60_000);

    const resposta = await request(app)
      .get('/api/equipes-svo/disponibilidade')
      .query({
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      })
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({
      erro: 'Período não suportado: informe uma consulta atual ou futura.',
    });
  });
});
