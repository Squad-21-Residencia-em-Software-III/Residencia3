import { beforeEach, describe, expect, it, vi } from 'vitest';
import { multasApi } from './multasApi';
import { documentosApi } from './documentosApi';

describe('multasApi e documentosApi', () => {
  const fetchMock = vi.fn();
  globalThis.fetch = fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('multasApi', () => {
    it('deve buscar listagem de multas via GET /api/multas', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 1, valor: 195.23 }],
      });

      const multas = await multasApi.listar();
      expect(multas).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('/api/multas') }),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('deve cadastrar uma multa via POST /api/multas', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 4, valor: 293.47 }),
      });

      const criada = await multasApi.criar({
        veiculo_id: 2,
        data_infracao: '2026-11-09T14:00',
        valor: 293.47,
        pontos: 7,
        status_pagamento: 'PENDENTE',
      });

      expect(criada.id).toBe(4);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('/api/multas') }),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"valor":293.47'),
        }),
      );
    });
  });

  describe('documentosApi', () => {
    it('deve buscar vencimentos de documentos via GET /api/documentos/vencimentos', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ id: 1, status_vencimento: 'PROXIMO_VENCIMENTO' }],
      });

      const docs = await documentosApi.listarVencimentos();
      expect(docs).toHaveLength(1);
      expect(docs[0].status_vencimento).toBe('PROXIMO_VENCIMENTO');
    });
  });
});
