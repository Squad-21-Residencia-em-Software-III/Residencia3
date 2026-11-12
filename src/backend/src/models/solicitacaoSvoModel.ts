import type { Knex } from 'knex';
import { db } from '../config/database';

// Espelha a constraint chk_solicitacoes_svo_status
export const STATUS_SOLICITACAO_SVO = ['EM_TRIAGEM', 'CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'RECUSADA', 'CANCELADA'] as const;

export type StatusSolicitacaoSvo = (typeof STATUS_SOLICITACAO_SVO)[number];

export interface NovaSolicitacaoSvo {
  registrante_id: number;
  dados_solicitante: string;
  local_ocorrencia: string;
  material_sensivel: boolean;
  status: StatusSolicitacaoSvo;
}

export interface SolicitacaoSvo extends NovaSolicitacaoSvo {
  id: number;
}

export const solicitacaoSvoModel = {
  async cadastrar(dados: NovaSolicitacaoSvo, trx?: Knex.Transaction): Promise<SolicitacaoSvo> {
    const conexao = trx || db;
    const [solicitacao] = await conexao('solicitacoes_svo').insert(dados).returning('*');
    return solicitacao;
  },

  async listar(status?: StatusSolicitacaoSvo): Promise<SolicitacaoSvo[]> {
    const consulta = db('solicitacoes_svo').select('*').orderBy('id', 'desc');
    if (status) {
      consulta.where({ status });
    }
    return consulta;
  },

  async buscarPorId(id: number): Promise<SolicitacaoSvo | undefined> {
    return db('solicitacoes_svo').where({ id }).first();
  },
};
