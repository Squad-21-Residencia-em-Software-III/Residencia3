import type { Knex } from 'knex';
import type { FaseOdometro } from '../services/evidenciaOdometroTransicao';
import type { TipoOperacao } from '../validators/viagemSchemas';

export interface ExcecaoOdometroRow {
  id: number;
  tipo_operacao: TipoOperacao;
  viagem_frota_id: number | null;
  ordem_svo_id: number | null;
  fase: FaseOdometro;
  veiculo_id: number;
  motorista_id: number;
  solicitada_por: number;
  motivo: string;
  solicitada_em: Date;
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA';
  decidida_por: number | null;
  decidida_em: Date | null;
  justificativa: string | null;
  auditoria_decisao_id: number | null;
  encerrada_em: Date | null;
  evidencia_id: number | null;
}

export function chaveExcecao(tipo: TipoOperacao, id: number) {
  return { tipo_operacao: tipo, [tipo === 'SVO' ? 'ordem_svo_id' : 'viagem_frota_id']: id };
}

export function excecoesDoRegistro(conn: Knex, tipo: TipoOperacao, id: number) {
  return conn<ExcecaoOdometroRow>('excecoes_odometro').where(chaveExcecao(tipo, id));
}

export function apresentarExcecao(excecao: ExcecaoOdometroRow) {
  return {
    id: excecao.id,
    tipo_operacao: excecao.tipo_operacao,
    viagem_id: excecao.viagem_frota_id ?? excecao.ordem_svo_id,
    fase: excecao.fase,
    motivo: excecao.motivo,
    solicitada_em: excecao.solicitada_em,
    status: excecao.status,
    justificativa: excecao.justificativa,
    decidida_em: excecao.decidida_em,
  };
}
