import type { Knex } from 'knex';
import { db } from '../config/database';

import type { StatusSolicitacaoViagem } from '../constants/solicitacoesViagem';

export type { StatusSolicitacaoViagem };

export interface NovaSolicitacaoViagem {
  solicitante_id: number;
  unidade_id: number;
  origem: string;
  destino: string;
  finalidade: string;
  data_saida_desejada: string;
  data_chegada_desejada?: string | null;
}

export interface SolicitacaoViagem extends Omit<NovaSolicitacaoViagem, 'unidade_id'> {
  id: number;
  // Nula nas solicitações criadas antes da escolha de unidade
  unidade_id: number | null;
  status: StatusSolicitacaoViagem;
  motivo_recusa?: string | null;
}

export interface SolicitacaoViagemDetalhada extends SolicitacaoViagem {
  unidade_nome: string | null;
  solicitante_nome: string;
}

export interface FiltrosSolicitacoesViagem {
  status?: StatusSolicitacaoViagem;
  // undefined: todas as unidades, inclusive as solicitações sem unidade
  unidadeIds?: number[];
}

export const solicitacaoViagemModel = {
  async listar(filtros: FiltrosSolicitacoesViagem): Promise<SolicitacaoViagemDetalhada[]> {
    return db('solicitacoes_viagem as sv')
      .leftJoin('unidades as un', 'un.id', 'sv.unidade_id')
      .join('usuarios as u', 'u.id', 'sv.solicitante_id')
      .select('sv.*', 'un.nome as unidade_nome', 'u.nome as solicitante_nome')
      .modify((q) => {
        if (filtros.status) q.where('sv.status', filtros.status);
        if (filtros.unidadeIds) q.whereIn('sv.unidade_id', filtros.unidadeIds);
      })
      .orderBy('sv.data_saida_desejada');
  },

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