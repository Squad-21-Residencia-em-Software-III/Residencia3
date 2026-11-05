import { PERFIS, type Perfil } from './perfis';

// Lista fixa de unidades (BL15); espelha os registros da tabela unidades
export const UNIDADES = {
  SVO: 'SVO',
  HEMOSE: 'HEMOSE',
  LACEN: 'LACEN',
} as const;

export type NomeUnidade = (typeof UNIDADES)[keyof typeof UNIDADES];

export type TipoUnidade = 'SVO' | 'ADMINISTRATIVA';

// Gestor de Frota gere todas as unidades; Gestor SVO apenas a unidade SVO
export const PERFIS_GESTORES_POR_UNIDADE: Record<NomeUnidade, Perfil[]> = {
  SVO: [PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO],
  HEMOSE: [PERFIS.GESTOR_FROTA],
  LACEN: [PERFIS.GESTOR_FROTA],
};

// Analisam qualquer solicitação, com ou sem associação (inclui unidades sem gestor)
export const PERFIS_ANALISAM_TODAS: Perfil[] = [PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA];

export function podeGerirUnidade(perfil: Perfil, unidade: NomeUnidade): boolean {
  return PERFIS_GESTORES_POR_UNIDADE[unidade].includes(perfil);
}

export function unidadesQuePodeGerir(perfil: Perfil): NomeUnidade[] {
  return (Object.keys(PERFIS_GESTORES_POR_UNIDADE) as NomeUnidade[]).filter((u) => podeGerirUnidade(perfil, u));
}
