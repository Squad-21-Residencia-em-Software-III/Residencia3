import type { Knex } from 'knex';
import { db } from '../config/database';

export type StatusMotorista = 'DISPONIVEL' | 'EM_VIAGEM' | 'INATIVO' | 'AFASTADO' | 'DESIGNADO';

export interface Motorista {
  id: number;
  usuario_id: number;
  numero_cnh: string;
  categoria_cnh: string;
  validade_cnh: string;
  tipo_motorista: 'FROTA' | 'SVO';
  status: StatusMotorista;
}

export const motoristaModel = {
  buscarPorId(id: number, trx?: Knex.Transaction): Promise<Motorista | undefined> {
    const conexao = trx || db;
    return conexao('motoristas').where({ id }).first();
  },

  async atualizarStatus(id: number, status: StatusMotorista, trx?: Knex.Transaction): Promise<void> {
    const conexao = trx || db;
    await conexao('motoristas').where({ id }).update({ status });
  },
};