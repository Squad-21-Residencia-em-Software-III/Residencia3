
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors/AppError';

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
  const AGORA = new Date('2026-11-13T08:00:00-03:00');

  const filtros = {
    inicio: '2026-11-13T07:59:30-03:00',
    fim: '2026-11-13T08:00:30-03:00',
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);

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
        'whereNot',
      ]) {
        query[metodo] = (...argumentos: unknown[]) => {
          consultas.push({ tabela, metodo, argumentos });
          return query;
        };
      }
      query.modify = (callback: (q: unknown) => void) => { callback(query); return query; };

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

  it('retorna equipes disponíveis na consulta operacional imediata', async () => {
    const resultado = await equipeSvoService.consultarDisponibilidade(filtros);

    expect(resultado.equipes).toEqual([
      { id: 1, nome_equipe: 'Equipe Alfa' },
    ]);

    expect(resultado.periodo.inicio).toEqual(new Date(filtros.inicio));
    expect(resultado.periodo.fim).toEqual(new Date(filtros.fim));
  });

  it('retorna lista vazia quando não há equipes disponíveis', async () => {
    mockDb.mockImplementation((tabela: string) => {
      const query: Record<string, any> = {};

      for (const metodo of [
        'select',
        'where',
        'whereIn',
        'whereRaw',
        'whereExists',
        'whereNotExists',
        'whereNot',
      ]) {
        query[metodo] = (...argumentos: unknown[]) => {
          consultas.push({ tabela, metodo, argumentos });
          return query;
        };
      }
      query.modify = (callback: (q: unknown) => void) => { callback(query); return query; };

      query.orderBy = vi.fn().mockResolvedValue([]);
      return query;
    });

    const resultado = await equipeSvoService.consultarDisponibilidade(filtros);

    expect(resultado.equipes).toEqual([]);
  });

  it('verifica se a escala cobre o período informado', async () => {
    await equipeSvoService.consultarDisponibilidade(filtros);

    expect(consultas).toContainEqual(
      expect.objectContaining({
        tabela: 'equipes_svo as e',
        metodo: 'whereExists',
      }),
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

  it('exclui equipes com ordens ativas', async () => {
    await equipeSvoService.consultarDisponibilidade(filtros);

    expect(consultas).toContainEqual({
      tabela: 'ordens_svo as o',
      metodo: 'whereIn',
      argumentos: ['o.status', ['ALOCADA', 'EM_DESLOCAMENTO']],
    });
  });

  it('aceita os limites exatos da janela técnica', async () => {
    const resultado = await equipeSvoService.consultarDisponibilidade({
      inicio: '2026-11-13T07:59:00-03:00',
      fim: '2026-11-13T08:01:00-03:00',
    });

    expect(resultado.equipes).toHaveLength(1);
  });

  it('aceita início futuro e consulta a disponibilidade para o período', async () => {
    const resultado = await equipeSvoService.consultarDisponibilidade({
      inicio: '2026-11-13T08:00:01-03:00',
      fim: '2026-11-13T08:00:30-03:00',
    });
    expect(resultado.equipes).toHaveLength(1);
  });

  it('rejeita intervalo inteiramente no passado', async () => {
    await expect(
      equipeSvoService.consultarDisponibilidade({
        inicio: '2026-11-13T07:59:00-03:00',
        fim: '2026-11-13T07:59:30-03:00',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(mockDb).not.toHaveBeenCalled();
  });

  it('rejeita início anterior ao limite permitido', async () => {
    await expect(
      equipeSvoService.consultarDisponibilidade({
        inicio: '2026-11-13T07:58:59-03:00',
        fim: '2026-11-13T08:00:30-03:00',
      }),
    ).rejects.toBeInstanceOf(AppError);

    expect(mockDb).not.toHaveBeenCalled();
  });

  it('aceita período futuro de longa duração', async () => {
    const resultado = await equipeSvoService.consultarDisponibilidade({
      inicio: '2026-11-13T08:00:00-03:00',
      fim: '2026-11-13T09:00:00-03:00',
    });
    expect(resultado.equipes).toHaveLength(1);
  });

  it('aceita período futuro acima da janela imediata', async () => {
    const resultado = await equipeSvoService.consultarDisponibilidade({
      inicio: '2026-11-13T08:00:00-03:00',
      fim: '2026-11-13T08:01:01-03:00',
    });
    expect(resultado.equipes).toHaveLength(1);
  });

  it('rejeita início igual ao término', async () => {
    await expect(
      equipeSvoService.consultarDisponibilidade({
        inicio: '2026-11-13T08:00:00-03:00',
        fim: '2026-11-13T08:00:00-03:00',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/Período inválido/i),
    });

    expect(mockDb).not.toHaveBeenCalled();
  });
});
