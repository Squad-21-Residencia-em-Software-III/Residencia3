
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { consultaMock, dbMock } = vi.hoisted(() => {
  const consultaMock = {
    clone: vi.fn(),
    select: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    count: vi.fn(),
  };

  const dbMock = vi.fn();

  return { consultaMock, dbMock };
});

vi.mock('../config/database', () => ({
  db: dbMock,
}));

import { auditoriaModel } from '../models/auditoriaModel';

describe('auditoriaModel.listar', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('deve aplicar limite e offset para consultar a segunda página', async () => {
    const registros = [
      {
        id: 21,
        usuario_id: 1,
        acao: 'LOGIN',
        modulo: 'AUTENTICACAO',
        data_hora: new Date('2026-11-08T12:00:00.000Z'),
      },
    ];

    const consultaDados = {
      select: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      offset: vi.fn(),
    };

    consultaDados.select.mockReturnValue(consultaDados);
    consultaDados.orderBy.mockReturnValue(consultaDados);
    consultaDados.limit.mockReturnValue(consultaDados);
    consultaDados.offset.mockResolvedValue(registros);

    const consultaContagem = {
      count: vi.fn().mockResolvedValue([{ total: '45' }]),
    };

    dbMock.mockReturnValue(consultaMock);
    consultaMock.clone
      .mockReturnValueOnce(consultaDados)
      .mockReturnValueOnce(consultaContagem);

    const resultado = await auditoriaModel.listar(2, 20);

    expect(dbMock).toHaveBeenCalledWith('auditorias');
    expect(consultaDados.limit).toHaveBeenCalledWith(20);
    expect(consultaDados.offset).toHaveBeenCalledWith(20);
    expect(resultado.dados).toEqual(registros);
    expect(resultado.total).toBe(45);
  });

  it('deve ordenar por data_hora e id em ordem decrescente', async () => {
    const consultaDados = {
      select: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      offset: vi.fn(),
    };

    consultaDados.select.mockReturnValue(consultaDados);
    consultaDados.orderBy.mockReturnValue(consultaDados);
    consultaDados.limit.mockReturnValue(consultaDados);
    consultaDados.offset.mockResolvedValue([]);

    const consultaContagem = {
      count: vi.fn().mockResolvedValue([{ total: '0' }]),
    };

    dbMock.mockReturnValue(consultaMock);
    consultaMock.clone
      .mockReturnValueOnce(consultaDados)
      .mockReturnValueOnce(consultaContagem);

    await auditoriaModel.listar(1, 20);

    expect(consultaDados.orderBy).toHaveBeenNthCalledWith(
      1,
      'data_hora',
      'desc'
    );

    expect(consultaDados.orderBy).toHaveBeenNthCalledWith(
      2,
      'id',
      'desc'
    );

    expect(consultaDados.orderBy).toHaveBeenCalledTimes(2);
  });

  it('deve propagar erros na consulta ao banco', async () => {
    const erroBanco = new Error('Falha na consulta ao PostgreSQL');

    const consultaDados = {
      select: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      offset: vi.fn(),
    };

    consultaDados.select.mockReturnValue(consultaDados);
    consultaDados.orderBy.mockReturnValue(consultaDados);
    consultaDados.limit.mockReturnValue(consultaDados);
    consultaDados.offset.mockRejectedValue(erroBanco);

    const consultaContagem = {
      count: vi.fn().mockResolvedValue([{ total: '10' }]),
    };

    dbMock.mockReturnValue(consultaMock);
    consultaMock.clone
      .mockReturnValueOnce(consultaDados)
      .mockReturnValueOnce(consultaContagem);

    await expect(
      auditoriaModel.listar(1, 20)
    ).rejects.toThrow('Falha na consulta ao PostgreSQL');
  });
});
