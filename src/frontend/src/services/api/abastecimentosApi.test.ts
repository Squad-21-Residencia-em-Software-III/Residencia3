import { beforeEach, describe, expect, it, vi } from 'vitest';
import { abastecimentosApi } from './abastecimentosApi';

describe('abastecimentosApi', () => {
  const fetchMock = vi.fn();
  globalThis.fetch = fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve sanitizar o payload ao criar abastecimento', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 10, quilometragem: 50000, litros: 40 }),
    });

    await abastecimentosApi.criar({
      veiculo_id: 1,
      motorista_id: 2,
      data_abastecimento: '2026-11-08T10:00:00Z',
      quilometragem: 50000.4,
      litros: 40.2,
      valor_total: 240,
      posto_combustivel: '  Posto Shell  ',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('/api/abastecimentos'),
      }),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          veiculo_id: 1,
          motorista_id: 2,
          data_abastecimento: '2026-11-08',
          quilometragem: 50000,
          litros: 40.2,
          valor_total: 240,
          posto_combustivel: 'Posto Shell',
        }),
      }),
    );
  });
});

