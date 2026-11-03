
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

import {
  disponibilidadeService,
  periodoDaSolicitacao,
} from '../services/disponibilidadeService';

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

  const mockSolicitacao = (dados: object | undefined) => {
    mockDb.mockImplementationOnce(() => ({
      where: () => ({
        first: async () => dados,
      }),
    }));
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
        'whereNotExists',
        'join',
      ]) {
        query[metodo] = (...argumentos: unknown[]) => {
          registrar(tabela, metodo, argumentos);
          return query;
        };
      }

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
    mockSolicitacao(undefined);

    await expect(
      disponibilidadeService.consultar(999)
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('deve considerar o fim do dia da saída quando não há data de chegada', async () => {
    mockSolicitacao({
      ...solicitacao,
      data_saida_desejada: '2026-11-10T08:00:00',
      data_chegada_desejada: null,
    });

    const resultado = await disponibilidadeService.consultar(1);

    expect(resultado.periodo).toEqual({
      inicio: new Date('2026-11-10T08:00:00'),
      fim: new Date('2026-11-11T00:00:00'),
    });
  });

  it('deve rejeitar período inválido', async () => {
    mockSolicitacao({
      ...solicitacao,
      data_chegada_desejada: '2026-11-09T17:00:00-03:00',
    });

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

  it('deve bloquear por status apenas veículos em manutenção', async () => {
    await disponibilidadeService.consultar(1);

    expect(consultas).toContainEqual({
      tabela: 'veiculos as v',
      metodo: 'whereNotIn',
      argumentos: ['v.status', ['MANUTENCAO']],
    });
  });

  it('deve bloquear por status apenas motoristas inativos ou afastados', async () => {
    await disponibilidadeService.consultar(1);

    expect(consultas).toContainEqual({
      tabela: 'motoristas as m',
      metodo: 'whereNotIn',
      argumentos: ['m.status', ['INATIVO', 'AFASTADO']],
    });
  });

  it('deve verificar conflitos de veículos e motoristas com viagens ativas', async () => {
    await disponibilidadeService.consultar(1);

    for (const tabela of ['veiculos as v', 'motoristas as m']) {
      expect(consultas).toContainEqual(
        expect.objectContaining({ tabela, metodo: 'whereNotExists' })
      );
    }

    const subconsultas = consultas.filter(
      (item) => item.tabela === 'viagens_frota as vf'
    );

    expect(subconsultas).toContainEqual({
      tabela: 'viagens_frota as vf',
      metodo: 'whereRaw',
      argumentos: ['vf.veiculo_id = v.id'],
    });

    expect(subconsultas).toContainEqual({
      tabela: 'viagens_frota as vf',
      metodo: 'whereRaw',
      argumentos: ['vf.motorista_id = m.id'],
    });

    expect(subconsultas).toContainEqual({
      tabela: 'viagens_frota as vf',
      metodo: 'whereIn',
      argumentos: [
        'vf.status',
        ['AGENDADA', 'EM_ANDAMENTO'],
      ],
    });
  });

  it('deve verificar sobreposição dos períodos', async () => {
    await disponibilidadeService.consultar(1);

    const subconsultas = consultas.filter(
      (item) => item.tabela === 'viagens_frota as vf'
    );

    expect(subconsultas).toContainEqual({
      tabela: 'viagens_frota as vf',
      metodo: 'where',
      argumentos: [
        'sv.data_saida_desejada',
        '<',
        new Date('2026-11-10T17:00:00-03:00'),
      ],
    });

    expect(subconsultas).toContainEqual({
      tabela: 'viagens_frota as vf',
      metodo: 'whereRaw',
      argumentos: [
        expect.stringContaining('COALESCE(sv.data_chegada_desejada'),
        [new Date('2026-11-10T08:00:00-03:00')],
      ],
    });
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

describe('periodoDaSolicitacao', () => {
  it('deve usar a data de chegada quando informada', () => {
    expect(
      periodoDaSolicitacao({
        data_saida_desejada: '2026-11-10T08:00:00',
        data_chegada_desejada: '2026-11-12T10:00:00',
      })
    ).toEqual({
      inicio: new Date('2026-11-10T08:00:00'),
      fim: new Date('2026-11-12T10:00:00'),
    });
  });

  it('deve ir até o fim do dia da saída quando não há chegada', () => {
    expect(
      periodoDaSolicitacao({
        data_saida_desejada: '2026-11-10T23:30:00',
        data_chegada_desejada: null,
      }).fim
    ).toEqual(new Date('2026-11-11T00:00:00'));
  });

  it('deve rejeitar chegada igual à saída', () => {
    expect(() =>
      periodoDaSolicitacao({
        data_saida_desejada: '2026-11-10T08:00:00',
        data_chegada_desejada: '2026-11-10T08:00:00',
      })
    ).toThrow(AppError);
  });
});
