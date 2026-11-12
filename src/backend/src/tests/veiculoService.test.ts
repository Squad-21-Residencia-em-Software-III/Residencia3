import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockTrx, estado } = vi.hoisted(() => {
  const estado = {
    ocupacao: 0 as number | string | null,
    consultas: [] as string[],
  };

  // Consulta encadeável: registra a tabela e responde à soma das ordens SVO
  const trx = vi.fn((tabela: string) => {
    estado.consultas.push(tabela);
    const consulta: Record<string, any> = {};
    for (const metodo of ['where', 'whereIn', 'forUpdate']) {
      consulta[metodo] = () => consulta;
    }
    consulta.first = async () => ({ id: 10 });
    consulta.sum = async () => [{ ocupacao: estado.ocupacao }];
    return consulta;
  });

  return {
    estado,
    mockTrx: trx,
    mockDb: { transaction: vi.fn(async (callback: Function) => callback(trx)) },
  };
});

vi.mock('../config/database', () => ({ db: mockDb }));

vi.mock('../models/veiculoModel', () => ({
  veiculoModel: {
    buscarPorId: vi.fn(),
    buscarPorPlaca: vi.fn(),
    atualizarVeiculo: vi.fn(),
  },
}));

vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() },
  MODULOS_AUDITORIA: { VEICULOS: 'VEICULOS' },
}));

import { veiculoService } from '../services/veiculoService';
import { veiculoModel } from '../models/veiculoModel';

const veiculoSvo = {
  id: 10,
  placa: 'ABC1D23',
  modelo: 'Rabecão',
  tipo_frota: 'SVO',
  capacidade_maxima: 4,
  km_atual: 1000,
  status: 'RESERVADO',
};

describe('veiculoService.atualizar - capacidade SVO', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.ocupacao = 0;
    estado.consultas = [];

    vi.mocked(veiculoModel.buscarPorId).mockResolvedValue(veiculoSvo as any);
    vi.mocked(veiculoModel.atualizarVeiculo).mockImplementation(
      async (_id, dados) => ({ ...veiculoSvo, ...dados }) as any
    );
  });

  it('deve bloquear capacidade menor que a ocupação atual', async () => {
    estado.ocupacao = '3';

    await expect(veiculoService.atualizar(10, { capacidade_maxima: 2 } as any, 1)).rejects.toMatchObject({
      statusCode: 409,
      message: 'A capacidade não pode ser menor que a ocupação atual do veículo (3)',
    });
    expect(veiculoModel.atualizarVeiculo).not.toHaveBeenCalled();
  });

  it('deve permitir capacidade igual à ocupação atual', async () => {
    estado.ocupacao = 3;

    await expect(veiculoService.atualizar(10, { capacidade_maxima: 3 } as any, 1)).resolves.toMatchObject({
      capacidade_maxima: 3,
    });
    expect(estado.consultas).toEqual(['veiculos', 'ordens_svo']);
  });

  it('deve permitir reduzir a capacidade sem ordens ativas', async () => {
    estado.ocupacao = null;

    await expect(veiculoService.atualizar(10, { capacidade_maxima: 1 } as any, 1)).resolves.toMatchObject({
      capacidade_maxima: 1,
    });
  });

  it('deve impedir que o veículo saia da frota SVO com ordens ativas', async () => {
    estado.ocupacao = 1;

    await expect(
      veiculoService.atualizar(10, { tipo_frota: 'ADMINISTRATIVA' } as any, 1)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'O veículo possui ordens SVO ativas e não pode sair da frota SVO',
    });
    expect(veiculoModel.atualizarVeiculo).not.toHaveBeenCalled();
  });

  it('não deve consultar ordens quando capacidade e frota não mudam', async () => {
    await veiculoService.atualizar(10, { modelo: 'Outro', capacidade_maxima: 4 } as any, 1);

    expect(estado.consultas).toEqual([]);
    expect(mockTrx).not.toHaveBeenCalled();
    expect(veiculoModel.atualizarVeiculo).toHaveBeenCalled();
  });
});
