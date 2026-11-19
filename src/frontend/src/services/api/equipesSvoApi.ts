import type { DisponibilidadeEquipesSvo, EquipeSvo, PeriodoEquipesSvo } from '../../types/equipeSvo';
import { request } from './http';

export interface IntegranteSvo { id: number; nome: string; email: string }

/** Equipes do SVO. Somente Administrador e Gestor SVO (o backend responde 403 aos demais). */
export const equipesSvoApi = {
  listar: () => request<EquipeSvo[]>('GET', '/equipes-svo'),
  criar: (nome_equipe: string) => request<EquipeSvo>('POST', '/equipes-svo', { body: { nome_equipe } }),
  atualizar: (id: number, nome_equipe: string) => request<EquipeSvo>('PATCH', `/equipes-svo/${id}`, { body: { nome_equipe } }),
  integrantes: () => request<IntegranteSvo[]>('GET', '/equipes-svo/integrantes'),
  criarIntegrante: (dados: { nome: string; email: string; senha: string }) => request<IntegranteSvo>('POST', '/equipes-svo/integrantes', { body: dados }),
  atualizarIntegrante: (id: number, dados: { nome: string; email: string }) => request<IntegranteSvo>('PATCH', `/equipes-svo/integrantes/${id}`, { body: dados }),
  designacoes: (id: number) => request<{ equipe_id: number | null; iniciada: boolean; integrantes_ids: number[] }>('GET', `/viagens/ordens-svo/${id}/designacoes`),
  integrantesEquipe: (id: number) => request<IntegranteSvo[]>('GET', `/equipes-svo/${id}/integrantes`),
  disponibilidadeIntegrantes: (id: number, periodo: PeriodoEquipesSvo) => request<(IntegranteSvo & { disponivel: boolean })[]>('GET', `/equipes-svo/${id}/integrantes/disponibilidade`, { query: { ...periodo } }),
  vincular: (id: number, usuarioId: number) => request<void>('PUT', `/equipes-svo/${id}/integrantes/${usuarioId}`),
  desvincular: (id: number, usuarioId: number) => request<void>('DELETE', `/equipes-svo/${id}/integrantes/${usuarioId}`),
  /** Equipes sem reserva conflitante no período informado. */
  listarDisponiveis: ({ inicio, fim, ignorar_ordem_id }: PeriodoEquipesSvo) =>
    request<DisponibilidadeEquipesSvo>('GET', '/equipes-svo/disponibilidade', {
      query: { inicio, fim, ...(ignorar_ordem_id ? { ignorar_ordem_id } : {}) },
    }),
};
