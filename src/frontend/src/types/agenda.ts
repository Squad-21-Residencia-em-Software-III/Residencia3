import type { StatusViagem, TipoOperacaoViagem } from './viagem';

export type ModoVisualizacaoAgenda = 'hoje' | 'semana' | 'mes';

export interface RotaAgenda {
  id: number;
  solicitacao_id: number;
  tipo_operacao: TipoOperacaoViagem;
  origem: string;
  destino: string;
  finalidade: string;
  solicitante_nome: string;
  veiculo_id: number;
  veiculo_modelo: string;
  veiculo_placa: string;
  capacidade_maxima: number;
  motorista_id: number;
  motorista_nome: string;
  data: string; // YYYY-MM-DD
  hora_inicio: string; // HH:mm
  hora_fim: string; // HH:mm
  km_estimado: number;
  status: StatusViagem;
}

export type TipoExcecaoAgenda = 'gargalo' | 'pico' | 'normal';

export interface ExcecaoAgenda {
  tipo: TipoExcecaoAgenda;
  hora?: string;
  mensagem: string;
}

export interface DiaAgendaSemana {
  data: string; // YYYY-MM-DD
  label: string; // Seg, Ter, Qua...
  diaNumero: number;
  isToday: boolean;
}
