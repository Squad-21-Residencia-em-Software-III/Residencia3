import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { PERFIS, type Perfil } from '../constants/perfis';

vi.mock('../models/dashboardModel', () => ({
  dashboardModel: { indicadores: vi.fn() },
}));

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

import { app } from '../app';
import { authService } from '../services/authService';
import { dashboardModel } from '../models/dashboardModel';
import { dashboardService } from '../services/dashboardService';

const semRegistros = {
  solicitacoes_pendentes: 0,
  viagens_em_andamento: 0,
  veiculos_disponiveis: 0,
  veiculos_disponiveis_administrativa: 0,
  veiculos_disponiveis_svo: 0,
  veiculos_em_manutencao: 0,
  motoristas_cnh_vencida: 0,
};

const autenticarComo = (perfil: Perfil) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id: 1,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dashboardModel.indicadores).mockResolvedValue(semRegistros);
  autenticarComo(PERFIS.GESTOR_FROTA);
});

describe('dashboardService.consultar', () => {
  it('deve retornar zeros e período nulo quando não há registros', async () => {
    await expect(dashboardService.consultar({})).resolves.toEqual({
      periodo: { inicio: null, fim: null },
      solicitacoes_pendentes: 0,
      viagens_em_andamento: 0,
      veiculos_disponiveis: { total: 0, administrativa: 0, svo: 0 },
      alertas: { total: 0, veiculos_em_manutencao: 0, motoristas_cnh_vencida: 0 },
    });
  });

  it('deve montar os indicadores a partir das contagens do banco', async () => {
    vi.mocked(dashboardModel.indicadores).mockResolvedValueOnce({
      solicitacoes_pendentes: 3,
      viagens_em_andamento: 1,
      veiculos_disponiveis: 4,
      veiculos_disponiveis_administrativa: 3,
      veiculos_disponiveis_svo: 1,
      veiculos_em_manutencao: 2,
      motoristas_cnh_vencida: 1,
    });

    const dashboard = await dashboardService.consultar({ inicio: '2026-11-01', fim: '2026-11-30' });

    expect(dashboard).toEqual({
      periodo: { inicio: '2026-11-01', fim: '2026-11-30' },
      solicitacoes_pendentes: 3,
      viagens_em_andamento: 1,
      veiculos_disponiveis: { total: 4, administrativa: 3, svo: 1 },
      alertas: { total: 3, veiculos_em_manutencao: 2, motoristas_cnh_vencida: 1 },
    });
  });

  it('deve repassar o período e a data de hoje no formato AAAA-MM-DD', async () => {
    await dashboardService.consultar({ inicio: '2026-11-01' });

    expect(dashboardModel.indicadores).toHaveBeenCalledWith({
      inicio: '2026-11-01',
      hoje: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });
});

describe('GET /api/dashboard', () => {
  const token = 'Bearer token-teste';

  it('deve retornar 401 sem autenticação', async () => {
    const resposta = await request(app).get('/api/dashboard');

    expect(resposta.status).toBe(401);
  });

  it.each([PERFIS.SOLICITANTE, PERFIS.GESTOR_SVO, PERFIS.MOTORISTA_FROTA])('deve retornar 403 para %s', async (perfil) => {
    autenticarComo(perfil);

    const resposta = await request(app).get('/api/dashboard').set('Authorization', token);

    expect(resposta.status).toBe(403);
    expect(dashboardModel.indicadores).not.toHaveBeenCalled();
  });

  it.each([PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA])('deve retornar 200 para %s', async (perfil) => {
    autenticarComo(perfil);

    const resposta = await request(app).get('/api/dashboard').set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.body.alertas).toEqual({ total: 0, veiculos_em_manutencao: 0, motoristas_cnh_vencida: 0 });
  });

  it('deve aplicar o período informado', async () => {
    const resposta = await request(app)
      .get('/api/dashboard?inicio=2026-11-01&fim=2026-11-30')
      .set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.body.periodo).toEqual({ inicio: '2026-11-01', fim: '2026-11-30' });
    expect(dashboardModel.indicadores).toHaveBeenCalledWith(
      expect.objectContaining({ inicio: '2026-11-01', fim: '2026-11-30' })
    );
  });

  it('deve aceitar o mesmo dia como início e fim', async () => {
    const resposta = await request(app)
      .get('/api/dashboard?inicio=2026-11-05&fim=2026-11-05')
      .set('Authorization', token);

    expect(resposta.status).toBe(200);
  });

  it('deve retornar 400 para data inválida', async () => {
    const resposta = await request(app).get('/api/dashboard?inicio=05/11/2026').set('Authorization', token);

    expect(resposta.status).toBe(400);
    expect(dashboardModel.indicadores).not.toHaveBeenCalled();
  });

  it('deve retornar 400 quando o início for posterior ao fim', async () => {
    const resposta = await request(app)
      .get('/api/dashboard?inicio=2026-12-01&fim=2026-11-01')
      .set('Authorization', token);

    expect(resposta.status).toBe(400);
    expect(dashboardModel.indicadores).not.toHaveBeenCalled();
  });
});
