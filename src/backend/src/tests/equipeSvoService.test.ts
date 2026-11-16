import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, consultas } = vi.hoisted(() => ({
  mockDb: Object.assign(vi.fn(), {
    raw: vi.fn(),
  }),
  consultas: [] as {
    tabela: string;
    metodo: string;
    argumentos: unknown[];
  }[],
}));

vi.mock('../config/database', () => ({
  db: mockDb,
}));

import { equipeSvoService } from '../services/equipeSvoService';

describe('equipeSvoService.consultarDisponibilidade', () => {
  const AGORA_OPERACIONAL = new Date('2026-11-13T08:00:00-03:00');

  const filtros = {
    inicio: '2026-11-13T08:00:00-03:00',
    fim: '2026-11-13T18:00:00-03:00',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA_OPERACIONAL);

    vi.clearAllMocks();
    consultas.length = 0;

    mockDb.mockImplementation((tabela: string) => {
      const query: Record<string, any> = {};

      for (const metodo of [
        'select',
        'where',
        'whereIn',
        'whereRaw',
        'whereExists',
        'whereNotExists',
      ]) {
        query[metodo] = (...argumentos: unknown[]) => {
          consultas.push({ tabela, metodo, argumentos });
          return query;
        };
      }

      query.orderBy = vi.fn().mockResolvedValue([
        { id: 1, nome_equipe: 'Equipe Alfa' },
      ]);

      return query;
    });

    mockDb.raw.mockReturnValue('1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna equipes disponíveis com escala válida e sem ordem ativa', async () => {
    const resultado =
      await equipeSvoService.consultarDisponibilidade(filtros);

    expect(resultado.equipes).toEqual([
      { id: 1, nome_equipe: 'Equipe Alfa' },
    ]);

    expect(resultado.periodo.inicio).toEqual(new Date(filtros.inicio));
    expect(resultado.periodo.fim).toEqual(new Date(filtros.fim));
  });

  it('retorna lista vazia quando não há equipes com escala no período', async () => {
    mockDb.mockImplementation((tabela: string) => {
      const query: Record<string, any> = {};
      for (const metodo of [
        'select',
        'where',
        'whereIn',
        'whereRaw',
        'whereExists',
        'whereNotExists',
      ]) {
        query[metodo] = (...argumentos: unknown[]) => {
          consultas.push({ tabela, metodo, argumentos });
          return query;
        };
      }
      query.orderBy = vi.fn().mockResolvedValue([]);
      return query;
    });

    const resultado =
      await equipeSvoService.consultarDisponibilidade(filtros);

    expect(resultado.equipes).toEqual([]);
  });

  it('verifica se a equipe possui escala cobrindo todo o período solicitado', async () => {
    await equipeSvoService.consultarDisponibilidade(filtros);

    expect(consultas).toContainEqual(
      expect.objectContaining({
        tabela: 'equipes_svo as e',
        metodo: 'whereExists',
      })
    );

    expect(consultas).toContainEqual({
      tabela: 'escalas_svo as es',
      metodo: 'where',
      argumentos: ['es.data_inicio', '<=', new Date(filtros.inicio)],
    });

    expect(consultas).toContainEqual({
      tabela: 'escalas_svo as es',
      metodo: 'where',
      argumentos: ['es.data_fim', '>=', new Date(filtros.fim)],
    });
  });

  it('exclui apenas equipes com ordens SVO ativas (ALOCADA ou EM_DESLOCAMENTO), não bloqueando CONCLUIDA ou CANCELADA', async () => {
    await equipeSvoService.consultarDisponibilidade(filtros);

    expect(consultas).toContainEqual(
      expect.objectContaining({
        tabela: 'equipes_svo as e',
        metodo: 'whereNotExists',
      })
    );

    expect(consultas).toContainEqual({
      tabela: 'ordens_svo as o',
      metodo: 'whereIn',
      argumentos: ['o.status', ['ALOCADA', 'EM_DESLOCAMENTO']],
    });
  });

  it('rejeita consulta para período futuro fora do contrato operacional imediato', async () => {
    const filtrosFuturos = {
      inicio: '2026-11-14T08:00:00-03:00',
      fim: '2026-11-14T18:00:00-03:00',
    };

    await expect(
      equipeSvoService.consultarDisponibilidade(filtrosFuturos)
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/Período não suportado/i),
    });

    expect(mockDb).not.toHaveBeenCalled();
  });

  it('rejeita consulta quando início é maior ou igual ao fim', async () => {
    const filtrosInvalidos = {
      inicio: '2026-11-13T08:00:00-03:00',
      fim: '2026-11-13T08:00:00-03:00',
    };

    await expect(
      equipeSvoService.consultarDisponibilidade(filtrosInvalidos)
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(mockDb).not.toHaveBeenCalled();
  });
});