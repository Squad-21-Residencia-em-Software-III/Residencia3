import { request } from './http';

export type StatusVencimento = 'VENCIDO' | 'PROXIMO_VENCIMENTO' | 'VALIDO';

export interface DocumentoComAlerta {
  id: number;
  entidade_tipo: 'MOTORISTA' | 'VEICULO';
  entidade_id: number;
  tipo_documento: string;
  data_vencimento: string;
  dias_para_vencimento: number;
  status_vencimento: StatusVencimento;
  numero?: string;
}

export const documentosApi = {
  listarVencimentos: () =>
    request<DocumentoComAlerta[]>('GET', '/documentos/vencimentos'),
};

