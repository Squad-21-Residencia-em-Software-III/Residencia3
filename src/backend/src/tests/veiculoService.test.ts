import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockTrx, estado } = vi.hoisted(() => {
  const estado = {
    ocupacao: 0 as number | string | null,
    consultas: [] as string[],
  };

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
    cadastrarVeiculo: vi.fn(),
    atualizarVeiculo: vi.fn(),
    listarVeiculos: vi.fn(async () => []),
    idsVinculadosAoUsuarioMotorista: vi.fn(async () => [4, 9]),
  },
}));

vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() },
  MODULOS_AUDITORIA: { VEICULOS: 'VEICULOS' },
}));

import { veiculoService } from '../services/veiculoService';
import { veiculoModel } from '../models/veiculoModel';
import { auditoriaModel } from '../models/auditoriaModel';

const veiculoSvo = {
  id: 10,
  placa: 'ABC1D23',
  modelo: 'Rabecão',
  tipo_frota: 'SVO',
  capacidade_maxima: 4,
  lotacao_cabine: 3,
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

  it('deve permitir cadastrar veículo SVO com lotação de cabine', async () => {
    vi.mocked(veiculoModel.buscarPorPlaca).mockResolvedValue(undefined);
    vi.mocked(veiculoModel.cadastrarVeiculo).mockResolvedValue({
      id: 15,
      placa: 'XYZ9K88',
      modelo: 'Fiorino SVO',
      tipo_frota: 'SVO',
      capacidade_maxima: 2,
      lotacao_cabine: 3,
      km_atual: 100,
      status: 'DISPONIVEL',
    } as any);

    const resultado = await veiculoService.criar(
      {
        placa: 'XYZ9K88',
        modelo: 'Fiorino SVO',
        tipo_frota: 'SVO',
        capacidade_maxima: 2,
        lotacao_cabine: 3,
        km_atual: 100,
      },
      1
    );

    expect(resultado).toMatchObject({
      capacidade_maxima: 2,
      lotacao_cabine: 3,
    });
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

  it('altera a cabine sem modificar a capacidade e registra auditoria', async () => {
    const resultado = await veiculoService.atualizar(10, { lotacao_cabine: 5 }, 1);
    expect(resultado).toMatchObject({ capacidade_maxima: 4, lotacao_cabine: 5 });
    expect(veiculoModel.buscarParaAtualizar).toHaveBeenCalledWith(10, mockTrx);
    expect(auditoriaModel.registrar).toHaveBeenCalledWith(expect.objectContaining({ usuario_id: 1, modulo: 'VEICULOS' }), mockTrx);
  });

  it('preserva a cabine desconhecida ao editar um veículo legado', async () => {
    vi.mocked(veiculoModel.buscarParaAtualizar).mockResolvedValue({ ...veiculoSvo, lotacao_cabine: null } as any);
    vi.mocked(veiculoModel.atualizarVeiculo).mockImplementation(async (_id, dados) => ({ ...veiculoSvo, lotacao_cabine: null, ...dados }) as any);
    const resultado = await veiculoService.atualizar(10, { capacidade_maxima: 2 }, 1);
    expect(resultado).toMatchObject({ capacidade_maxima: 2, lotacao_cabine: null });
    expect(veiculoModel.atualizarVeiculo).toHaveBeenCalledWith(10, { capacidade_maxima: 2 }, mockTrx);
  });

  it('rejeita conversão administrativa para SVO sem cabine conhecida', async () => {
    vi.mocked(veiculoModel.buscarParaAtualizar).mockResolvedValue({ ...veiculoSvo, tipo_frota: 'ADMINISTRATIVA', lotacao_cabine: null } as any);
    await expect(veiculoService.atualizar(10, { tipo_frota: 'SVO' }, 1)).rejects.toMatchObject({ statusCode: 400 });
    expect(veiculoModel.atualizarVeiculo).not.toHaveBeenCalled();
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it('permite conversão administrativa para SVO com cabine válida e audita', async () => {
    vi.mocked(veiculoModel.buscarParaAtualizar).mockResolvedValue({ ...veiculoSvo, tipo_frota: 'ADMINISTRATIVA', lotacao_cabine: null } as any);
    await veiculoService.atualizar(10, { tipo_frota: 'SVO', lotacao_cabine: 3 }, 1);
    expect(veiculoModel.atualizarVeiculo).toHaveBeenCalledWith(10, { tipo_frota: 'SVO', lotacao_cabine: 3 }, mockTrx);
    expect(auditoriaModel.registrar).toHaveBeenCalledOnce();
  });

  it('aceita cabine válida já registrada ao converter para SVO', async () => {
    vi.mocked(veiculoModel.buscarParaAtualizar).mockResolvedValue({ ...veiculoSvo, tipo_frota: 'ADMINISTRATIVA', lotacao_cabine: 2 } as any);
    await expect(veiculoService.atualizar(10, { tipo_frota: 'SVO' }, 1)).resolves.toBeDefined();
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
    vi.mocked(veiculoModel.buscarParaAtualizar).mockResolvedValue({ ...veiculoSvo, capacidade_maxima: 3 } as any);
    estado.ocupacao = 3;

    await expect(veiculoService.atualizar(10, { capacidade_maxima: 4 } as any, 1)).resolves.toMatchObject({
      capacidade_maxima: 4,
    });
    expect(estado.consultas).toEqual(['ordens_svo']);
  });
});

describe('veiculoService.listar (veículos vinculados ao motorista)', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['MOTORISTA_FROTA', 'MOTORISTA_SVO'] as const)('%s recebe só os veículos das próprias viagens ativas', async (perfil) => {
    await veiculoService.listar({ id: 100, perfil });

    expect(veiculoModel.idsVinculadosAoUsuarioMotorista).toHaveBeenCalledWith(100);
    expect(veiculoModel.listarVeiculos).toHaveBeenCalledWith([4, 9]);
  });

  it('motorista sem viagem ativa recebe lista vazia, não a frota inteira', async () => {
    vi.mocked(veiculoModel.idsVinculadosAoUsuarioMotorista).mockResolvedValueOnce([]);

    await veiculoService.listar({ id: 100, perfil: 'MOTORISTA_FROTA' });

    expect(veiculoModel.listarVeiculos).toHaveBeenCalledWith([]);
  });

  it.each(['ADMINISTRADOR', 'GESTOR_FROTA', 'GESTOR_SVO'] as const)('%s recebe a frota inteira', async (perfil) => {
    await veiculoService.listar({ id: 1, perfil });

    expect(veiculoModel.idsVinculadosAoUsuarioMotorista).not.toHaveBeenCalled();
    expect(veiculoModel.listarVeiculos).toHaveBeenCalledWith();
  });
});
