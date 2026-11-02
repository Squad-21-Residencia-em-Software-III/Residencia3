
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors/AppError';

type RegistroConsulta = {
  tabela: string;
  metodo: string;
  argumentos: unknown[];
};

const { mockDb, consultas } = vi.hoisted(() => {
  const db = Object.assign(vi.fn(), {
    raw: vi.fn(),
  });

  return {
    mockDb: db,
    consultas: [] as RegistroConsulta[],
  };
});

vi.mock('../config/database', () => ({
  db: mockDb,
}));

import { disponibilidadeService } from '../services/disponibilidadeService';

describe('disponibilidadeService.consultar', () => {
  const solicitacao = {
    id: 1,
    data_saida_desejada: '2026-11-10T08:00:00-03:00',
    data_chegada_desejada: '2026-11-10T17:00:00-03:00',
  };

  const registrar = (
    tabela: string,
    metodo: string,
    argumentos: unknown[]
  ) => {
    consultas.push({ tabela, metodo, argumentos });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consultas.length = 0;

    mockDb.mockImplementation((tabela: string) => {
      const query: Record<string, any> = {};

      for (const metodo of [
        'select',
        'where',
        'whereNotIn',
        'whereIn',
        'whereRaw',
        'from',
        'join',
      ]) {
        query[metodo] = (...argumentos: unknown[]) => {
          registrar(tabela, metodo, argumentos);
          return query;
        };
      }

      query.whereNotExists = (callback: Function) => {
        registrar(tabela, 'whereNotExists', []);

        const subquery: Record<string, any> = {};

        for (const metodo of [
          'select',
          'from',
          'join',
          'whereRaw',
          'whereIn',
          'where',
        ]) {
          subquery[metodo] = (...argumentos: unknown[]) => {
            registrar(tabela, metodo, argumentos);
            return subquery;
          };
        }

        callback.call(subquery);
        return query;
      };

      query.first = vi.fn().mockResolvedValue(solicitacao);
      query.orderBy = vi.fn().mockResolvedValue([]);

      return query;
    });

    mockDb.raw.mockReturnValue('1');
  });

  it('deve rejeitar ID inválido', async () => {
    await expect(
      disponibilidadeService.consultar(0)
    ).rejects.toBeInstanceOf(AppError);

    expect(mockDb).not.toHaveBeenCalled();
  });

  it('deve rejeitar solicitação inexistente', async () => {
    mockDb.mockImplementationOnce(() => ({
      where: () => ({
        first: async () => undefined,
      }),
    }));

    await expect(
      disponibilidadeService.consultar(999)
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('deve rejeitar solicitação sem data de chegada', async () => {
    mockDb.mockImplementationOnce(() => ({
      where: () => ({
        first: async () => ({
          ...solicitacao,
          data_chegada_desejada: null,
        }),
      }),
    }));

    await expect(
      disponibilidadeService.consultar(1)
    ).rejects.toBeInstanceOf(AppError);
  });

  it('deve rejeitar período inválido', async () => {
    mockDb.mockImplementationOnce(() => ({
      where: () => ({
        first: async () => ({
          ...solicitacao,
          data_chegada_desejada: '2026-11-09T17:00:00-03:00',
        }),
      }),
    }));

    await expect(
      disponibilidadeService.consultar(1)
    ).rejects.toBeInstanceOf(AppError);
  });

  it('deve retornar as listas de recursos disponíveis', async () => {
    const resultado = await disponibilidadeService.consultar(1);

    expect(resultado.solicitacao_id).toBe(1);
    expect(resultado.veiculos_disponiveis).toEqual([]);
    expect(resultado.motoristas_disponiveis).toEqual([]);
  });

  it('deve consultar apenas veículos da frota administrativa', async () => {
    await disponibilidadeService.consultar(1);

    expect(consultas).toContainEqual({
      tabela: 'veiculos as v',
      metodo: 'where',
      argumentos: ['v.tipo_frota', 'ADMINISTRATIVA'],
    });
  });

  it('deve verificar conflitos de veículos com viagens ativas', async () => {
    await disponibilidadeService.consultar(1);

    const registros = consultas.filter(
      (item) => item.tabela === 'veiculos as v'
    );

    expect(registros).toContainEqual({
      tabela: 'veiculos as v',
      metodo: 'whereRaw',
      argumentos: ['vf.veiculo_id = v.id'],
    });

    expect(registros).toContainEqual({
      tabela: 'veiculos as v',
      metodo: 'whereIn',
      argumentos: [
        'vf.status',
        ['AGENDADA', 'EM_ANDAMENTO'],
      ],
    });
  });

  it('deve verificar conflitos de motoristas com viagens ativas', async () => {
    await disponibilidadeService.consultar(1);

    const registros = consultas.filter(
      (item) => item.tabela === 'motoristas as m'
    );

    expect(registros).toContainEqual({
      tabela: 'motoristas as m',
      metodo: 'whereRaw',
      argumentos: ['vf.motorista_id = m.id'],
    });

    expect(registros).toContainEqual({
      tabela: 'motoristas as m',
      metodo: 'whereIn',
      argumentos: [
        'vf.status',
        ['AGENDADA', 'EM_ANDAMENTO'],
      ],
    });
  });

  it('deve verificar sobreposição dos períodos', async () => {
    await disponibilidadeService.consultar(1);

    for (const tabela of ['veiculos as v', 'motoristas as m']) {
      const registros = consultas.filter(
        (item) => item.tabela === tabela
      );

      expect(registros).toContainEqual({
        tabela,
        metodo: 'where',
        argumentos: [
          'sv.data_saida_desejada',
          '<',
          new Date('2026-11-10T17:00:00-03:00'),
        ],
      });

      expect(registros).toContainEqual({
        tabela,
        metodo: 'where',
        argumentos: [
          'sv.data_chegada_desejada',
          '>',
          new Date('2026-11-10T08:00:00-03:00'),
        ],
      });
    }
  });

  it('deve validar a CNH até o dia de chegada', async () => {
    await disponibilidadeService.consultar(1);

    expect(consultas).toContainEqual({
      tabela: 'motoristas as m',
      metodo: 'where',
      argumentos: [
        'm.validade_cnh',
        '>=',
        '2026-11-10',
      ],
    });
  });
});
