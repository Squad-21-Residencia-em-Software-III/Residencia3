import type { Knex } from 'knex';
import { db } from '../config/database';

export type StatusPagamentoMulta = 'PENDENTE' | 'PAGA';

export interface NovaMulta {
  veiculo_id: number;
  motorista_id?: number | null;
  data_infracao: string;
  valor: number;
  descricao?: string | null;
  pontos?: number | null;
  status_pagamento?: StatusPagamentoMulta;
  data_vencimento?: string | null;
  id_infracao?: string | null;
  orgao_autuador?: string | null;
}

export interface Multa extends NovaMulta {
  id: number;
  status_pagamento: StatusPagamentoMulta;
}

function normalizar(multa: Multa): Multa {
  return {
    ...multa,
    valor: Number(multa.valor),
  };
}

export const multaModel = {
  async cadastrar(dados: NovaMulta, trx?: Knex.Transaction): Promise<Multa> {
    const conexao = trx || db;

    const [multa] = await conexao('multas')
      .insert(dados)
      .returning('*');

    return normalizar(multa);
  },

  async buscarPorId(id: number): Promise<Multa | undefined> {
    const multa = await db('multas').where({ id }).first();

    return multa ? normalizar(multa) : undefined;
  },

  async listar(): Promise<Multa[]> {
    const multas: Multa[] = await db('multas')
      .select('*')
      .orderBy('data_infracao', 'desc');

    return multas.map(normalizar);
  },
};