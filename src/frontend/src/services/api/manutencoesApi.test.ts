import { beforeEach, describe, expect, it, vi } from 'vitest';
import { manutencoesApi } from './manutencoesApi';

describe('manutencoesApi', () => {
  const fetchMock = vi.fn();
  globalThis.fetch = fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve atualizar status da manutenção para CONCLUIDA', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 5, status: 'CONCLUIDA' }),
    });

    await manutencoesApi.atualizarStatus(5, 'CONCLUIDA');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('/api/manutencoes/5/status'),
      }),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'CONCLUIDA' }),
      }),
    );
  });

  it('deve excluir manutenção via DELETE', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => ({}),
    });

    await manutencoesApi.excluir(5);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('/api/manutencoes/5'),
      }),
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });
});
