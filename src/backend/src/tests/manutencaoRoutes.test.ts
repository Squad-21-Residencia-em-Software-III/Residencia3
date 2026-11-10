import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { PERFIS, type Perfil } from '../constants/perfis';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/manutencaoService', () => ({
  manutencaoService: {
    criar: vi.fn(),
    atualizar: vi.fn(),
    atualizarStatus: vi.fn(),
    excluir: vi.fn(),
    listarPorVeiculo: vi.fn(),
  },
}));

import { app } from '../app';
import { authService } from '../services/authService';
import { manutencaoService } from '../services/manutencaoService';

const autenticarComo = (perfil: Perfil, id = 1) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

describe('Rotas de Manutenções (/api/manutencoes)', () => {
  const token = 'Bearer token-teste';

  beforeEach(() => {
    vi.clearAllMocks();
    autenticarComo(PERFIS.GESTOR_FROTA);
  });

  describe('POST /api/manutencoes', () => {
    const manutencaoValida = {
      veiculo_id: 1,
      tipo_manutencao: 'PREVENTIVA' as const,
      data_manutencao: '2026-11-10',
      descricao: 'Troca de óleo e filtros',
      custo: 350.0,
      status: 'EM_ANDAMENTO' as const,
    };

    it('deve cadastrar manutenção e retornar 201', async () => {
      vi.mocked(manutencaoService.criar).mockResolvedValueOnce({
        id: 5,
        ...manutencaoValida,
      });

      const resposta = await request(app)
        .post('/api/manutencoes')
        .set('Authorization', token)
        .send(manutencaoValida);

      expect(resposta.status).toBe(201);
      expect(resposta.headers.location).toBe('/api/manutencoes/5');
      expect(manutencaoService.criar).toHaveBeenCalledWith(manutencaoValida, 1);
    });

    it('deve retornar 403 para perfil Solicitante', async () => {
      autenticarComo(PERFIS.SOLICITANTE);

      const resposta = await request(app)
        .post('/api/manutencoes')
        .set('Authorization', token)
        .send(manutencaoValida);

      expect(resposta.status).toBe(403);
    });
  });

  describe('PUT /api/manutencoes/:id', () => {
    it('deve atualizar manutenção e retornar 200', async () => {
      vi.mocked(manutencaoService.atualizar).mockResolvedValueOnce({
        id: 5,
        veiculo_id: 1,
        tipo_manutencao: 'CORRETIVA',
        data_manutencao: '2026-11-12',
        descricao: 'Substituição da embreagem',
        custo: 1200.0,
        status: 'EM_ANDAMENTO',
      });

      const resposta = await request(app)
        .put('/api/manutencoes/5')
        .set('Authorization', token)
        .send({ custo: 1200.0, descricao: 'Substituição da embreagem' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.custo).toBe(1200.0);
      expect(manutencaoService.atualizar).toHaveBeenCalledWith(
        5,
        { custo: 1200.0, descricao: 'Substituição da embreagem' },
        1
      );
    });

    it('deve rejeitar corpo de requisição vazio', async () => {
      const resposta = await request(app)
        .put('/api/manutencoes/5')
        .set('Authorization', token)
        .send({});

      expect(resposta.status).toBe(400);
      expect(resposta.body.erro).toBe('Dados inválidos');
      expect(resposta.body.detalhes[0].mensagem).toContain('Ao menos um campo deve ser informado');
      expect(manutencaoService.atualizar).not.toHaveBeenCalled();
    });

    it('deve rejeitar tentativa de alterar veiculo_id nesta rota', async () => {
      const resposta = await request(app)
        .put('/api/manutencoes/5')
        .set('Authorization', token)
        .send({ veiculo_id: 2, custo: 500 });

      expect(resposta.status).toBe(400);
      expect(manutencaoService.atualizar).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/manutencoes/:id/status', () => {
    it('deve atualizar status da manutenção para CONCLUIDA', async () => {
      vi.mocked(manutencaoService.atualizarStatus).mockResolvedValueOnce({
        id: 5,
        veiculo_id: 1,
        tipo_manutencao: 'PREVENTIVA',
        data_manutencao: '2026-11-10',
        descricao: 'Troca de óleo',
        custo: 350.0,
        status: 'CONCLUIDA',
      });

      const resposta = await request(app)
        .patch('/api/manutencoes/5/status')
        .set('Authorization', token)
        .send({ status: 'CONCLUIDA' });

      expect(resposta.status).toBe(200);
      expect(manutencaoService.atualizarStatus).toHaveBeenCalledWith(5, 'CONCLUIDA', 1);
    });

    it('deve retornar 400 para status inválido', async () => {
      const resposta = await request(app)
        .patch('/api/manutencoes/5/status')
        .set('Authorization', token)
        .send({ status: 'INVALIDO' });

      expect(resposta.status).toBe(400);
    });
  });

  describe('DELETE /api/manutencoes/:id', () => {
    it('deve excluir manutenção e retornar 204', async () => {
      vi.mocked(manutencaoService.excluir).mockResolvedValueOnce(undefined);

      const resposta = await request(app)
        .delete('/api/manutencoes/5')
        .set('Authorization', token);

      expect(resposta.status).toBe(204);
      expect(manutencaoService.excluir).toHaveBeenCalledWith(5, 1);
    });
  });

  describe('GET /api/manutencoes/veiculo/:veiculoId', () => {
    it('deve listar histórico de manutenções de um veículo', async () => {
      vi.mocked(manutencaoService.listarPorVeiculo).mockResolvedValueOnce([
        {
          id: 5,
          veiculo_id: 1,
          tipo_manutencao: 'PREVENTIVA',
          data_manutencao: '2026-11-10',
          descricao: 'Troca de óleo',
          custo: 350.0,
          status: 'CONCLUIDA',
          veiculo_placa: 'IAI-2026',
          veiculo_modelo: 'Ambulância UTI Móvel',
        },
      ]);

      const resposta = await request(app)
        .get('/api/manutencoes/veiculo/1')
        .set('Authorization', token);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveLength(1);
      expect(resposta.body[0].veiculo_placa).toBe('IAI-2026');
      expect(manutencaoService.listarPorVeiculo).toHaveBeenCalledWith(1);
    });
  });
});
