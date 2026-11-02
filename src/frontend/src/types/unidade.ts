/**
 * Associação entre gestores e unidades (BL15 / SCRUM-142).
 *
 * ATENÇÃO — CONTRATO PROVISÓRIO: a regra da SCRUM-81 e a API da SCRUM-82 ainda não
 * foram confirmadas. Estes tipos refletem apenas o que o card pede (unidades SVO e
 * ADMINISTRATIVO — HEMOSE/LACEN — e gestores associados). Ajustar aqui quando a regra
 * for fechada; nada neste arquivo deve ser tratado como regra de negócio aprovada.
 */

export type TipoUnidade = 'SVO' | 'ADMINISTRATIVA';

export const LABELS_TIPO_UNIDADE: Record<TipoUnidade, string> = {
  SVO: 'SVO',
  ADMINISTRATIVA: 'Administrativa',
};

export interface GestorAssociado {
  id: number;
  nome: string;
  email: string;
  ativo: boolean;
}

export interface Unidade {
  id: number;
  nome: string; // ex.: SVO, HEMOSE, LACEN (vem da API, não é fixado no front)
  tipo: TipoUnidade;
  gestores: GestorAssociado[]; // lista vazia = unidade sem gestor associado
}
