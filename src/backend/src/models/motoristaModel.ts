import type { Knex } from 'knex';
import { db } from '../config/database';
import type { ListarMotoristasFiltros } from '../validators/motoristaSchemas';

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

export interface MotoristaComNome extends Motorista {
  nome: string;
}

export const motoristaModel = {
  async listar(filtros: ListarMotoristasFiltros): Promise<MotoristaComNome[]> {
    const consulta = db('motoristas as m')
      .leftJoin('usuarios as u', 'u.id', 'm.usuario_id')
      .select(
        'm.id',
        'm.usuario_id',
        'u.nome',
        'm.numero_cnh',
        'm.categoria_cnh',
        // Mantém a data no formato AAAA-MM-DD, sem conversão de fuso
        db.raw("to_char(m.validade_cnh, 'YYYY-MM-DD') as validade_cnh"),
        'm.tipo_motorista',
        'm.status'
      )
      .orderBy('u.nome', 'asc');

    if (filtros.status) {
      consulta.where('m.status', filtros.status);
    }
    if (filtros.tipo_motorista) {
      consulta.where('m.tipo_motorista', filtros.tipo_motorista);
    }

    return consulta;
  },

  buscarPorId(id: number, trx?: Knex.Transaction): Promise<Motorista | undefined> {
    const conexao = trx || db;
    return conexao('motoristas').where({ id }).first();
  },

  async atualizarStatus(id: number, status: StatusMotorista, trx?: Knex.Transaction): Promise<void> {
    const conexao = trx || db;
    await conexao('motoristas').where({ id }).update({ status });
  },
};
