import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, criarChainMock } = vi.hoisted(() => {
  const criarChainMock = (dadosRetorno: unknown[] = []) => {
    const chain: Record<string, any> = {
      where: vi.fn(),
      whereIn: vi.fn(),
      leftJoin: vi.fn(),
      select: vi.fn(),
      from: vi.fn(),
      orderBy: vi.fn(),
      orderByRaw: vi.fn(),
      limit: vi.fn(),
    };
    chain.where.mockReturnValue(chain);
    chain.whereIn.mockReturnValue(chain);
    chain.leftJoin.mockReturnValue(chain);
    chain.select.mockReturnValue(chain);
    chain.from.mockReturnValue(chain);
    chain.orderBy.mockReturnValue(chain);
    chain.orderByRaw.mockReturnValue(chain);
    chain.limit.mockResolvedValue(dadosRetorno);
    return chain;
  };

  const dbMock: any = vi.fn();
  dbMock.select = vi.fn();
  dbMock.raw = vi.fn();

  return { dbMock, criarChainMock };
});

vi.mock('../config/database', () => ({
  db: dbMock,
}));

import {
  abastecimentoModel,
  LIMITE_MAXIMO_ABASTECIMENTOS,
} from '../models/abastecimentoModel';
import {
  documentoModel,
  LIMITE_MAXIMO_DOCUMENTOS,
} from '../models/documentoModel';
import {
  manutencaoModel,
  LIMITE_MAXIMO_MANUTENCOES,
} from '../models/manutencaoModel';
import {
  multaModel,
  LIMITE_MAXIMO_MULTAS,
} from '../models/multaModel';
import {
  viagemModel,
  LIMITE_MAXIMO_VIAGENS,
} from '../models/viagemModel';

describe('Limites explícitos em consultas históricas e integridade sob carga concorrente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('abastecimentoModel.listarPorVeiculo aplica limite padrão (200) e impede limites excessivos', async () => {
    const chainPadrao = criarChainMock([]);
    dbMock.mockReturnValueOnce(chainPadrao);

    await abastecimentoModel.listarPorVeiculo(10);

    expect(chainPadrao.orderBy).toHaveBeenNthCalledWith(1, 'data_abastecimento', 'desc');
    expect(chainPadrao.orderBy).toHaveBeenNthCalledWith(2, 'id', 'desc');
    expect(chainPadrao.limit).toHaveBeenCalledWith(LIMITE_MAXIMO_ABASTECIMENTOS);

    const chainTeto = criarChainMock([]);
    dbMock.mockReturnValueOnce(chainTeto);

    await abastecimentoModel.listarPorVeiculo(10, 5000);
    expect(chainTeto.limit).toHaveBeenCalledWith(LIMITE_MAXIMO_ABASTECIMENTOS);
  });

  it('manutencaoModel.listarPorVeiculo aplica limite explícito na consulta histórica', async () => {
    const chain = criarChainMock([]);
    dbMock.mockReturnValueOnce(chain);

    await manutencaoModel.listarPorVeiculo(4, 50);

    expect(chain.orderBy).toHaveBeenNthCalledWith(1, 'manutencoes.data_manutencao', 'desc');
    expect(chain.orderBy).toHaveBeenNthCalledWith(2, 'manutencoes.id', 'desc');
    expect(chain.limit).toHaveBeenCalledWith(50);

    const chainExcedente = criarChainMock([]);
    dbMock.mockReturnValueOnce(chainExcedente);

    await manutencaoModel.listarPorVeiculo(4, 9999);
    expect(chainExcedente.limit).toHaveBeenCalledWith(LIMITE_MAXIMO_MANUTENCOES);
  });

  it('multaModel.listar aplica ordenação determinística (data_infracao DESC, id DESC) e limite máximo', async () => {
    const chain = criarChainMock([]);
    dbMock.mockReturnValueOnce(chain);

    await multaModel.listar();

    expect(chain.orderBy).toHaveBeenNthCalledWith(1, 'data_infracao', 'desc');
    expect(chain.orderBy).toHaveBeenNthCalledWith(2, 'id', 'desc');
    expect(chain.limit).toHaveBeenCalledWith(LIMITE_MAXIMO_MULTAS);
  });

  it('viagemModel.listar aplica limite explícito sobre a união de viagens administrativas e ordens SVO', async () => {
    const chain = criarChainMock([]);
    dbMock.select.mockReturnValueOnce(chain);

    await viagemModel.listar(['ADMINISTRATIVA', 'SVO'], undefined, 1000);

    expect(chain.orderByRaw).toHaveBeenCalledWith('inicio_previsto DESC NULLS LAST, id DESC');
    expect(chain.limit).toHaveBeenCalledWith(LIMITE_MAXIMO_VIAGENS);
  });

  it('documentoModel.listarVencimentos parametriza LIMIT no SQL de vencimentos', async () => {
    dbMock.raw.mockResolvedValueOnce({ rows: [] });

    await documentoModel.listarVencimentos();

    expect(dbMock.raw).toHaveBeenCalledOnce();
    const [sql, bindings] = dbMock.raw.mock.calls[0] as [string, number[]];
    expect(sql).toContain('LIMIT ?');
    expect(bindings).toEqual([LIMITE_MAXIMO_DOCUMENTOS]);
  });

  it('mantém integridade e respeita o teto de conexões simultâneas do pool sob rajada de carga (30 requisições / max=10)', async () => {
    const MAX_POOL = 10;
    const TOTAL_CARGA = 30;
    let conexoesAtivas = 0;
    let picoConexoesSimultaneas = 0;
    const filaEspera: Array<() => void> = [];

    const adquirirConexaoSimulada = async () => {
      if (conexoesAtivas >= MAX_POOL) {
        await new Promise<void>((resolve) => filaEspera.push(resolve));
      }
      conexoesAtivas += 1;
      if (conexoesAtivas > picoConexoesSimultaneas) {
        picoConexoesSimultaneas = conexoesAtivas;
      }
    };

    const liberarConexaoSimulada = () => {
      conexoesAtivas -= 1;
      const proximo = filaEspera.shift();
      if (proximo) proximo();
    };

    dbMock.mockImplementation(() => {
      const chain = criarChainMock([{ id: 1, valor: 195.23, status_pagamento: 'PENDENTE' }]);
      chain.limit.mockImplementation(async () => {
        await adquirirConexaoSimulada();
        try {
          await new Promise((r) => setTimeout(r, 5));
          return [{ id: 1, valor: '195.23', status_pagamento: 'PENDENTE' }];
        } finally {
          liberarConexaoSimulada();
        }
      });
      return chain;
    });

    const resultados = await Promise.all(
      Array.from({ length: TOTAL_CARGA }, () => multaModel.listar(50))
    );

    expect(resultados).toHaveLength(TOTAL_CARGA);
    expect(picoConexoesSimultaneas).toBeLessThanOrEqual(MAX_POOL);
    expect(conexoesAtivas).toBe(0);
    for (const lista of resultados) {
      expect(lista[0]?.valor).toBe(195.23);
    }
  });
});
