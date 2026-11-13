
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  const filtros = {
    inicio: '2026-11-13T08:00:00-03:00',
    fim: '2026-11-13T18:00:00-03:00',
  };

  beforeEach(() => {
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

  it('retorna equipes disponíveis', async () => {
    const resultado =
      await equipeSvoService.consultarDisponibilidade(filtros);

    expect(resultado.equipes).toEqual([
      { id: 1, nome_equipe: 'Equipe Alfa' },
    ]);

    expect(resultado.periodo.inicio).toEqual(
      new Date(filtros.inicio)
    );

    expect(resultado.periodo.fim).toEqual(
      new Date(filtros.fim)
    );
  });

  it('verifica se a equipe possui escala no período', async () => {
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
      argumentos: [
        'es.data_inicio',
        '<=',
        new Date(filtros.inicio),
      ],
    });

    expect(consultas).toContainEqual({
      tabela: 'escalas_svo as es',
      metodo: 'where',
      argumentos: [
        'es.data_fim',
        '>=',
        new Date(filtros.fim),
      ],
    });
  });

  it('exclui equipes com ordens SVO ativas', async () => {
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
      argumentos: [
        'o.status',
        ['ALOCADA', 'EM_DESLOCAMENTO'],
      ],
    });
  });
});
