
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { app } from '../app';
import { authService } from '../services/authService';
import { auditoriaService } from '../services/auditoriaService';
import { PERFIS } from '../constants/perfis';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/auditoriaService', () => ({
  auditoriaService: {
    listar: vi.fn(),
  },
}));

describe('GET /api/auditorias', () => {
  const endpoint = '/api/auditorias';

  beforeEach(() => {
    vi.clearAllMocks();

    // Simula um administrador autenticado
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({
      id: 1,
      perfil: PERFIS.ADMINISTRADOR,
    } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

    // Simula registros de auditoria existentes
    vi.mocked(auditoriaService.listar).mockResolvedValue({
      dados: [
        {
          id: 1,
          usuario_id: 1,
          acao: 'LOGIN',
          modulo: 'AUTENTICACAO',
          data_hora: new Date('2026-11-08T12:00:00.000Z'),
        },
      ],
      paginacao: {
        pagina: 1,
        limite: 20,
        total: 1,
        totalPaginas: 1,
      },
    });
  });

  it('deve retornar 200 para o administrador', async () => {
    const resposta = await request(app)
      .get(endpoint)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].acao).toBe('LOGIN');
    expect(resposta.body.dados[0].modulo).toBe('AUTENTICACAO');

    expect(resposta.body.paginacao).toEqual({
      pagina: 1,
      limite: 20,
      total: 1,
      totalPaginas: 1,
    });

    expect(auditoriaService.listar).toHaveBeenCalledWith(1, 20);
  });

  it('deve permitir navegar entre páginas', async () => {
    vi.mocked(auditoriaService.listar).mockResolvedValue({
      dados: [
        {
          id: 21,
          usuario_id: 1,
          acao: 'ATUALIZOU_USUARIO',
          modulo: 'USUARIOS',
          data_hora: new Date('2026-11-08T13:00:00.000Z'),
        },
      ],
      paginacao: {
        pagina: 2,
        limite: 20,
        total: 21,
        totalPaginas: 2,
      },
    });

    const resposta = await request(app)
      .get(`${endpoint}?pagina=2&limite=20`)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(200);
    expect(auditoriaService.listar).toHaveBeenCalledWith(2, 20);
    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.paginacao).toEqual({
      pagina: 2,
      limite: 20,
      total: 21,
      totalPaginas: 2,
    });
  });

  it('deve rejeitar limite superior a 100 registros', async () => {
    const resposta = await request(app)
      .get(`${endpoint}?pagina=1&limite=101`)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(400);
    expect(auditoriaService.listar).not.toHaveBeenCalled();
  });

  it('deve retornar 401 sem autenticação', async () => {
    const resposta = await request(app).get(endpoint);

    expect(resposta.status).toBe(401);
    expect(auditoriaService.listar).not.toHaveBeenCalled();
  });

  it('deve retornar 403 para usuário sem permissão', async () => {
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({
      id: 3,
      perfil: PERFIS.GESTOR_FROTA,
    } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

    const resposta = await request(app)
      .get(endpoint)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(403);
    expect(auditoriaService.listar).not.toHaveBeenCalled();
  });

  it('deve retornar uma lista vazia quando não houver registros', async () => {
    vi.mocked(auditoriaService.listar).mockResolvedValue({
      dados: [],
      paginacao: {
        pagina: 1,
        limite: 20,
        total: 0,
        totalPaginas: 0,
      },
    });

    const resposta = await request(app)
      .get(endpoint)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados).toEqual([]);
    expect(resposta.body.paginacao.total).toBe(0);
    expect(resposta.body.paginacao.totalPaginas).toBe(0);
  });
});
