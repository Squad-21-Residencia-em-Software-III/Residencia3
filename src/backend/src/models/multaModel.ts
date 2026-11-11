import type { Knex } from 'knex';
import { db } from '../config/database';

// Espelha a constraint chk_multas_status_pagamento
export const STATUS_PAGAMENTO_MULTA = ['PENDENTE', 'PAGO', 'CANCELADO'] as const;

export type StatusPagamentoMulta = (typeof STATUS_PAGAMENTO_MULTA)[number];

export interface NovaMulta {
  veiculo_id: number;
  motorista_id?: number | null;
  data_infracao: string;
  valor: number;
  descricao?: string | null;
  pontos: number;
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

  async atualizar(
    id: number,
    dados: Partial<NovaMulta>,
    trx?: Knex.Transaction
  ): Promise<Multa | undefined> {
    const conexao = trx || db;
    const [atualizada] = await conexao('multas')
      .where({ id })
      .update(dados)
      .returning('*');

    return atualizada ? normalizar(atualizada) : undefined;
  },

  async excluir(id: number, trx?: Knex.Transaction): Promise<boolean> {
    const conexao = trx || db;
    const rows = await conexao('multas').where({ id }).delete();
    return rows > 0;
  },

  async listar(): Promise<Multa[]> {
    const multas: Multa[] = await db('multas')
      .select('*')
      .orderBy('data_infracao', 'desc');

    return multas.map(normalizar);
  },
};
