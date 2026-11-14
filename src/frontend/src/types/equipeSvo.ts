/**
 * Equipes do SVO (tabela `equipes_svo`, ver docs/dicionario-de-dados.md).
 * Espelha GET /equipes-svo/disponibilidade (PR #116, contrato ainda sujeito a ajustes).
 */
export interface EquipeSvo {
  id: number;
  nome_equipe: string; // varchar(100)
}

/** Resposta de GET /equipes-svo/disponibilidade: somente equipes disponíveis no período. */
export interface DisponibilidadeEquipesSvo {
  periodo: { inicio: string; fim: string };
  equipes: EquipeSvo[];
}

/** Período consultado: datas ISO 8601 com fuso (ex.: 2026-11-13T21:00:00.000Z); fim > inicio. */
export interface PeriodoEquipesSvo {
  inicio: string;
  fim: string;
}
