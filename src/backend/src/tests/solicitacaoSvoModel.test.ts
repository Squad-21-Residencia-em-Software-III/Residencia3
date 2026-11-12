import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, consultaBase } = vi.hoisted(() => ({
  dbMock: vi.fn(),
  consultaBase: {
    where: vi.fn(),
    clone: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  db: dbMock,
}));

import { solicitacaoSvoModel } from '../models/solicitacaoSvoModel';

function prepararConsultas(dados: unknown[], total: string) {
  const consultaDados = {
    select: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
  };

  consultaDados.select.mockReturnValue(consultaDados);
  consultaDados.orderBy.mockReturnValue(consultaDados);
  consultaDados.limit.mockReturnValue(consultaDados);
  consultaDados.offset.mockResolvedValue(dados);

  const consultaContagem = {
    count: vi.fn().mockResolvedValue([{ total }]),
  };

  consultaBase.clone
    .mockReturnValueOnce(consultaDados)
    .mockReturnValueOnce(consultaContagem);

  return { consultaDados };
}

describe('solicitacaoSvoModel.listar - paginacao', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    dbMock.mockReturnValue(consultaBase);
    consultaBase.where.mockReturnValue(consultaBase);
  });

  it('aplica filtro, ordenacao, limite e offset', async () => {
    const registros = [{ id: 30, status: 'EM_TRIAGEM' }];
    const { consultaDados } = prepararConsultas(registros, '43');

    const resultado = await solicitacaoSvoModel.listar({
      status: 'EM_TRIAGEM',
      pagina: 3,
      limite: 10,
    });

    expect(dbMock).toHaveBeenCalledWith('solicitacoes_svo');
    expect(consultaBase.where).toHaveBeenCalledWith({
      status: 'EM_TRIAGEM',
    });

    expect(consultaDados.orderBy).toHaveBeenCalledWith('id', 'desc');
    expect(consultaDados.limit).toHaveBeenCalledWith(10);
    expect(consultaDados.offset).toHaveBeenCalledWith(20);
    expect(consultaBase.clone).toHaveBeenCalledTimes(2);

    expect(resultado).toEqual({
      dados: registros,
      total: 43,
    });
  });

  it('retorna lista vazia e total zero', async () => {
    const { consultaDados } = prepararConsultas([], '0');

    const resultado = await solicitacaoSvoModel.listar({
      pagina: 1,
      limite: 20,
    });

    expect(consultaBase.where).not.toHaveBeenCalled();
    expect(consultaDados.limit).toHaveBeenCalledWith(20);
    expect(consultaDados.offset).toHaveBeenCalledWith(0);

    expect(resultado).toEqual({
      dados: [],
      total: 0,
    });
  });

  it('propaga falhas do banco de dados', async () => {
    const { consultaDados } = prepararConsultas([], '0');

    consultaDados.offset.mockRejectedValue(
      new Error('Falha na consulta')
    );

    await expect(
      solicitacaoSvoModel.listar({ pagina: 1, limite: 20 })
    ).rejects.toThrow('Falha na consulta');
  });
});