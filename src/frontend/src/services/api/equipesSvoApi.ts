import type { DisponibilidadeEquipesSvo, PeriodoEquipesSvo } from '../../types/equipeSvo';
import { request } from './http';

/** Equipes do SVO. Somente Administrador e Gestor SVO (o backend responde 403 aos demais). */
export const equipesSvoApi = {
  /** Equipes escaladas para todo o período e sem ordem ativa (ALOCADA/EM_DESLOCAMENTO). */
  listarDisponiveis: ({ inicio, fim }: PeriodoEquipesSvo) =>
    request<DisponibilidadeEquipesSvo>('GET', '/equipes-svo/disponibilidade', {
      query: { inicio, fim },
    }),
};
