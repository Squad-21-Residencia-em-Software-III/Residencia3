
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockTrx, registros } = vi.hoisted(() => {
  const trx = vi.fn();

  return {
    mockTrx: trx,
    mockDb: {
      transaction: vi.fn(async (callback: Function) => callback(trx)),
    },
    registros: {} as Record<string, unknown>,
  };
});

vi.mock('../config/database', () => ({
  db: mockDb,
}));

vi.mock('../models/veiculoModel', () => ({
  veiculoModel: { atualizarStatus: vi.fn() },
}));

vi.mock('../models/motoristaModel', () => ({
  motoristaModel: { atualizarStatus: vi.fn() },
}));

vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() },
  MODULOS_AUDITORIA: { VEICULOS: 'VEICULOS' },
}));

import { viagemService } from '../services/viagemService';
import { veiculoModel } from '../models/veiculoModel';
import { motoristaModel } from '../models/motoristaModel';

describe('viagemService.criar', () => {
  const dados = { solicitacao_id: 1, veiculo_id: 10, motorista_id: 20 };

  // Resultado de first() por tabela; conflitos por recurso consultado
  let resultados: Record<string, unknown>;
  let conflitos: { veiculo?: object; motorista?: object };

  beforeEach(() => {
    vi.clearAllMocks();

    resultados = {
      solicitacoes_viagem: {
        id: 1,
        data_saida_desejada: '2026-11-10T08:00:00',
        data_chegada_desejada: null,
      },
      veiculos: { id: 10, status: 'DISPONIVEL' },
      motoristas: { id: 20, status: 'DISPONIVEL' },
    };
    conflitos = {};

    mockTrx.mockImplementation((tabela: string) => {
      const query: Record<string, any> = {};
      let recurso: 'veiculo' | 'motorista' | undefined;

      for (const metodo of ['join', 'whereIn', 'whereRaw', 'forUpdate']) {
        query[metodo] = () => query;
      }

      query.where = (coluna: unknown) => {
        if (coluna === 'vf.veiculo_id') recurso = 'veiculo';
        if (coluna === 'vf.motorista_id') recurso = 'motorista';
        return query;
      };

      query.first = async () =>
        tabela === 'viagens_frota as vf'
          ? recurso && conflitos[recurso]
          : resultados[tabela];

      query.insert = (valores: unknown) => {
        registros.insert = valores;
        return query;
      };
      query.returning = async () => [{ id: 99 }];

      return query;
    });
  });

  it('deve rejeitar solicitação inexistente', async () => {
    resultados.solicitacoes_viagem = undefined;

    await expect(viagemService.criar(dados, 3)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('deve rejeitar veículo em manutenção', async () => {
    resultados.veiculos = { id: 10, status: 'MANUTENCAO' };

    await expect(viagemService.criar(dados, 3)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('deve rejeitar motorista afastado', async () => {
    resultados.motoristas = { id: 20, status: 'AFASTADO' };

    await expect(viagemService.criar(dados, 3)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('deve rejeitar veículo com viagem no mesmo período', async () => {
    conflitos.veiculo = { id: 5 };

    await expect(viagemService.criar(dados, 3)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('deve rejeitar motorista com viagem no mesmo período', async () => {
    conflitos.motorista = { id: 5 };

    await expect(viagemService.criar(dados, 3)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('deve agendar veículo reservado para outro período', async () => {
    resultados.veiculos = { id: 10, status: 'RESERVADO' };
    resultados.motoristas = { id: 20, status: 'DESIGNADO' };

    await expect(viagemService.criar(dados, 3)).resolves.toEqual({ id: 99 });
    expect(registros.insert).toMatchObject({ status: 'AGENDADA' });
  });

  it('deve reservar recursos que estavam disponíveis', async () => {
    await viagemService.criar(dados, 3);

    expect(veiculoModel.atualizarStatus).toHaveBeenCalledWith(10, 'RESERVADO', mockTrx);
    expect(motoristaModel.atualizarStatus).toHaveBeenCalledWith(20, 'DESIGNADO', mockTrx);
  });

  it('não deve sobrescrever o status de recursos em uso', async () => {
    resultados.veiculos = { id: 10, status: 'EM_USO' };
    resultados.motoristas = { id: 20, status: 'EM_VIAGEM' };

    await viagemService.criar(dados, 3);

    expect(veiculoModel.atualizarStatus).not.toHaveBeenCalled();
    expect(motoristaModel.atualizarStatus).not.toHaveBeenCalled();
  });
});
