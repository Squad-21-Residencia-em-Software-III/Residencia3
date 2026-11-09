import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/abastecimentoService', () => ({
  abastecimentoService: {
    criar: vi.fn(),
    listarPorVeiculo: vi.fn(),
  },
}));

import { app } from '../app';
import { authService } from '../services/authService';
import { abastecimentoService } from '../services/abastecimentoService';

const autenticarComo = (perfil: Perfil, id = 1) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

describe('Rotas de Abastecimentos (/api/abastecimentos)', () => {
  const token = 'Bearer token-teste';

  beforeEach(() => {
    vi.clearAllMocks();
    autenticarComo(PERFIS.MOTORISTA_FROTA);
  });

  describe('POST /api/abastecimentos', () => {
    const abastecimentoValido = {
      veiculo_id: 1,
      motorista_id: 2,
      data_abastecimento: '2026-11-08',
      quilometragem: 45200,
      litros: 45.5,
      valor_total: 280.0,
      posto_combustivel: 'Posto Petrobras Central',
    };

    it('deve cadastrar abastecimento e retornar 201', async () => {
      vi.mocked(abastecimentoService.criar).mockResolvedValueOnce({
        id: 10,
        ...abastecimentoValido,
        preco_por_litro: 6.154,
      });

      const resposta = await request(app)
        .post('/api/abastecimentos')
        .set('Authorization', token)
        .send(abastecimentoValido);

      expect(resposta.status).toBe(201);
      expect(resposta.headers.location).toBe('/api/abastecimentos/10');
      expect(resposta.body).toMatchObject({ id: 10, preco_por_litro: 6.154 });
      expect(abastecimentoService.criar).toHaveBeenCalledWith(abastecimentoValido, 1);
    });

    it('deve rejeitar campos adicionais devido ao .strict() do Zod', async () => {
      const resposta = await request(app)
        .post('/api/abastecimentos')
        .set('Authorization', token)
        .send({ ...abastecimentoValido, campo_nao_permitido: 'teste' });

      expect(resposta.status).toBe(400);
      expect(abastecimentoService.criar).not.toHaveBeenCalled();
    });

    it('deve retornar 400 se o serviço acusar quilometragem decrescente', async () => {
      vi.mocked(abastecimentoService.criar).mockRejectedValueOnce(
        new AppError('A quilometragem não pode ser menor que a do último abastecimento do veículo', 400),
      );

      const resposta = await request(app)
        .post('/api/abastecimentos')
        .set('Authorization', token)
        .send(abastecimentoValido);

      expect(resposta.status).toBe(400);
      expect(resposta.body.erro).toContain('A quilometragem não pode ser menor');
    });
  });

  describe('GET /api/abastecimentos/veiculo/:veiculoId', () => {
    it('deve retornar lista de abastecimentos do veículo', async () => {
      vi.mocked(abastecimentoService.listarPorVeiculo).mockResolvedValueOnce([
        {
          id: 1,
          veiculo_id: 1,
          motorista_id: 2,
          data_abastecimento: '2026-11-01',
          quilometragem: 44000,
          litros: 40,
          valor_total: 240,
          posto_combustivel: 'Posto Shell',
          preco_por_litro: 6.0,
        },
      ]);

      const resposta = await request(app)
        .get('/api/abastecimentos/veiculo/1')
        .set('Authorization', token);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveLength(1);
      expect(resposta.body[0].preco_por_litro).toBe(6.0);
      expect(abastecimentoService.listarPorVeiculo).toHaveBeenCalledWith(1);
    });

    it('deve retornar 400 para ID de veículo inválido', async () => {
      const resposta = await request(app)
        .get('/api/abastecimentos/veiculo/abc')
        .set('Authorization', token);

      expect(resposta.status).toBe(400);
      expect(abastecimentoService.listarPorVeiculo).not.toHaveBeenCalled();
    });
  });
});
