import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { PERFIS, type Perfil } from '../constants/perfis';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/veiculoService', () => ({
  veiculoService: {
    listar: vi.fn(),
    criar: vi.fn(),
    atualizar: vi.fn(),
    listarVeiculosSvoDisponiveis: vi.fn(),
  },
}));

import { app } from '../app';
import { authService } from '../services/authService';
import { veiculoService } from '../services/veiculoService';
import { AppError } from '../errors/AppError';

const autenticarComo = (perfil: Perfil, id = 1) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

describe('Rotas de Veículos (/api/veiculos)', () => {
  const token = 'Bearer token-teste';

  beforeEach(() => {
    vi.clearAllMocks();
    autenticarComo(PERFIS.GESTOR_FROTA);
  });

  describe('GET /api/veiculos', () => {
    it('deve permitir acesso para Motorista da Frota', async () => {
      autenticarComo(PERFIS.MOTORISTA_FROTA);
      vi.mocked(veiculoService.listar).mockResolvedValueOnce([
        {
          id: 1,
          placa: 'ABC1D23',
          modelo: 'Fiat Mobi',
          tipo_frota: 'ADMINISTRATIVA',
          capacidade_maxima: 4,
          km_atual: 45000,
          status: 'DISPONIVEL',
        },
      ]);

      const resposta = await request(app).get('/api/veiculos').set('Authorization', token);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveLength(1);
      expect(veiculoService.listar).toHaveBeenCalled();
    });

    it('deve retornar 403 para Solicitante', async () => {
      autenticarComo(PERFIS.SOLICITANTE);

      const resposta = await request(app).get('/api/veiculos').set('Authorization', token);

      expect(resposta.status).toBe(403);
    });
  });

  describe('PUT /api/veiculos/:id', () => {
    const atualizacaoValida = {
      modelo: 'Fiat Mobi Like 1.0',
      capacidade_maxima: 4,
      km_atual: 52000,
    };

    it('deve atualizar dados permitidos do veículo e retornar 200', async () => {
      vi.mocked(veiculoService.atualizar).mockResolvedValueOnce({
        id: 1,
        placa: 'ABC1D23',
        modelo: 'Fiat Mobi Like 1.0',
        tipo_frota: 'ADMINISTRATIVA',
        capacidade_maxima: 4,
        km_atual: 52000,
        status: 'DISPONIVEL',
      });

      const resposta = await request(app)
        .put('/api/veiculos/1')
        .set('Authorization', token)
        .send(atualizacaoValida);

      expect(resposta.status).toBe(200);
      expect(resposta.body.modelo).toBe('Fiat Mobi Like 1.0');
      expect(veiculoService.atualizar).toHaveBeenCalledWith(1, atualizacaoValida, 1);
    });

    it('deve rejeitar capacidade superior a 4 para frota SVO', async () => {
      const payloadInvalido = {
        tipo_frota: 'SVO',
        capacidade_maxima: 6,
      };

      const resposta = await request(app)
        .put('/api/veiculos/1')
        .set('Authorization', token)
        .send(payloadInvalido);

      expect(resposta.status).toBe(400);
      expect(resposta.body.erro).toBe('Dados inválidos');
      expect(resposta.body.detalhes[0].mensagem).toContain('SVO podem ter capacidade máxima de até 4');
      expect(veiculoService.atualizar).not.toHaveBeenCalled();
    });

    it('deve rejeitar corpo de requisição vazio', async () => {
      const resposta = await request(app)
        .put('/api/veiculos/1')
        .set('Authorization', token)
        .send({});

      expect(resposta.status).toBe(400);
      expect(resposta.body.erro).toBe('Dados inválidos');
      expect(resposta.body.detalhes[0].mensagem).toContain('Ao menos um campo deve ser informado');
      expect(veiculoService.atualizar).not.toHaveBeenCalled();
    });

    it('deve rejeitar tentativa de alteração de status via PUT comum', async () => {
      const resposta = await request(app)
        .put('/api/veiculos/1')
        .set('Authorization', token)
        .send({ status: 'MANUTENCAO' });

      expect(resposta.status).toBe(400);
      expect(veiculoService.atualizar).not.toHaveBeenCalled();
    });

    it('deve retornar 409 se a placa já estiver cadastrada para outro veículo', async () => {
      vi.mocked(veiculoService.atualizar).mockRejectedValueOnce(
        new AppError('Já existe um veículo cadastrado com essa placa', 409)
      );

      const resposta = await request(app)
        .put('/api/veiculos/1')
        .set('Authorization', token)
        .send({ placa: 'XYZ9A99' });

      expect(resposta.status).toBe(409);
      expect(resposta.body.erro).toContain('Já existe um veículo');
    });

    it('deve retornar 404 para veículo inexistente', async () => {
      vi.mocked(veiculoService.atualizar).mockRejectedValueOnce(
        new AppError('Veículo não encontrado', 404)
      );

      const resposta = await request(app)
        .put('/api/veiculos/999')
        .set('Authorization', token)
        .send({ modelo: 'Novo Modelo' });

      expect(resposta.status).toBe(404);
    });

    it('deve retornar 400 para ID inválido', async () => {
      const resposta = await request(app)
        .put('/api/veiculos/invalido')
        .set('Authorization', token)
        .send({ modelo: 'Novo Modelo' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.erro).toContain('ID do veículo inválido');
    });

    it('deve retornar 403 para perfil não autorizado', async () => {
      autenticarComo(PERFIS.SOLICITANTE);

      const resposta = await request(app)
        .put('/api/veiculos/1')
        .set('Authorization', token)
        .send(atualizacaoValida);

      expect(resposta.status).toBe(403);
      expect(veiculoService.atualizar).not.toHaveBeenCalled();
    });
  });
});
