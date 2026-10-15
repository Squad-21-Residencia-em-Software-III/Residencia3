
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

export const veiculoModel = {
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
  }
};
