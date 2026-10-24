
import type { Knex } from 'knex';
import { db } from '../config/database';

export interface NovoAbastecimento {
  veiculo_id: number;
  motorista_id: number;
 fornecedor_id?: number | null;
  data_abastecimento: string;
  quilometragem: number;
  litros: number;
  valor_total: number;
  posto_combustivel?: string;
}

export interface Abastecimento extends NovoAbastecimento {
  id: number;
}

export const abastecimentoModel = {
  async cadastrar(
    dados: NovoAbastecimento,
    trx?: Knex.Transaction
  ): Promise<Abastecimento> {
    const conexao = trx || db;

    const [abastecimento] = await conexao('abastecimentos')
      .insert(dados)
      .returning('*');

    return abastecimento;
  },

  async listarPorVeiculo(
    veiculoId: number
  ): Promise<Abastecimento[]> {
    return db('abastecimentos')
      .where({ veiculo_id: veiculoId })
      .orderBy('data_abastecimento', 'desc');
  },
};
