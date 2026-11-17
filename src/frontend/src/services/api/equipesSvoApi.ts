import type { DisponibilidadeEquipesSvo, PeriodoEquipesSvo } from '../../types/equipeSvo';
import { request } from './http';

/** Equipes do SVO. Somente Administrador e Gestor SVO (o backend responde 403 aos demais). */
export const equipesSvoApi = {
  /** Equipes sem reserva conflitante no período informado. */
  listarDisponiveis: ({ inicio, fim, ignorar_ordem_id }: PeriodoEquipesSvo) =>
    request<DisponibilidadeEquipesSvo>('GET', '/equipes-svo/disponibilidade', {
      query: { inicio, fim, ...(ignorar_ordem_id ? { ignorar_ordem_id } : {}) },
    }),
};
