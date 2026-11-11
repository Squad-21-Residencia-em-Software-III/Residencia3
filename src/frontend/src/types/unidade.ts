/**
 * Unidades e associação de gestores (BL15).
 * Espelha o backend: models/unidadeModel.ts e constants/unidades.ts.
 */
import { PERFIS, type Perfil } from './usuario';

export type NomeUnidade = 'SVO' | 'HEMOSE' | 'LACEN';

export type TipoUnidade = 'SVO' | 'ADMINISTRATIVA';

export const LABELS_TIPO_UNIDADE: Record<TipoUnidade, string> = {
  SVO: 'SVO',
  ADMINISTRATIVA: 'Administrativa',
};

/** Perfis que podem ser associados a cada unidade (o backend recusa os demais com 400). */
export const PERFIS_GESTORES_POR_UNIDADE: Record<NomeUnidade, Perfil[]> = {
  SVO: [PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO],
  HEMOSE: [PERFIS.GESTOR_FROTA],
  LACEN: [PERFIS.GESTOR_FROTA],
};

/** Todos os perfis que podem gerir alguma unidade. */
export const PERFIS_CANDIDATOS_GESTOR: Perfil[] = Array.from(
  new Set(Object.values(PERFIS_GESTORES_POR_UNIDADE).flat()),
);

export interface GestorAssociado {
  id: number;
  nome: string;
  email: string;
  ativo: boolean;
}

/** Retorno de GET /unidades (opções para a solicitação de viagem). */
export interface Unidade {
  id: number;
  nome: NomeUnidade;
  tipo: TipoUnidade;
}

/** Retorno de GET /unidades/gestores e do POST de associação. Lista vazia = unidade sem gestor. */
export interface UnidadeComGestores extends Unidade {
  gestores: GestorAssociado[];
}
