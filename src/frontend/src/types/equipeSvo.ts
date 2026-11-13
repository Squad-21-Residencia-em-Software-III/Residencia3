/**
 * Equipes do SVO (tabela `equipes_svo`, ver docs/dicionario-de-dados.md).
 *
 * CONTRATO PROVISÓRIO (SCRUM-145): ainda não existe `GET /equipes-svo` no backend.
 * `disponivel` é calculado pela API: equipe em escala (`escalas_svo`) e sem ordem
 * ativa (`ordens_svo` ALOCADA/EM_DESLOCAMENTO). Ajustar quando o endpoint real sair.
 */
export interface EquipeSvo {
  id: number;
  nome_equipe: string; // varchar(100)
  disponivel: boolean;
}
