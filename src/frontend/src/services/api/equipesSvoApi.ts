import type { DisponibilidadeEquipesSvo, EquipeSvo, PeriodoEquipesSvo } from '../../types/equipeSvo';
import { request } from './http';

/** Equipes do SVO. Somente Administrador e Gestor SVO (o backend responde 403 aos demais). */
export const equipesSvoApi = {
  listar: () => request<EquipeSvo[]>('GET', '/equipes-svo'),
  criar: (nome_equipe: string) => request<EquipeSvo>('POST', '/equipes-svo', { body: { nome_equipe } }),
  atualizar: (id: number, nome_equipe: string) => request<EquipeSvo>('PATCH', `/equipes-svo/${id}`, { body: { nome_equipe } }),
  /** Equipes sem reserva conflitante no período informado. */
  listarDisponiveis: ({ inicio, fim, ignorar_ordem_id }: PeriodoEquipesSvo) =>
    request<DisponibilidadeEquipesSvo>('GET', '/equipes-svo/disponibilidade', {
      query: { inicio, fim, ...(ignorar_ordem_id ? { ignorar_ordem_id } : {}) },
    }),
};
