import { db } from '../config/database';

export interface DocumentoComVencimento {
  id: number;
  tipo_documento: string;
  origem: 'VEICULO' | 'MOTORISTA';
  referencia_id: number;
  identificacao: string;
  data_vencimento: string;
  dias_para_vencimento: number;
}

export const documentoModel = {
  async listarVencimentos(): Promise<DocumentoComVencimento[]> {
    const resultado = await db.raw<{
      rows: DocumentoComVencimento[];
    }>(`
      SELECT
        dv.id,
        dv.tipo AS tipo_documento,
        'VEICULO' AS origem,
        dv.veiculo_id AS referencia_id,
        v.placa AS identificacao,
        dv.data_vencimento,
        (dv.data_vencimento - CURRENT_DATE)::int AS dias_para_vencimento
      FROM documentos_veiculo dv
      INNER JOIN veiculos v ON v.id = dv.veiculo_id

      UNION ALL

      SELECT
        m.id,
        'CNH' AS tipo_documento,
        'MOTORISTA' AS origem,
        m.id AS referencia_id,
        m.numero_cnh AS identificacao,
        m.validade_cnh AS data_vencimento,
        (m.validade_cnh - CURRENT_DATE)::int AS dias_para_vencimento
      FROM motoristas m

      ORDER BY data_vencimento ASC
    `);

    return resultado.rows;
  },
};