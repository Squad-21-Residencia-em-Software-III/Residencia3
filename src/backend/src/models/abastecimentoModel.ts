
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

export interface AbastecimentoComPreco extends Abastecimento {
  preco_por_litro: number;
}

function calcularPrecoPorLitro(
  abastecimento: Abastecimento
): AbastecimentoComPreco {
  const litros = Number(abastecimento.litros);
  const valorTotal = Number(abastecimento.valor_total);

  return {
    ...abastecimento,
    preco_por_litro: Number(
      (valorTotal / litros).toFixed(3)
    ),
  };
}

export const abastecimentoModel = {
  async cadastrar(
    dados: NovoAbastecimento,
    trx?: Knex.Transaction
  ): Promise<AbastecimentoComPreco> {
    const conexao = trx || db;

    const [abastecimento] = await conexao('abastecimentos')
      .insert(dados)
      .returning('*');

    return calcularPrecoPorLitro(abastecimento);
  },

  async listarPorVeiculo(
    veiculoId: number
  ): Promise<AbastecimentoComPreco[]> {
    const abastecimentos: Abastecimento[] = await db('abastecimentos')
      .where({ veiculo_id: veiculoId })
      .orderBy('data_abastecimento', 'desc');

    return abastecimentos.map(calcularPrecoPorLitro);
  },
};
  