import type { Motorista } from '../../types/motorista';
import { request } from './http';

export const motoristasApi = {
  listar: () => request<Motorista[]>('GET', '/motoristas'),
  buscarMeuPerfil: () => request<Motorista>('GET', '/motoristas/me'),
};
