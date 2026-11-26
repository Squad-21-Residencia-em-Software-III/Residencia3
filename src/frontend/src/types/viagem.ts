/**
 * Espelha a tabela `viagens_frota` e `ordens_svo` do banco
 * (migration 20261014000001_create_initial_schema.js).
 * Não adicionar campos que não existam na modelagem oficial.
 */

// NO_LOCAL existe só nas ordens SVO (BL31): a equipe chegou ao local da coleta
export type StatusViagem = 'AGENDADA' | 'EM_ANDAMENTO' | 'NO_LOCAL' | 'CONCLUIDA' | 'CANCELADA';
export type TipoOperacaoViagem = 'ADMINISTRATIVA' | 'SVO';

export const LABELS_STATUS_VIAGEM: Record<StatusViagem, string> = {
  AGENDADA: 'Agendada',
  EM_ANDAMENTO: 'Em Andamento',
  NO_LOCAL: 'No local',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

/** Na coleta SVO, "em andamento" é o deslocamento até o local (status "A caminho", BL31). */
export function rotuloStatusViagem(viagem: Pick<Viagem, 'status' | 'tipo_operacao'>): string {
  if (viagem.tipo_operacao === 'SVO' && viagem.status === 'EM_ANDAMENTO') return 'A caminho';
  return LABELS_STATUS_VIAGEM[viagem.status];
}

/** Viagem ou coleta já iniciada e ainda não concluída: aceita o registro de retorno. */
export function viagemEmCurso(status: StatusViagem): boolean {
  return status === 'EM_ANDAMENTO' || status === 'NO_LOCAL';
}

/** Viagens administrativas e ordens SVO têm ids independentes e podem repetir o mesmo número. */
export const chaveViagem = (v: Pick<Viagem, 'id' | 'tipo_operacao'>) => `${v.tipo_operacao}-${v.id}`;

export interface Viagem {
  material_sensivel?: boolean | null;
  id: number;
  solicitacao_id: number; // FK solicitacoes_viagem.id (ou solicitacoes_svo.id)
  tipo_operacao: TipoOperacaoViagem; // ADMINISTRATIVA (viagens_frota) ou SVO (ordens_svo)
  origem: string | null; // herdado de solicitacoes_viagem.origem (null em ordens SVO)
  destino: string | null; // herdado de solicitacoes_viagem.destino (local_ocorrencia no SVO)
  finalidade: string | null; // herdado de solicitacoes_viagem.finalidade (null em ordens SVO)
  solicitante_nome: string | null; // join usuarios.nome via solicitacoes_viagem.solicitante_id
  inicio_previsto?: string | null; // período operacional planejado
  fim_previsto?: string | null;
  inicio_solicitado?: string | null;
  fim_solicitado?: string | null;
  versao_programacao?: number | null;
  pode_reprogramar?: boolean;
  veiculo_id: number; // FK veiculos.id
  veiculo_modelo: string; // join veiculos.modelo
  veiculo_placa: string; // join veiculos.placa
  motorista_id: number; // FK motoristas.id
  motorista_nome: string; // join usuarios.nome via motoristas.usuario_id
  equipe_id?: number | null;
  liberada_em?: string | null;
  capacidade_utilizada?: number | null;
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
  integrantes_ids?: number[];
  capacidade_utilizada?: number;
  solicitacao_id: number;
  veiculo_id: number;
  motorista_id: number;
  inicio_previsto?: string; // ISO 8601
  fim_previsto?: string; // ISO 8601, depois do início
  /** Segundo passo, depois de o servidor pedir confirmação do intervalo menor que 20 min. */
  confirmar_intervalo_reduzido?: boolean;
  token_confirmacao?: string;
}

/** Recurso em conflito informado pelo servidor ao pedir confirmação de intervalo curto. */
export interface ConflitoIntervaloSvo {
  recurso: 'VEICULO' | 'MOTORISTA' | 'EQUIPE' | 'INTEGRANTE';
  descricao: string; // ex.: "Fiat Ducato (ABC1D23)"
  inicio: string; // reserva vizinha, ISO 8601
  fim: string;
  intervalo_minutos: number;
}

/** Código do erro que pede a segunda confirmação (intervalo entre 0 e 20 min). */
export const CODIGO_CONFIRMAR_INTERVALO = 'CONFIRMACAO_INTERVALO_REDUZIDO';

export interface ReprogramarViagemAdministrativaInput {
  inicio_previsto: string;
  fim_previsto: string;
  versao_programacao: number;
  chave_idempotencia: string;
}
