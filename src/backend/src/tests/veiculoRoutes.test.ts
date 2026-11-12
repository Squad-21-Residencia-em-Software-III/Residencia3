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
    listarOcupacaoSvo: vi.fn(),
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

describe('GET /api/veiculos/svo/ocupacao', () => {
  const endpoint = '/api/veiculos/svo/ocupacao';

  beforeEach(() => {
    autenticarComo(PERFIS.GESTOR_SVO, 3);

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
    autenticarComo(PERFIS.SOLICITANTE, 2);

    const resposta = await request(app)
      .get(endpoint)
      .set('Authorization', 'Bearer token-teste');

    expect(resposta.status).toBe(403);
    expect(veiculoService.listarOcupacaoSvo).not.toHaveBeenCalled();
  });
});
