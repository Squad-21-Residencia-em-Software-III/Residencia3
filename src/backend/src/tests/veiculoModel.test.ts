
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRaw } = vi.hoisted(() => ({
  mockRaw: vi.fn(),
}));

vi.mock('../config/database', () => ({
  db: {
    raw: mockRaw,
  },
}));

import { STATUS_ORDEM_SVO_OCUPA_VAGA, STATUS_VEICULO_SVO_ALOCAVEL } from '../constants/veiculoSvo';
import { veiculoModel } from '../models/veiculoModel';

describe('veiculoModel.listarOcupacaoSvo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve retornar a ocupacao dos veiculos SVO', async () => {
    const veiculos = [
      {
        id: 1,
        placa: 'ABC1D23',
        modelo: 'Van SVO',
        capacidade_maxima: 4,
        status: 'DISPONIVEL',
        capacidade_utilizada: 0,
        vagas_disponiveis: 4,
      },
      {
        id: 2,
        placa: 'DEF4G56',
        modelo: 'Van SVO',
        capacidade_maxima: 4,
        status: 'RESERVADO',
        capacidade_utilizada: 2,
        vagas_disponiveis: 2,
      },
      {
        id: 3,
        placa: 'GHI7J89',
        modelo: 'Van SVO',
        capacidade_maxima: 4,
        status: 'RESERVADO',
        capacidade_utilizada: 4,
        vagas_disponiveis: 0,
      },
    ];

    mockRaw.mockResolvedValue({ rows: veiculos });

    const resultado = await veiculoModel.listarOcupacaoSvo();

    expect(resultado).toEqual(veiculos);
    expect(resultado).toHaveLength(3);
    expect(mockRaw).toHaveBeenCalledOnce();
  });

  it('deve consultar todos os veiculos SVO sem excluir os lotados', async () => {
    mockRaw.mockResolvedValue({ rows: [] });

    await veiculoModel.listarOcupacaoSvo();

    const sql = mockRaw.mock.calls[0][0] as string;

    expect(sql).toContain("WHERE v.tipo_frota = 'SVO'");
    expect(sql).toContain("o.status IN ('ALOCADA', 'EM_DESLOCAMENTO')");
    expect(sql).toContain('COALESCE(SUM(o.capacidade_utilizada), 0)');
    expect(sql).not.toMatch(/\bHAVING\b/i);
  });
});

// Garante que a consulta de veículos disponíveis e a regra da alocação (alocacaoVeiculoSvo.ts)
// continuem falando da mesma coisa: se uma delas mudar, este teste falha.
describe('consulta de veículos SVO disponíveis x regra de alocação', () => {
  const listaDe = (sql: string, padrao: RegExp): string[] => {
    const trecho = padrao.exec(sql)?.[1] ?? '';
    return [...trecho.matchAll(/'([A-Z_]+)'/g)].map((item) => item[1] as string);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa os mesmos status de veículo e de ordem da alocação', async () => {
    mockRaw.mockResolvedValue({ rows: [] });

    await veiculoModel.listarSvoDisponiveis();

    expect(mockRaw).toHaveBeenCalledOnce();
    const sql = String(mockRaw.mock.calls[0]?.[0] ?? '').replace(/\s+/g, ' ');
    expect(listaDe(sql, /v\.status IN \(([^)]*)\)/)).toEqual([...STATUS_VEICULO_SVO_ALOCAVEL]);
    expect(listaDe(sql, /o\.status IN \(([^)]*)\)/)).toEqual([...STATUS_ORDEM_SVO_OCUPA_VAGA]);
  });
});
