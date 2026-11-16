import type { StatusVeiculo, TipoFrota } from './veiculo';
import type { Viagem } from './viagem';

export type ModoVisualizacaoAgenda = 'hoje' | 'semana' | 'mes';

export interface DiaAgendaSemana {
  data: string; // YYYY-MM-DD
  label: string; // Seg, Ter, Qua...
  diaNumero: number;
  ehHoje: boolean;
}

export interface CelulaMesAgenda {
  dia: number;
  dataIso: string; // YYYY-MM-DD
  ehHoje: boolean;
  ehPassado: boolean;
  totalViagens: number;
}

export interface BlocoAgendaDia {
  chave: string; // `${viagem.tipo_operacao}-${viagem.id}`
  data: string; // YYYY-MM-DD do dia projetado
  viagem: Viagem;
  inicioMin: number; // 0..1440
  fimMin: number; // 0..1440
  horaInicioLabel: string; // HH:mm
  horaFimLabel: string; // HH:mm
  semPrevisaoFim: boolean;
}

export interface LinhaRecursoAgenda {
  id: number;
  modelo: string;
  placa: string;
  tipoFrota?: TipoFrota;
  statusVeiculo?: StatusVeiculo;
  blocos: BlocoAgendaDia[];
}
