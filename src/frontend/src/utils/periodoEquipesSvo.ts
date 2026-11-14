import type { PeriodoEquipesSvo } from '../types/equipeSvo';

/**
 * A ordem SVO é atendida no mesmo dia e não tem período próprio. A disponibilidade das
 * equipes é consultada de agora até agora + esta duração estimada da coleta.
 * Valor provisório: confirmar com a equipe de backend (PR #116 / SCRUM-105).
 */
export const DURACAO_ESTIMADA_COLETA_MINUTOS = 60;

export function periodoConsultaEquipes(agora: Date = new Date()): PeriodoEquipesSvo {
  const fim = new Date(agora.getTime() + DURACAO_ESTIMADA_COLETA_MINUTOS * 60_000);
  return { inicio: agora.toISOString(), fim: fim.toISOString() };
}
