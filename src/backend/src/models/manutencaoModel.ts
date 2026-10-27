import type { Knex } from 'knex';
import { db } from '../config/database';

export type TipoManutencao = 'PREVENTIVA' | 'CORRETIVA';
export type StatusManutencao = 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA';

export interface NovaManutencao {
  veiculo_id: number;
  fornecedor_id?: number | null;
  tipo_manutencao: TipoManutencao;
  data_manutencao: string;
  descricao: string;
  custo: number;
  status?: StatusManutencao;
}

export interface Manutencao extends NovaManutencao {
  id: number;
  status: StatusManutencao;
}

// O pg devolve colunas decimal como string
function normalizar(manutencao: Manutencao): Manutencao {
  return { ...manutencao, custo: Number(manutencao.custo) };
}

export const manutencaoModel = {
  async cadastrar(dados: NovaManutencao, trx?: Knex.Transaction): Promise<Manutencao> {
    const conexao = trx || db;
    const [manutencao] = await conexao('manutencoes').insert(dados).returning('*');

    return normalizar(manutencao);
  },

  async listarPorVeiculo(veiculoId: number): Promise<Manutencao[]> {
    const manutencoes: Manutencao[] = await db('manutencoes')
      .where({ veiculo_id: veiculoId })
      .orderBy([
        { column: 'data_manutencao', order: 'desc' },
        { column: 'id', order: 'desc' },
      ]);

    return manutencoes.map(normalizar);
  },
};
