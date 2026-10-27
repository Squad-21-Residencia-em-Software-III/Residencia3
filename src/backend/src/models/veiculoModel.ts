import type { Knex } from 'knex';
import { db } from '../config/database';

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
}

export interface Veiculo extends NovoVeiculo {
  id: number;
  status: string;
}

export const veiculoModel = {
  // Modificado para aceitar o filtro de status que você precisa na interface
  async listarVeiculos(statusFiltro?: string): Promise<Veiculo[]> {
    const query = db('veiculos')
      .select('id', 'placa', 'modelo', 'tipo_frota', 'capacidade_maxima', 'status');

    if (statusFiltro && statusFiltro !== 'TODOS') {
      query.where({ status: statusFiltro });
    }

    return query.orderBy('id', 'asc');
  },

  async buscarPorPlaca(placa: string, trx?: Knex.Transaction): Promise<Veiculo | undefined> {
    const conexao = trx || db;
    return conexao('veiculos').where({ placa }).first();
  },

  // Adicionado: Busca por ID direta, essencial para validar a existência na viagem
  async buscarPorId(id: number, trx?: Knex.Transaction): Promise<Veiculo | undefined> {
    const conexao = trx || db;
    return conexao('veiculos').where({ id }).first();
  },

  async cadastrarVeiculo(dados: NovoVeiculo, trx?: Knex.Transaction): Promise<Veiculo> {
    const conexao = trx || db;
    const [veiculo] = await conexao('veiculos')
      .insert(dados)
      .returning(['id', 'placa', 'modelo', 'tipo_frota', 'capacidade_maxima', 'status']);

    return veiculo;
  },

  // Adicionado: Função crucial para a sincronização das viagens e manutenções
  async atualizarStatus(id: number, status: string, trx?: Knex.Transaction): Promise<void> {
    const conexao = trx || db;
    await conexao('veiculos').where({ id }).update({ status });
  },

  async listarSvoDisponiveis(): Promise<VeiculoSvoDisponivel[]> {
    const resultado = await db.raw<{ rows: VeiculoSvoDisponivel[] }>(`
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
    `);

    return resultado.rows;
  },
};
