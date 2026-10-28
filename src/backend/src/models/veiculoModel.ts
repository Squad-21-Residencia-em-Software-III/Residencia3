import type { Knex } from 'knex';
import { db } from '../config/database';

export type StatusVeiculo = 'DISPONIVEL' | 'EM_USO' | 'MANUTENCAO' | 'RESERVADO';

export interface VeiculoSvoDisponivel {
  id: number;
  placa: string;
  modelo: string;
  capacidade_maxima: number;
  status: string;
  capacidade_utilizada: number;
  vagas_disponiveis: number;
}

export interface NovoVeiculo {
  placa: string;
  modelo: string;
  tipo_frota: 'ADMINISTRATIVA' | 'SVO';
  capacidade_maxima: number;
  km_atual: number;
}

export interface Veiculo extends NovoVeiculo {
  id: number;
  status: StatusVeiculo;
}

export const veiculoModel = {
  listarVeiculos(): Promise<Veiculo[]> {
    return db('veiculos')
      .select('id', 'placa', 'modelo', 'tipo_frota', 'capacidade_maxima', 'km_atual', 'status')
      .orderBy('id', 'asc');
  },

  buscarPorPlaca(placa: string, trx?: Knex.Transaction): Promise<Veiculo | undefined> {
    const conexao = trx || db;
    return conexao('veiculos').where({ placa }).first();
  },

  buscarPorId(id: number, trx?: Knex.Transaction): Promise<Veiculo | undefined> {
    const conexao = trx || db;
    return conexao('veiculos').where({ id }).first();
  },

  async cadastrarVeiculo(dados: NovoVeiculo, trx?: Knex.Transaction): Promise<Veiculo> {
    const conexao = trx || db;
    const [veiculo] = await conexao('veiculos')
      .insert(dados)
      .returning(['id', 'placa', 'modelo', 'tipo_frota', 'capacidade_maxima', 'km_atual', 'status']);

    return veiculo;
  },

  async atualizarStatus(id: number, status: StatusVeiculo, trx?: Knex.Transaction): Promise<void> {
    const conexao = trx || db;
    await conexao('veiculos').where({ id }).update({ status });
  },

  listarSvoDisponiveis(): Promise<VeiculoSvoDisponivel[]> {
    return db.raw<{ rows: VeiculoSvoDisponivel[] }>(`
      SELECT
        v.id,
        v.placa,
        v.modelo,
        v.capacidade_maxima,
        v.status,
        COALESCE(SUM(o.capacidade_utilizada), 0)::integer AS capacidade_utilizada,
        (
          v.capacidade_maxima -
          COALESCE(SUM(o.capacidade_utilizada), 0)
        )::integer AS vagas_disponiveis
      FROM veiculos v
      LEFT JOIN ordens_svo o
        ON o.veiculo_id = v.id
        AND o.data_hora_conclusao IS NULL
      WHERE v.tipo_frota = 'SVO'
        AND v.status = 'DISPONIVEL'
        AND v.capacidade_maxima > 0
      GROUP BY
        v.id,
        v.placa,
        v.modelo,
        v.capacidade_maxima,
        v.status
      HAVING v.capacidade_maxima >
        COALESCE(SUM(o.capacidade_utilizada), 0)
      ORDER BY v.id
    `).then((r) => r.rows);
  },
};