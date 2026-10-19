/**
 * Espelha a tabela `viagens_frota` e `ordens_svo` do banco
 * (migration 20261014000001_create_initial_schema.js).
 * Não adicionar campos que não existam na modelagem oficial.
 */

export type StatusViagem = 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
export type TipoOperacaoViagem = 'ADMINISTRATIVA' | 'SVO';

export const LABELS_STATUS_VIAGEM: Record<StatusViagem, string> = {
  AGENDADA: 'Agendada',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

export interface Viagem {
  id: number;
  solicitacao_id: number; // FK solicitacoes_viagem.id (ou solicitacoes_svo.id)
  tipo_operacao: TipoOperacaoViagem; // ADMINISTRATIVA (viagens_frota) ou SVO (ordens_svo)
  origem: string; // herdado de solicitacoes_viagem.origem
  destino: string; // herdado de solicitacoes_viagem.destino
  finalidade: string; // herdado de solicitacoes_viagem.finalidade
  solicitante_nome: string; // join usuarios.nome via solicitacoes_viagem.solicitante_id
  veiculo_id: number; // FK veiculos.id
  veiculo_modelo: string; // join veiculos.modelo
  veiculo_placa: string; // join veiculos.placa
  motorista_id: number; // FK motoristas.id
  motorista_nome: string; // join usuarios.nome via motoristas.usuario_id
  km_inicial: number; // odômetro de saída (inteiro)
  km_final?: number | null; // odômetro de retorno (inteiro)
  data_hora_efetiva_saida?: string | null; // timestamp ISO (ex: 2026-10-19T08:00:00)
  data_hora_efetiva_chegada?: string | null; // timestamp ISO
  status: StatusViagem;
}

export interface NovaViagemInput {
  solicitacao_id: number;
  tipo_operacao: TipoOperacaoViagem;
  veiculo_id: number;
  motorista_id: number;
  km_inicial: number;
  data_hora_efetiva_saida: string;
}

export interface FinalizarViagemInput {
  km_final: number;
  data_hora_efetiva_chegada: string;
}
