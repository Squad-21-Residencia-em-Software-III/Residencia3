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
    buscarParaAtualizar: vi.fn(),
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

    vi.mocked(veiculoModel.buscarParaAtualizar).mockResolvedValue(veiculoSvo as any);
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
    expect(estado.consultas).toEqual(['ordens_svo']);
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
    expect(veiculoModel.atualizarVeiculo).toHaveBeenCalled();
  });

  it('deve ler e bloquear o veículo dentro da transação, sem leitura prévia', async () => {
    await veiculoService.atualizar(10, { modelo: 'Outro' } as any, 1);

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(veiculoModel.buscarParaAtualizar).toHaveBeenCalledWith(10, mockTrx);
    expect(veiculoModel.buscarPorId).not.toHaveBeenCalled();
  });

  it('deve retornar 404 quando o veículo não existe', async () => {
    vi.mocked(veiculoModel.buscarParaAtualizar).mockResolvedValue(undefined);

    await expect(veiculoService.atualizar(99, { modelo: 'Outro' } as any, 1)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(veiculoModel.atualizarVeiculo).not.toHaveBeenCalled();
  });

  it('deve validar com o estado atual do banco, não com o que o cliente supõe', async () => {
    // Outra requisição já reduziu a capacidade para 3; o cliente envia 4 (o valor que viu antes)
    vi.mocked(veiculoModel.buscarParaAtualizar).mockResolvedValue({ ...veiculoSvo, capacidade_maxima: 3 } as any);
    estado.ocupacao = 3;

    await expect(veiculoService.atualizar(10, { capacidade_maxima: 4 } as any, 1)).resolves.toMatchObject({
      capacidade_maxima: 4,
    });
    // A mudança 3 -> 4 é detectada pelo valor do banco e a ocupação é conferida
    expect(estado.consultas).toEqual(['ordens_svo']);
  });
});
