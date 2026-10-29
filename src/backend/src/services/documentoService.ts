import {
  documentoModel,
  type DocumentoComVencimento,
} from '../models/documentoModel';

export type StatusVencimento =
  | 'VENCIDO'
  | 'PROXIMO_VENCIMENTO'
  | 'VALIDO';

export interface DocumentoComAlerta extends DocumentoComVencimento {
  status_vencimento: StatusVencimento;
}

const DIAS_ALERTA_VENCIMENTO = 30;

function definirStatus(dias: number): StatusVencimento {
  if (dias < 0) {
    return 'VENCIDO';
  }

  if (dias <= DIAS_ALERTA_VENCIMENTO) {
    return 'PROXIMO_VENCIMENTO';
  }

  return 'VALIDO';
}

export const documentoService = {
  async listarVencimentos(): Promise<DocumentoComAlerta[]> {
    const documentos = await documentoModel.listarVencimentos();

    return documentos.map((documento) => ({
      ...documento,
      dias_para_vencimento: Number(documento.dias_para_vencimento),
      status_vencimento: definirStatus(
        Number(documento.dias_para_vencimento)
      ),
    }));
  },
};