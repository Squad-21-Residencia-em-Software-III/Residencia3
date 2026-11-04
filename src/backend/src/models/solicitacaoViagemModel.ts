import type { Knex } from 'knex';
import { db } from '../config/database';

export type StatusSolicitacaoViagem =
  | 'PENDENTE_APROVACAO'
  | 'APROVADA'
  | 'AGENDADA'
  | 'CONCLUIDA'
  | 'RECUSADA'
  | 'CANCELADA';

export interface NovaSolicitacaoViagem {
  solicitante_id: number;
  origem: string;
  destino: string;
  finalidade: string;
  data_saida_desejada: string;
  data_chegada_desejada?: string | null;
}

export interface SolicitacaoViagem extends NovaSolicitacaoViagem {
  id: number;
  status: StatusSolicitacaoViagem;
  motivo_recusa?: string | null;
}

export const solicitacaoViagemModel = {
  async cadastrar(
    dados: NovaSolicitacaoViagem,
    trx?: Knex.Transaction
  ): Promise<SolicitacaoViagem> {
    const conexao = trx || db;

    const [solicitacao] = await conexao('solicitacoes_viagem')
      .insert(dados)
      .returning('*');

    return solicitacao;
  },

  // Busca e bloqueia a linha para evitar análises simultâneas
  async buscarParaAtualizar(
    id: number,
    trx: Knex.Transaction
  ): Promise<SolicitacaoViagem | undefined> {
    return trx('solicitacoes_viagem')
      .where({ id })
      .forUpdate()
      .first();
  },

  async atualizarStatus(
    id: number,
    status: StatusSolicitacaoViagem,
    trx?: Knex.Transaction,
    motivoRecusa?: string | null
  ): Promise<SolicitacaoViagem> {
    const conexao = trx || db;
    const dadosAtualizacao: { status: StatusSolicitacaoViagem; motivo_recusa?: string | null } = {
      status,
    };

    if (motivoRecusa !== undefined) {
      dadosAtualizacao.motivo_recusa = motivoRecusa;
    }

    const [solicitacao] = await conexao('solicitacoes_viagem')
      .where({ id })
      .update(dadosAtualizacao)
      .returning('*');

    return solicitacao;
  },
};