import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { PERFIS, type Perfil } from '../constants/perfis';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/documentoService', () => ({
  documentoService: {
    listarVencimentos: vi.fn(),
  },
}));

import { app } from '../app';
import { authService } from '../services/authService';
import { documentoService } from '../services/documentoService';

const autenticarComo = (perfil: Perfil, id = 1) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

describe('Rotas de Documentos (/api/documentos)', () => {
  const token = 'Bearer token-teste';

  beforeEach(() => {
    vi.clearAllMocks();
    autenticarComo(PERFIS.GESTOR_FROTA);
  });

  describe('GET /api/documentos/vencimentos', () => {
    it('deve listar documentos e status de vencimento para o Gestor', async () => {
      vi.mocked(documentoService.listarVencimentos).mockResolvedValueOnce([
        {
          id: 1,
          entidade_tipo: 'MOTORISTA',
          entidade_id: 2,
          tipo_documento: 'CNH',
          data_vencimento: '2026-11-20',
          dias_para_vencimento: 12,
          status_vencimento: 'PROXIMO_VENCIMENTO',
        } as any,
        {
          id: 2,
          entidade_tipo: 'VEICULO',
          entidade_id: 1,
          tipo_documento: 'CRLV',
          data_vencimento: '2026-10-01',
          dias_para_vencimento: -38,
          status_vencimento: 'VENCIDO',
        } as any,
      ]);

      const resposta = await request(app).get('/api/documentos/vencimentos').set('Authorization', token);

      expect(resposta.status).toBe(200);
      expect(resposta.body).toHaveLength(2);
      expect(resposta.body[0].status_vencimento).toBe('PROXIMO_VENCIMENTO');
      expect(resposta.body[1].status_vencimento).toBe('VENCIDO');
      expect(documentoService.listarVencimentos).toHaveBeenCalled();
    });

    it('deve retornar 403 para perfil Solicitante', async () => {
      autenticarComo(PERFIS.SOLICITANTE);

      const resposta = await request(app).get('/api/documentos/vencimentos').set('Authorization', token);
      expect(resposta.status).toBe(403);
    });
  });
});

