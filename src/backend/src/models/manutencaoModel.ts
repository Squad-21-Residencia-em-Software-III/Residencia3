import type { Knex } from 'knex';
import { db } from '../config/database';

export interface NovaManutencao {
  veiculo_id: number;
  fornecedor_id?: number | null;
  tipo_manutencao: 'PREVENTIVA' | 'CORRETIVA';
  data_manutencao: string;
  descricao: string;
  custo: number;
  status: 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA';
}

export interface Manutencao extends NovaManutencao {
  id: number;
}

export interface ManutencaoDetalhada extends Manutencao {
  veiculo_placa?: string;
  veiculo_modelo?: string;
  fornecedor_nome?: string;
}

export const manutencaoModel = {
  async cadastrar(
    dados: NovaManutencao,
    trx?: Knex.Transaction
  ): Promise<Manutencao> {
    const conexao = trx || db;

    const [manutencao] = await conexao('manutencoes')
      .insert(dados)
      .returning('*');

    return {
      ...manutencao,
      custo: Number(manutencao.custo),
    };
  },

  async listarPorVeiculo(
    veiculoId: number
  ): Promise<ManutencaoDetalhada[]> {
    const registros = await db('manutencoes')
      .leftJoin('fornecedores', 'manutencoes.fornecedor_id', 'fornecedores.id')
      .leftJoin('veiculos', 'manutencoes.veiculo_id', 'veiculos.id')
      .where('manutencoes.veiculo_id', veiculoId)
      .select(
        'manutencoes.*',
        'veiculos.placa as veiculo_placa',
        'veiculos.modelo as veiculo_modelo',
        'fornecedores.nome as fornecedor_nome'
      )
      .orderBy('manutencoes.data_manutencao', 'desc')
      .orderBy('manutencoes.id', 'desc');

    return registros.map((r) => ({
      ...r,
      custo: Number(r.custo),
    }));
  },

  async buscarPorId(
    id: number,
    trx?: Knex.Transaction
  ): Promise<ManutencaoDetalhada | undefined> {
    const conexao = trx || db;
    const registro = await conexao('manutencoes')
      .leftJoin('fornecedores', 'manutencoes.fornecedor_id', 'fornecedores.id')
      .leftJoin('veiculos', 'manutencoes.veiculo_id', 'veiculos.id')
      .where('manutencoes.id', id)
      .select(
        'manutencoes.*',
        'veiculos.placa as veiculo_placa',
        'veiculos.modelo as veiculo_modelo',
        'fornecedores.nome as fornecedor_nome'
      )
      .first();

    if (!registro) return undefined;

    return {
      ...registro,
      custo: Number(registro.custo),
    };
  },

  async atualizarStatus(
    id: number,
    status: 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA',
    trx?: Knex.Transaction
  ): Promise<Manutencao | undefined> {
    const conexao = trx || db;
    const [atualizado] = await conexao('manutencoes')
      .where({ id })
      .update({ status })
      .returning('*');

    if (!atualizado) return undefined;

    return {
      ...atualizado,
      custo: Number(atualizado.custo),
    };
  },

  async temManutencaoEmAndamento(
    veiculoId: number,
    excluirId?: number,
    trx?: Knex.Transaction
  ): Promise<boolean> {
    const conexao = trx || db;
    const query = conexao('manutencoes')
      .where({ veiculo_id: veiculoId, status: 'EM_ANDAMENTO' });

    if (excluirId) {
      query.whereNot({ id: excluirId });
    }

    const registro = await query.first();
    return !!registro;
  },
};

