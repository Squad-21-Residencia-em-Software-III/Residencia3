import type { PeriodoEquipesSvo } from '../types/equipeSvo';

/**
 * Janela mínima enviada à API de disponibilidade (PR #116, BL29 / SCRUM-104).
 *
 * O backend só suporta, por enquanto, a consulta operacional imediata: o `inicio` precisa estar
 * próximo do horário atual (tolerância de 15 min), pois as ordens SVO ativas ainda não têm
 * previsão de término (SCRUM-166). Por isso o intervalo enviado representa a verificação da
 * escala vigente NO MOMENTO da alocação e NÃO uma duração de coleta: a janela existe apenas
 * porque a API exige `fim > inicio`.
 *
 * Consequência: a lista de equipes não garante disponibilidade durante uma coleta futura.
 * Quando a SCRUM-166 trouxer início e término previstos informados pelo gestor, este período
 * deve passar a vir desses campos.
 */
export const JANELA_CONSULTA_IMEDIATA_MS = 60_000;

export function periodoConsultaEquipes(agora: Date = new Date()): PeriodoEquipesSvo {
  const fim = new Date(agora.getTime() + JANELA_CONSULTA_IMEDIATA_MS);
  return { inicio: agora.toISOString(), fim: fim.toISOString() };
}
