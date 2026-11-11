import { request } from './http';

export interface DashboardData {
  periodo: { inicio: string | null; fim: string | null };
  solicitacoes_pendentes: number;
  viagens_em_andamento: number;
  veiculos_disponiveis: {
    total: number;
    administrativa: number;
    svo: number;
  };
  alertas: {
    total: number;
    veiculos_em_manutencao: number;
    motoristas_cnh_vencida: number;
  };
}

export const dashboardApi = {
  consultar: (filtros?: { inicio?: string; fim?: string }) => {
    const params = new URLSearchParams();
    if (filtros?.inicio) params.set('inicio', filtros.inicio);
    if (filtros?.fim) params.set('fim', filtros.fim);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<DashboardData>('GET', `/dashboard${query}`);
  },
};

