import { beforeEach, describe, expect, it, vi } from 'vitest';
import { equipesSvoApi } from './equipesSvoApi';
import { solicitacoesSvoApi } from './solicitacoesSvoApi';
import { periodoConsultaEquipes } from '../../utils/periodoEquipesSvo';

const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

describe('equipesSvoApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consulta GET /api/equipes-svo/disponibilidade com inicio e fim', async () => {
    const corpo = {
      periodo: { inicio: '2026-11-13T21:00:00.000Z', fim: '2026-11-13T22:00:00.000Z' },
      equipes: [{ id: 1, nome_equipe: 'Equipe Alfa' }],
    };
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => corpo });

    const resposta = await equipesSvoApi.listarDisponiveis({
      inicio: '2026-11-13T21:00:00.000Z',
      fim: '2026-11-13T22:00:00.000Z',
    });

    expect(resposta.equipes).toEqual([{ id: 1, nome_equipe: 'Equipe Alfa' }]);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.pathname).toBe('/api/equipes-svo/disponibilidade');
    expect(url.searchParams.get('inicio')).toBe('2026-11-13T21:00:00.000Z');
    expect(url.searchParams.get('fim')).toBe('2026-11-13T22:00:00.000Z');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' });
  });
});

describe('periodoConsultaEquipes', () => {
  it('vai de agora até uma hora depois, em ISO 8601 com fuso', () => {
    const periodo = periodoConsultaEquipes(new Date('2026-11-13T21:00:00.000Z'));

    expect(periodo).toEqual({ inicio: '2026-11-13T21:00:00.000Z', fim: '2026-11-13T22:00:00.000Z' });
  });
});

describe('solicitacoesSvoApi.listarTodas', () => {
  const pagina = (ids: number[], numero: number, totalPaginas: number) => ({
    ok: true,
    status: 200,
    json: async () => ({
      dados: ids.map((id) => ({ id, status: 'CONFIRMADA' })),
      paginacao: { pagina: numero, limite: 100, total: 3, totalPaginas },
    }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('percorre todas as páginas com o status pedido', async () => {
    fetchMock.mockResolvedValueOnce(pagina([1, 2], 1, 2)).mockResolvedValueOnce(pagina([3], 2, 2));

    const todas = await solicitacoesSvoApi.listarTodas('CONFIRMADA');

    expect(todas.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const segunda = fetchMock.mock.calls[1][0] as URL;
    expect(segunda.searchParams.get('pagina')).toBe('2');
    expect(segunda.searchParams.get('limite')).toBe('100');
    expect(segunda.searchParams.get('status')).toBe('CONFIRMADA');
  });

  it('falha de forma explícita ao atingir o limite de páginas, sem devolver lista incompleta', async () => {
    fetchMock.mockResolvedValue(pagina([1], 1, 51));

    await expect(solicitacoesSvoApi.listarTodas('CONFIRMADA')).rejects.toThrow(/mais de 5000 solicitações SVO/);
    expect(fetchMock).toHaveBeenCalledTimes(50);
  });
});
