import { db } from '../config/database';

export interface DocumentoComVencimento {
  // Chave única entre as origens (ex.: VEICULO-3, MOTORISTA-3)
  id: string;
  documento_id: number;
  tipo_documento: string;
  origem: 'VEICULO' | 'MOTORISTA';
  referencia_id: number;
  identificacao: string;
  // AAAA-MM-DD
  data_vencimento: string;
  dias_para_vencimento: number;
}

export const documentoModel = {
  async listarVencimentos(): Promise<DocumentoComVencimento[]> {
    // A data é formatada no SQL porque o pg converte DATE em Date com fuso,
    // o que serializa como ISO e pode deslocar o dia no front
    const resultado = await db.raw<{
      rows: DocumentoComVencimento[];
    }>(`
      SELECT
        documentos.origem || '-' || documentos.documento_id AS id,
        documentos.documento_id,
        documentos.tipo_documento,
        documentos.origem,
        documentos.referencia_id,
        documentos.identificacao,
        to_char(documentos.data_vencimento, 'YYYY-MM-DD') AS data_vencimento,
        (documentos.data_vencimento - CURRENT_DATE)::int AS dias_para_vencimento
      FROM (
        SELECT
          dv.id AS documento_id,
          dv.tipo AS tipo_documento,
          'VEICULO' AS origem,
          dv.veiculo_id AS referencia_id,
          v.placa AS identificacao,
          dv.data_vencimento
        FROM documentos_veiculo dv
        INNER JOIN veiculos v ON v.id = dv.veiculo_id

        UNION ALL

        SELECT
          m.id AS documento_id,
          'CNH' AS tipo_documento,
          'MOTORISTA' AS origem,
          m.id AS referencia_id,
          m.numero_cnh AS identificacao,
          m.validade_cnh AS data_vencimento
        FROM motoristas m
      ) AS documentos
      ORDER BY documentos.data_vencimento ASC, id ASC
    `);

    return resultado.rows;
  },
};
