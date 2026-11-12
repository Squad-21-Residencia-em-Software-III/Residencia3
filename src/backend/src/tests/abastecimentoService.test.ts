import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERFIS } from '../constants/perfis';

type RegistroConsulta = {
  tabela: string;
  metodo: string;
  args: unknown[];
};

const { mockDb, consultas, dbState } = vi.hoisted(() => {
  const state = {
    veiculos: new Map<number, any>(),
    motoristas: new Map<number, any>(),
    motoristasPorUsuario: new Map<number, any>(),
    ultimoAbastecimento: null as any,
  };

  const queries: RegistroConsulta[] = [];

  const createQueryBuilder = (tabela: string) => {
    let whereConditions: Record<string, any> = {};

    const builder: any = {
      where: (arg1: any, arg2?: any) => {
        queries.push({ tabela, metodo: 'where', args: [arg1, arg2] });
        if (typeof arg1 === 'object') {
          whereConditions = { ...whereConditions, ...arg1 };
        } else if (typeof arg1 === 'string' && arg2 !== undefined) {
          whereConditions[arg1] = arg2;
        }
        return builder;
      },
      orderBy: (col: string, dir: string) => {
        queries.push({ tabela, metodo: 'orderBy', args: [col, dir] });
        return builder;
      },
      first: async () => {
        queries.push({ tabela, metodo: 'first', args: [whereConditions] });
        if (tabela === 'veiculos') {
          return state.veiculos.get(whereConditions.id);
        }
        if (tabela === 'motoristas') {
          if (whereConditions.usuario_id !== undefined) {
            return state.motoristasPorUsuario.get(whereConditions.usuario_id);
          }
          if (whereConditions.id !== undefined) {
            return state.motoristas.get(whereConditions.id);
          }
        }
        if (tabela === 'abastecimentos') {
          return state.ultimoAbastecimento;
        }
        return undefined;
      },
    };
    return builder;
  };

  const db = Object.assign(
    vi.fn((tabela: string) => createQueryBuilder(tabela)),
    {
      raw: vi.fn(),
      transaction: vi.fn(async (callback: (trx: any) => Promise<any>) =>
        callback((tabela: string) => createQueryBuilder(tabela))
      ),
    }
  );

  return { mockDb: db, consultas: queries, dbState: state };
});

vi.mock('../config/database', () => ({
  db: mockDb,
}));

vi.mock('../models/abastecimentoModel', () => ({
  abastecimentoModel: {
    cadastrar: vi.fn(async (dados: any) => ({
      id: 99,
      ...dados,
      preco_por_litro: Number((dados.valor_total / dados.litros).toFixed(3)),
    })),
    listarPorVeiculo: vi.fn(async (veiculoId: number) => [
      {
        id: 1,
        veiculo_id: veiculoId,
        motorista_id: 10,
        data_abastecimento: '2026-11-01',
        quilometragem: 40000,
        litros: 50,
        valor_total: 300,
        preco_por_litro: 6.0,
      },
    ]),
  },
}));

vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: {
    registrar: vi.fn().mockResolvedValue(undefined),
  },
  MODULOS_AUDITORIA: {
    ABASTECIMENTOS: 'ABASTECIMENTOS',
  },
}));

import { abastecimentoService } from '../services/abastecimentoService';
import { abastecimentoModel } from '../models/abastecimentoModel';

describe('abastecimentoService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consultas.length = 0;
    dbState.veiculos.clear();
    dbState.motoristas.clear();
    dbState.motoristasPorUsuario.clear();
    dbState.ultimoAbastecimento = null;

    // Configuração padrão
    dbState.veiculos.set(1, {
      id: 1,
      placa: 'ABC-1234',
      tipo_frota: 'ADMINISTRATIVA',
      status: 'DISPONIVEL',
    });
    dbState.veiculos.set(2, {
      id: 2,
      placa: 'SVO-9999',
      tipo_frota: 'SVO',
      status: 'DISPONIVEL',
    });
    dbState.veiculos.set(3, {
      id: 3,
      placa: 'INA-0000',
      tipo_frota: 'ADMINISTRATIVA',
      status: 'INATIVO',
    });

    dbState.motoristas.set(10, {
      id: 10,
      usuario_id: 100,
      tipo_motorista: 'FROTA',
      status: 'DISPONIVEL',
    });
    dbState.motoristasPorUsuario.set(100, {
      id: 10,
      usuario_id: 100,
      tipo_motorista: 'FROTA',
      status: 'DISPONIVEL',
    });

    dbState.motoristas.set(20, {
      id: 20,
      usuario_id: 200,
      tipo_motorista: 'SVO',
      status: 'DISPONIVEL',
    });
    dbState.motoristasPorUsuario.set(200, {
      id: 20,
      usuario_id: 200,
      tipo_motorista: 'SVO',
      status: 'DISPONIVEL',
    });
  });

  describe('criar', () => {
    const dadosBase = {
      veiculo_id: 1,
      motorista_id: 10,
      data_abastecimento: '2026-11-10',
      quilometragem: 50000,
      litros: 40,
      valor_total: 240,
      posto_combustivel: 'Posto Central',
    };

    it('deve permitir cadastro quando autor é GESTOR_FROTA', async () => {
      const autor = { id: 999, perfil: PERFIS.GESTOR_FROTA };
      const resultado = await abastecimentoService.criar(dadosBase, autor);

      expect(resultado).toBeDefined();
      expect(resultado.id).toBe(99);
      expect(abastecimentoModel.cadastrar).toHaveBeenCalledWith(dadosBase, expect.anything());
    });

    it('deve usar o motorista do token e ignorar motorista_id do body para MOTORISTA_FROTA', async () => {
      const autor = { id: 100, perfil: PERFIS.MOTORISTA_FROTA };
      // Passando motorista_id: 999 no body, mas deve ser substituído pelo id 10 do motorista vinculado
      const resultado = await abastecimentoService.criar(
        { ...dadosBase, motorista_id: 999 },
        autor
      );

      expect(resultado).toBeDefined();
      expect(abastecimentoModel.cadastrar).toHaveBeenCalledWith(
        expect.objectContaining({ motorista_id: 10 }),
        expect.anything()
      );
    });

    it('deve lançar 403 se o usuário motorista não tiver registro na tabela motoristas', async () => {
      const autor = { id: 888, perfil: PERFIS.MOTORISTA_FROTA }; // Sem motorista cadastrado

      await expect(
        abastecimentoService.criar(dadosBase, autor)
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Usuário não possui vínculo ativo como motorista'),
      });
    });

    it('deve lançar 403 se o motorista estiver inativo', async () => {
      dbState.motoristasPorUsuario.set(100, {
        id: 10,
        usuario_id: 100,
        tipo_motorista: 'FROTA',
        status: 'INATIVO',
      });

      const autor = { id: 100, perfil: PERFIS.MOTORISTA_FROTA };

      await expect(
        abastecimentoService.criar(dadosBase, autor)
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Motorista inativo não tem permissão'),
      });
    });

    it('deve lançar 403 se MOTORISTA_FROTA tentar abastecer veículo SVO', async () => {
      const autor = { id: 100, perfil: PERFIS.MOTORISTA_FROTA };

      await expect(
        abastecimentoService.criar({ ...dadosBase, veiculo_id: 2 }, autor)
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Motorista da frota administrativa não tem permissão para abastecer veículo SVO'),
      });
    });

    it('deve lançar 403 se MOTORISTA_SVO tentar abastecer veículo da frota ADMINISTRATIVA', async () => {
      const autor = { id: 200, perfil: PERFIS.MOTORISTA_SVO };

      await expect(
        abastecimentoService.criar({ ...dadosBase, veiculo_id: 1 }, autor)
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Motorista SVO não tem permissão para abastecer veículo da frota administrativa'),
      });
    });

    it('deve permitir MOTORISTA_SVO abastecer veículo SVO', async () => {
      const autor = { id: 200, perfil: PERFIS.MOTORISTA_SVO };

      const resultado = await abastecimentoService.criar(
        { ...dadosBase, veiculo_id: 2, motorista_id: 20 },
        autor
      );

      expect(resultado).toBeDefined();
      expect(abastecimentoModel.cadastrar).toHaveBeenCalledWith(
        expect.objectContaining({ veiculo_id: 2, motorista_id: 20 }),
        expect.anything()
      );
    });

    it('deve lançar 400 se o veículo estiver INATIVO', async () => {
      const autor = { id: 1, perfil: PERFIS.ADMINISTRADOR };

      await expect(
        abastecimentoService.criar({ ...dadosBase, veiculo_id: 3 }, autor)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('Não é permitido abastecer veículo inativo'),
      });
    });

    it('deve lançar 400 se a quilometragem for menor que a do último abastecimento', async () => {
      dbState.ultimoAbastecimento = { quilometragem: 60000 };
      const autor = { id: 1, perfil: PERFIS.ADMINISTRADOR };

      await expect(
        abastecimentoService.criar({ ...dadosBase, quilometragem: 55000 }, autor)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('A quilometragem não pode ser menor que a do último abastecimento do veículo'),
      });
    });
  });

  describe('listarPorVeiculo', () => {
    it('deve permitir listagem por ADMINISTRADOR para qualquer veículo', async () => {
      const autor = { id: 1, perfil: PERFIS.ADMINISTRADOR };
      const resultado = await abastecimentoService.listarPorVeiculo(1, autor);

      expect(resultado).toHaveLength(1);
      expect(resultado[0].veiculo_id).toBe(1);
    });

    it('deve lançar 403 se MOTORISTA_FROTA tentar listar abastecimentos de veículo SVO', async () => {
      const autor = { id: 100, perfil: PERFIS.MOTORISTA_FROTA };

      await expect(
        abastecimentoService.listarPorVeiculo(2, autor)
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Acesso não autorizado aos registros deste veículo'),
      });
    });

    it('deve lançar 403 se MOTORISTA_SVO tentar listar abastecimentos de veículo ADMINISTRATIVA', async () => {
      const autor = { id: 200, perfil: PERFIS.MOTORISTA_SVO };

      await expect(
        abastecimentoService.listarPorVeiculo(1, autor)
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Acesso não autorizado aos registros deste veículo'),
      });
    });

    it('deve lançar 404 se o veículo não existir', async () => {
      const autor = { id: 1, perfil: PERFIS.ADMINISTRADOR };

      await expect(
        abastecimentoService.listarPorVeiculo(9999, autor)
      ).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('Veículo não encontrado'),
      });
    });
  });
});

