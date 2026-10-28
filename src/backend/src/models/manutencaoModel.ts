import type { Knex } from 'knex';
import { db } from '../config/database';

export type TipoManutencao = 'PREVENTIVA' | 'CORRETIVA';
export type StatusManutencao = 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';

export interface NovaManutencao {
  veiculo_id: number;
  fornecedor_id?: number | null;
  tipo_manutencao: TipoManutencao;
  data_manutencao: string;
  descricao?: string | null;
  custo?: number | null;
  status?: StatusManutencao;
}

export interface Manutencao extends NovaManutencao {
  id: number;
  status: StatusManutencao;
}

export interface ManutencaoDetalhada extends Manutencao {
  veiculo_placa?: string;
  veiculo_modelo?: string;
  fornecedor_nome?: string;
}

// O PostgreSQL devolve colunas do tipo decimal/numeric como string, convertemos para number
function normalizar<T extends { custo?: any }>(manutencao: T): T {
  return {
    ...manutencao,
    custo: manutencao.custo !== undefined && manutencao.custo !== null ? Number(manutencao.custo) : 0,
  };
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

    return normalizar(manutencao);
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

    return registros.map(normalizar);
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

    return normalizar(registro);
  },

  async atualizarStatus(
    id: number,
    status: StatusManutencao,
    trx?: Knex.Transaction
  ): Promise<Manutencao | undefined> {
    const conexao = trx || db;
    const [atualizado] = await conexao('manutencoes')
      .where({ id })
      .update({ status })
      .returning('*');

    if (!atualizado) return undefined;

    return normalizar(atualizado);
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