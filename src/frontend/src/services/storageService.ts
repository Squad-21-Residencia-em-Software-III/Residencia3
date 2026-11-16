import type { ExcecaoAgenda, RotaAgenda } from '../types/agenda';
import {
  MOCK_AGENDA_HOJE,
  MOCK_AGENDA_SEMANA,
  MOCK_EXCECOES_MES,
  MOCK_HISTORICO_MES,
} from './mocks/agendaMock';

/** Estrutura da agenda operacional mantida exclusivamente em memória (RAM). */
export interface AgendaCache {
  hoje: RotaAgenda[];
  semana: RotaAgenda[];
  excecoesMes: Record<number, ExcecaoAgenda[]>;
  historicoMes: Record<number, number>;
}

let agendaEmMemoria: AgendaCache | null = null;

/**
 * Serviço em memória (RAM) para dados transitórios da agenda enquanto o módulo
 * não é migrado para a API REST. Não persiste dados no localStorage/sessionStorage.
 */
export const storageService = {
  getAgenda: (): AgendaCache => {
    if (!agendaEmMemoria) {
      agendaEmMemoria = {
        hoje: MOCK_AGENDA_HOJE,
        semana: MOCK_AGENDA_SEMANA,
        excecoesMes: MOCK_EXCECOES_MES,
        historicoMes: MOCK_HISTORICO_MES,
      };
    }
    return agendaEmMemoria;
  },

  saveAgenda: (agenda: AgendaCache): void => {
    agendaEmMemoria = agenda;
  },

  clear: (): void => {
    agendaEmMemoria = null;
  },
};
