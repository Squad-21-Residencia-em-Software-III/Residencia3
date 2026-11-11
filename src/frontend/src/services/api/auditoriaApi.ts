import type { ListaAuditorias } from '../../types/auditoria';
import { request } from './http';

export const auditoriaApi = {
  /**
   * Uma página dos registros, do mais recente para o mais antigo.
   * Somente Administrador (o backend responde 403 aos demais perfis).
   */
  listar: (pagina = 1, limite = 20) =>
    request<ListaAuditorias>('GET', '/auditorias', { query: { pagina, limite } }),
};
