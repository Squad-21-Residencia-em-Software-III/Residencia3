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
  origem: string | null; // herdado de solicitacoes_viagem.origem (null em ordens SVO)
  destino: string | null; // herdado de solicitacoes_viagem.destino (local_ocorrencia no SVO)
  finalidade: string | null; // herdado de solicitacoes_viagem.finalidade (null em ordens SVO)
  solicitante_nome: string | null; // join usuarios.nome via solicitacoes_viagem.solicitante_id
  inicio_previsto?: string | null; // data de saída desejada na solicitação
  fim_previsto?: string | null; // data de chegada desejada na solicitação
  veiculo_id: number; // FK veiculos.id
  veiculo_modelo: string; // join veiculos.modelo
  veiculo_placa: string; // join veiculos.placa
  motorista_id: number; // FK motoristas.id
  motorista_nome: string; // join usuarios.nome via motoristas.usuario_id
  km_inicial: number | null; // odômetro de saída (inteiro), informado ao iniciar a viagem
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
  equipe_id?: number | null; // somente operação SVO (ordens_svo.equipe_id); opcional no backend
}

/**
 * Ordem de coleta SVO aguardando alocação, listada em Viagens > SVO.
 * `ordem_id` é nulo enquanto a lista vem das solicitações confirmadas (a listagem delas não
 * traz o id da ordem); com `GET /viagens/ordens-svo/pendentes` (SCRUM-182) ele vem preenchido.
 */
export interface OrdemPendenteSvo {
  ordem_id: number | null;
  solicitacao_id: number; // solicitacoes_svo.id (não é solicitação administrativa)
  local_ocorrencia: string;
  material_sensivel: boolean;
  confirmado_em: string | null;
}

/**
 * Agendamento de uma coleta SVO. Hoje vai em `POST /viagens` com `tipo_operacao: 'SVO'`.
 * Período e confirmação de intervalo curto só são enviados com o agendamento temporal
 * (SCRUM-182); antes disso o servidor os ignoraria.
 */
export interface AgendamentoColetaSvoInput {
  equipe_id?: number;
  solicitacao_id: number;
  veiculo_id: number;
  motorista_id: number;
  inicio_previsto?: string; // ISO 8601
  fim_previsto?: string; // ISO 8601, depois do início
  /** Segundo passo, depois de o servidor pedir confirmação do intervalo menor que 20 min. */
  confirmar_intervalo_reduzido?: boolean;
}

/** Recurso em conflito informado pelo servidor ao pedir confirmação de intervalo curto. */
export interface ConflitoIntervaloSvo {
  recurso: 'VEICULO' | 'MOTORISTA' | 'EQUIPE';
  descricao: string; // ex.: "Fiat Ducato (ABC1D23)"
  inicio: string; // reserva vizinha, ISO 8601
  fim: string;
  intervalo_minutos: number;
}

/** Código do erro que pede a segunda confirmação (intervalo entre 0 e 20 min). */
export const CODIGO_CONFIRMAR_INTERVALO = 'CONFIRMACAO_INTERVALO_REDUZIDO';
