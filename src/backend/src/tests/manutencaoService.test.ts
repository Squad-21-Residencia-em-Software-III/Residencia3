import { beforeEach, describe, expect, it, vi } from 'vitest';

type EstadoTeste = {
  veiculo: any;
  outraManutencao: boolean;
  viagemEmAndamento: any;
  ordemEmAndamento: any;
  viagemAgendada: any;
  ordemAlocada: any;
  veiculoAtualizado: any;
  manutencaoCriada: any;
  manutencaoAtual: any;
};

const estado: EstadoTeste = {
  veiculo: undefined,
  outraManutencao: false,
  viagemEmAndamento: null,
  ordemEmAndamento: null,
  viagemAgendada: null,
  ordemAlocada: null,
  veiculoAtualizado: null,
  manutencaoCriada: null,
  manutencaoAtual: null,
};

const mockTrx = Object.assign(
  vi.fn((tabela: string) => {
    let whereClause: any = {};
    const builder: any = {
      where: (arg: any) => {
        whereClause = { ...whereClause, ...arg };
        return builder;
      },
      update: async (valores: any) => {
        if (tabela === 'veiculos') {
          estado.veiculoAtualizado = { ...valores };
        }
        return 1;
      },
      first: async () => {
        if (tabela === 'veiculos') {
          return estado.veiculo;
        }
        if (tabela === 'viagens_frota') {
          if (whereClause.status === 'EM_ANDAMENTO') {
            return estado.viagemEmAndamento;
          }
          if (whereClause.status === 'AGENDADA') {
            return estado.viagemAgendada;
          }
        }
        if (tabela === 'ordens_svo') {
          if (whereClause.status === 'EM_DESLOCAMENTO') {
            return estado.ordemEmAndamento;
          }
          if (whereClause.status === 'ALOCADA') {
            return estado.ordemAlocada;
          }
        }
        return null;
      },
    };
    return builder;
  }),
  {
    raw: vi.fn(),
  }
);

vi.mock('../config/database', () => ({
  db: Object.assign(
    vi.fn((tabela: string) => ({
      where: () => ({
        first: async () => {
          if (tabela === 'veiculos') return estado.veiculo;
          if (tabela === 'fornecedores') return { id: 1, nome: 'Oficina Central' };
          return null;
        },
      }),
    })),
    {
      transaction: vi.fn(async (cb: (trx: any) => Promise<any>) => cb(mockTrx)),
    }
  ),
}));

vi.mock('../models/manutencaoModel', () => ({
  manutencaoModel: {
    cadastrar: vi.fn(async (dados: any) => {
      estado.manutencaoCriada = { id: 10, ...dados };
      return estado.manutencaoCriada;
    }),
    buscarPorId: vi.fn(async (_id: number) => estado.manutencaoAtual),
    atualizar: vi.fn(async (_id: number, dados: any) => ({ ...estado.manutencaoAtual, ...dados })),
    atualizarStatus: vi.fn(async (_id: number, status: string) => ({ ...estado.manutencaoAtual, status })),
    excluir: vi.fn(async (_id: number) => true),
    temManutencaoEmAndamento: vi.fn(async () => estado.outraManutencao),
    temManutencaoAtiva: vi.fn(async () => estado.outraManutencao),
    listarPorVeiculo: vi.fn(async () => []),
  },
}));

vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: {
    registrar: vi.fn().mockResolvedValue(undefined),
  },
  MODULOS_AUDITORIA: {
    MANUTENCOES: 'MANUTENCOES',
  },
}));

import { manutencaoService, recalcularStatusVeiculo } from '../services/manutencaoService';
import { manutencaoModel } from '../models/manutencaoModel';

describe('manutencaoService e recalcularStatusVeiculo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.veiculo = { id: 1, placa: 'ABC-1234', status: 'MANUTENCAO' };
    estado.outraManutencao = false;
    estado.viagemEmAndamento = null;
    estado.ordemEmAndamento = null;
    estado.viagemAgendada = null;
    estado.ordemAlocada = null;
    estado.veiculoAtualizado = null;
    estado.manutencaoCriada = null;
    estado.manutencaoAtual = { id: 10, veiculo_id: 1, status: 'EM_ANDAMENTO' };
  });

  describe('recalcularStatusVeiculo', () => {
    it('NÃO deve alterar o status se o veículo estiver INATIVO', async () => {
      estado.veiculo = { id: 1, status: 'INATIVO' };

      await recalcularStatusVeiculo(mockTrx as any, 1);

      expect(estado.veiculoAtualizado).toBeNull();
    });

    it('deve manter ou atualizar para MANUTENCAO se houver outra manutenção em andamento', async () => {
      estado.veiculo = { id: 1, status: 'DISPONIVEL' };
      estado.outraManutencao = true;

      await recalcularStatusVeiculo(mockTrx as any, 1);

      expect(estado.veiculoAtualizado).toEqual({ status: 'MANUTENCAO' });
    });

    it('deve atualizar para EM_USO se houver viagem administrativa em andamento', async () => {
      estado.veiculo = { id: 1, status: 'MANUTENCAO' };
      estado.viagemEmAndamento = { id: 100, status: 'EM_ANDAMENTO' };

      await recalcularStatusVeiculo(mockTrx as any, 1);

      expect(estado.veiculoAtualizado).toEqual({ status: 'EM_USO' });
    });

    it('deve atualizar para EM_USO se houver ordem SVO em deslocamento', async () => {
      estado.veiculo = { id: 1, status: 'MANUTENCAO' };
      estado.ordemEmAndamento = { id: 200, status: 'EM_DESLOCAMENTO' };

      await recalcularStatusVeiculo(mockTrx as any, 1);

      expect(estado.veiculoAtualizado).toEqual({ status: 'EM_USO' });
    });

    it('deve atualizar para RESERVADO se houver viagem administrativa agendada', async () => {
      estado.veiculo = { id: 1, status: 'MANUTENCAO' };
      estado.viagemAgendada = { id: 300, status: 'AGENDADA' };

      await recalcularStatusVeiculo(mockTrx as any, 1);

      expect(estado.veiculoAtualizado).toEqual({ status: 'RESERVADO' });
    });

    it('deve atualizar para RESERVADO se houver ordem SVO alocada', async () => {
      estado.veiculo = { id: 1, status: 'MANUTENCAO' };
      estado.ordemAlocada = { id: 400, status: 'ALOCADA' };

      await recalcularStatusVeiculo(mockTrx as any, 1);

      expect(estado.veiculoAtualizado).toEqual({ status: 'RESERVADO' });
    });

    it('deve atualizar para DISPONIVEL se não houver impedimentos nem agendamentos', async () => {
      estado.veiculo = { id: 1, status: 'MANUTENCAO' };

      await recalcularStatusVeiculo(mockTrx as any, 1);

      expect(estado.veiculoAtualizado).toEqual({ status: 'DISPONIVEL' });
    });
  });

  describe('manutencaoService.atualizarStatus', () => {
    it('deve definir o veículo como RESERVADO ao concluir manutenção se houver viagem agendada', async () => {
      estado.veiculo = { id: 1, status: 'MANUTENCAO' };
      estado.viagemAgendada = { id: 50, status: 'AGENDADA' };

      await manutencaoService.atualizarStatus(10, 'CONCLUIDA', 1);

      expect(manutencaoModel.atualizarStatus).toHaveBeenCalledWith(10, 'CONCLUIDA', mockTrx);
      expect(estado.veiculoAtualizado).toEqual({ status: 'RESERVADO' });
    });

    it('deve definir o veículo como EM_USO ao concluir manutenção se houver viagem em andamento', async () => {
      estado.veiculo = { id: 1, status: 'MANUTENCAO' };
      estado.viagemEmAndamento = { id: 51, status: 'EM_ANDAMENTO' };

      await manutencaoService.atualizarStatus(10, 'CONCLUIDA', 1);

      expect(estado.veiculoAtualizado).toEqual({ status: 'EM_USO' });
    });

    it('deve preservar status INATIVO do veículo ao concluir manutenção', async () => {
      estado.veiculo = { id: 1, status: 'INATIVO' };

      await manutencaoService.atualizarStatus(10, 'CONCLUIDA', 1);

      expect(estado.veiculoAtualizado).toBeNull();
    });
  });

  describe('manutencaoService.excluir', () => {
    it('deve recalcular o status do veículo respeitando agendamentos após exclusão', async () => {
      estado.veiculo = { id: 1, status: 'MANUTENCAO' };
      estado.ordemAlocada = { id: 60, status: 'ALOCADA' };

      await manutencaoService.excluir(10, 1);

      expect(manutencaoModel.excluir).toHaveBeenCalledWith(10, mockTrx);
      expect(estado.veiculoAtualizado).toEqual({ status: 'RESERVADO' });
    });
  });
});

