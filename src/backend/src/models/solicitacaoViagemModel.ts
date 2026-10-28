
import type { Knex } from 'knex';
import { db } from '../config/database';

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
  status: string;
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
};
