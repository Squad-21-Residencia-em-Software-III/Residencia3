import { dashboardModel } from '../models/dashboardModel';
import type { ConsultarDashboardInput } from '../validators/dashboardSchemas';
import { ultimoDiaDaSolicitacao } from './disponibilidadeService';

export interface Dashboard {
  periodo: { inicio: string | null; fim: string | null };
  solicitacoes_pendentes: number;
  viagens_em_andamento: number;
  veiculos_disponiveis: { total: number; administrativa: number; svo: number };
  alertas: { total: number; veiculos_em_manutencao: number; motoristas_cnh_vencida: number };
}

// Indicadores aprovados para o dashboard (docs/frontend.md, seção 10).
// O período vale para solicitações e viagens; veículos e alertas refletem a situação atual.
export const dashboardService = {
  async consultar(filtros: ConsultarDashboardInput): Promise<Dashboard> {
    const hoje = ultimoDiaDaSolicitacao({ data_saida_desejada: new Date() });
    const indicadores = await dashboardModel.indicadores({ ...filtros, hoje });

    return {
      periodo: { inicio: filtros.inicio ?? null, fim: filtros.fim ?? null },
      solicitacoes_pendentes: indicadores.solicitacoes_pendentes,
      viagens_em_andamento: indicadores.viagens_em_andamento,
      veiculos_disponiveis: {
        total: indicadores.veiculos_disponiveis,
        administrativa: indicadores.veiculos_disponiveis_administrativa,
        svo: indicadores.veiculos_disponiveis_svo,
      },
      alertas: {
        total: indicadores.veiculos_em_manutencao + indicadores.motoristas_cnh_vencida,
        veiculos_em_manutencao: indicadores.veiculos_em_manutencao,
        motoristas_cnh_vencida: indicadores.motoristas_cnh_vencida,
      },
    };
  },
};
