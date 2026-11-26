import { describe, expect, it, vi } from 'vitest';
import type { Knex } from 'knex';
import { buscarVinculosViagemAdministrativa, buscarDestinatariosViagemAdministrativa } from '../services/avisosViagem';

function criarTransacaoSimulada(resultado: unknown) {
  const consulta = {
    join: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(resultado),
  };

  const executar = vi.fn().mockReturnValue(consulta);
  const trx = executar as unknown as Knex.Transaction;

  return { trx, consulta, executar };
}

describe('Avisos de viagens administrativas A5-A8', () => {
  describe('buscarVinculosViagemAdministrativa', () => {
    it('identifica o usuario do motorista e o solicitante', async () => {
      const { trx, consulta, executar } = criarTransacaoSimulada({
        motoristaUsuarioId: 12,
        solicitanteUsuarioId: 25,
        unidadeId: 3,
      });

      const resultado = await buscarVinculosViagemAdministrativa(trx, 50);

      expect(resultado).toEqual({
        motoristaUsuarioId: 12,
        solicitanteUsuarioId: 25,
        unidadeId: 3,
      });

      expect(executar).toHaveBeenCalledWith('viagens_frota as vf');
      expect(consulta.join).toHaveBeenCalledWith(
        'motoristas as m',
        'm.id',
        'vf.motorista_id'
      );
      expect(consulta.join).toHaveBeenCalledWith(
        'solicitacoes_viagem as sv',
        'sv.id',
        'vf.solicitacao_id'
      );
      expect(consulta.where).toHaveBeenCalledWith('vf.id', 50);
    });

    it('rejeita uma viagem administrativa inexistente', async () => {
      const { trx } = criarTransacaoSimulada(undefined);

      await expect(
        buscarVinculosViagemAdministrativa(trx, 999)
      ).rejects.toThrow('Viagem administrativa nao encontrada');
    });
  });
});

function criarTransacaoDestinatarios(
  vinculos: {
    motoristaUsuarioId: number;
    solicitanteUsuarioId: number;
    unidadeId: number | null;
  },
  usuarios: { id: number; perfil: string; ativo: boolean }[],
  gestores: number[]
) {
  const consultaViagem = {
    join: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(vinculos),
  };

  const consultaUsuarios = {
    whereIn: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(
      usuarios.filter((usuario) => usuario.ativo)
    ),
  };

  const consultaGestores = {
    where: vi.fn().mockReturnThis(),
    pluck: vi.fn().mockResolvedValue(gestores),
  };

  const executar = vi.fn((tabela: string) => {
    if (tabela === 'viagens_frota as vf') return consultaViagem;
    if (tabela === 'usuarios') {
      return executar.mock.calls.filter(
        ([nome]) => nome === 'usuarios'
      ).length === 1
        ? consultaUsuarios
        : consultaGestores;
    }
    throw new Error(`Tabela inesperada: ${tabela}`);
  });

  return {
    trx: executar as unknown as Knex.Transaction,
    consultaUsuarios,
    consultaGestores,
    executar,
  };
}

describe('buscarDestinatariosViagemAdministrativa', () => {
  it('seleciona motorista, solicitante e gestores ativos', async () => {
    const { trx } = criarTransacaoDestinatarios(
      {
        motoristaUsuarioId: 12,
        solicitanteUsuarioId: 25,
        unidadeId: 3,
      },
      [
        { id: 12, perfil: 'MOTORISTA_FROTA', ativo: true },
        { id: 25, perfil: 'SOLICITANTE', ativo: true },
      ],
      [30, 31]
    );

    const resultado = await buscarDestinatariosViagemAdministrativa(trx, 50);

    expect(resultado).toEqual({
      motorista: [12],
      solicitante: [25],
      gestores: [30, 31],
    });
  });
});


describe('Restricoes de destinatarios administrativos', () => {
  it('exclui motorista inativo e solicitante com perfil incompatível', async () => {
    const { trx, consultaUsuarios } = criarTransacaoDestinatarios(
      {
        motoristaUsuarioId: 12,
        solicitanteUsuarioId: 25,
        unidadeId: 3,
      },
      [
        { id: 12, perfil: 'MOTORISTA_FROTA', ativo: false },
        { id: 25, perfil: 'MOTORISTA_SVO', ativo: true },
      ],
      []
    );

    const resultado = await buscarDestinatariosViagemAdministrativa(trx, 50);

    expect(resultado).toEqual({
      motorista: [],
      solicitante: [],
      gestores: [],
    });

    expect(consultaUsuarios.where).toHaveBeenCalledWith({ ativo: true });
  });
});
