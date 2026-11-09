import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { PERFIS, type Perfil } from '../constants/perfis';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/multaService', () => ({
  multaService: {
    listar: vi.fn(),
    criar: vi.fn(),
    atualizar: vi.fn(),
    excluir: vi.fn(),
  },
}));

import { app } from '../app';
import { authService } from '../services/authService';
import { multaService } from '../services/multaService';

const autenticarComo = (perfil: Perfil, id = 1) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

describe('Rotas de Multas (/api/multas)', () => {
  const token = 'Bearer token-teste';

  beforeEach(() => {
    vi.clearAllMocks();
    autenticarComo(PERFIS.GESTOR_FROTA);
  });

  describe('GET /api/multas', () => {
    it('deve listar as multas cadastradas', async () => {
      vi.mocked(multaService.listar).mockResolvedValueOnce([
        {
          id: 1,
          veiculo_id: 1,
          motorista_id: 2,
          data_infracao: '2026-11-05T10:00:00Z',
          valor: 195.23,
          pontos: 5,
          status_pagamento: 'PENDENTE',
        },
      ]);

      const resposta = await request(app)
        .get('/api/multas')
        .set('Authorization', token);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveLength(1);
      expect(resposta.body[0].valor).toBe(195.23);
      expect(multaService.listar).toHaveBeenCalled();
    });

    it('deve bloquear acesso de perfil não autorizado', async () => {
      autenticarComo(PERFIS.MOTORISTA_FROTA);

      const resposta = await request(app)
        .get('/api/multas')
        .set('Authorization', token);

      expect(resposta.status).toBe(403);
    });
  });

  describe('POST /api/multas', () => {
    const multaValida = {
      veiculo_id: 1,
      motorista_id: 2,
      data_infracao: '2026-11-06T14:30:00Z',
      valor: 293.47,
      pontos: 7,
      status_pagamento: 'PENDENTE' as const,
      descricao: 'Avanço de sinal vermelho',
    };

    it('deve cadastrar nova infração e retornar 201', async () => {
      vi.mocked(multaService.criar).mockResolvedValueOnce({
        id: 10,
        ...multaValida,
      });

      const resposta = await request(app)
        .post('/api/multas')
        .set('Authorization', token)
        .send(multaValida);

      expect(resposta.status).toBe(201);
      expect(resposta.headers.location).toBe('/api/multas/10');
      expect(resposta.body.id).toBe(10);
      expect(multaService.criar).toHaveBeenCalledWith(multaValida, 1);
    });

    it('deve rejeitar multa com valor negativo', async () => {
      const resposta = await request(app)
        .post('/api/multas')
        .set('Authorization', token)
        .send({ ...multaValida, valor: -50 });

      expect(resposta.status).toBe(400);
    });
  });

  describe('PUT /api/multas/:id', () => {
    it('deve atualizar multa e retornar 200', async () => {
      vi.mocked(multaService.atualizar).mockResolvedValueOnce({
        id: 10,
        veiculo_id: 1,
        motorista_id: 3,
        data_infracao: '2026-11-06T14:30:00Z',
        valor: 293.47,
        pontos: 7,
        status_pagamento: 'PAGO',
      });

      const resposta = await request(app)
        .put('/api/multas/10')
        .set('Authorization', token)
        .send({ status_pagamento: 'PAGO', motorista_id: 3 });

      expect(resposta.status).toBe(200);
      expect(resposta.body.status_pagamento).toBe('PAGO');
      expect(multaService.atualizar).toHaveBeenCalledWith(
        10,
        { status_pagamento: 'PAGO', motorista_id: 3 },
        1
      );
    });
  });

  describe('DELETE /api/multas/:id', () => {
    it('deve excluir multa e retornar 204', async () => {
      vi.mocked(multaService.excluir).mockResolvedValueOnce(undefined);

      const resposta = await request(app)
        .delete('/api/multas/10')
        .set('Authorization', token);

      expect(resposta.status).toBe(204);
      expect(multaService.excluir).toHaveBeenCalledWith(10, 1);
    });
  });
});
