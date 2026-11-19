/**
 * Fotos do odômetro (SCRUM-203). Contrato proposto em docs/scrum-203-contrato-backend.md.
 * Viagens administrativas e ordens SVO têm ids independentes: a evidência é sempre identificada
 * por (tipo_operacao, viagem_id, fase).
 */
import type { TipoOperacaoViagem } from './viagem';

export type FaseOdometro = 'SAIDA' | 'CHEGADA';

/**
 * - PENDENTE: ainda não registrada (a transição dessa fase não aconteceu).
 * - REGISTRADA: foto guardada; pode vir de um deslocamento SVO compartilhado.
 * - EXCECAO_AUTORIZADA: o gestor responsável autorizou a transição sem foto, com justificativa.
 * - EXPIRADA: a foto foi descartada pela retenção de 12 meses; o registro continua.
 * - SEM_REGISTRO: viagem anterior à SCRUM-203, sem evidência.
 */
export type SituacaoEvidencia =
  | 'PENDENTE'
  | 'REGISTRADA'
  | 'EXCECAO_AUTORIZADA'
  | 'EXPIRADA'
  | 'SEM_REGISTRO';

export interface ExcecaoSemFoto {
  justificativa: string;
  autorizada_por_nome: string;
  autorizada_em: string;
}

export interface EvidenciaOdometro {
  /** Identificador opaco da evidência; `null` quando não há arquivo. */
  id: string | null;
  fase: FaseOdometro;
  situacao: SituacaoEvidencia;
  km: number | null;
  registrada_em: string | null;
  autor_nome: string | null;
  /** Mesma foto usada por várias ordens SVO de um único deslocamento físico. */
  compartilhada: boolean;
  excecao: ExcecaoSemFoto | null;
  /** O servidor decide se quem consulta pode baixar o arquivo original. */
  pode_baixar: boolean;
}

export interface PedidoExcecaoOdometro {
  id: number;
  viagem_id: number;
  tipo_operacao: TipoOperacaoViagem;
  fase: FaseOdometro;
  motivo: string;
  solicitada_em: string;
  status: 'PENDENTE' | DecisaoExcecaoOdometro;
  justificativa: string | null;
  decidida_em: string | null;
}

export type DecisaoExcecaoOdometro = 'APROVADA' | 'RECUSADA';

export interface EvidenciasDaViagem {
  fotos_disponiveis?: boolean;
  fotos_obrigatorias?: boolean;
  pode_solicitar_excecao?: boolean;
  pedidos_excecao?: PedidoExcecaoOdometro[];
  tipo_operacao: TipoOperacaoViagem;
  viagem_id: number;
  veiculo_placa: string | null;
  motorista_nome: string | null;
  saida: EvidenciaOdometro;
  chegada: EvidenciaOdometro;
}

/** Resposta do envio: a foto fica provisória até a transição usar este id. */
export interface EvidenciaEnviada {
  id: string;
  fase: FaseOdometro;
  expira_em: string;
}

/** Códigos de erro da transição que exigem enviar a foto de novo. */
export const CODIGOS_REENVIAR_FOTO = [
  'EVIDENCIA_OBRIGATORIA',
  'EVIDENCIA_INVALIDA',
  'EVIDENCIA_EXPIRADA',
] as const;

export const LABELS_FASE_ODOMETRO: Record<FaseOdometro, string> = {
  SAIDA: 'Saída',
  CHEGADA: 'Chegada',
};
