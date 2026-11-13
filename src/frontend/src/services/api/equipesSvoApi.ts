import type { EquipeSvo } from '../../types/equipeSvo';
import { request } from './http';

/**
 * Equipes do SVO. Contrato provisório (SCRUM-145): o endpoint ainda precisa ser criado no backend.
 * Enquanto não existir, a chamada falha (404) e o modal de agendamento permite alocar sem equipe.
 */
export const equipesSvoApi = {
  listar: () => request<EquipeSvo[]>('GET', '/equipes-svo'),
};
