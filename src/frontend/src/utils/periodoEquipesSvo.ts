import type { PeriodoEquipesSvo } from '../types/equipeSvo';

/**
 * DECISÃO PENDENTE (SCRUM-145, revisão do PR #117): não existe regra aprovada para o período da
 * consulta de disponibilidade de equipes. O backend (PR #116) só exige `inicio` e `fim`; considera
 * disponível a equipe cuja escala cobre o período inteiro e que não tem ordem ativa. A ordem SVO
 * não tem período próprio e a duração de uma coleta não está definida na documentação.
 *
 * Enquanto o time (responsáveis pelo PR #116 e pela SCRUM-105) não definir o critério, o valor
 * abaixo é apenas uma estimativa provisória e NÃO deve ser tratado como regra de negócio.
 * Quando houver decisão, a mudança fica concentrada neste arquivo.
 */
export const DURACAO_ESTIMADA_COLETA_MINUTOS = 60;

export function periodoConsultaEquipes(agora: Date = new Date()): PeriodoEquipesSvo {
  const fim = new Date(agora.getTime() + DURACAO_ESTIMADA_COLETA_MINUTOS * 60_000);
  return { inicio: agora.toISOString(), fim: fim.toISOString() };
}
