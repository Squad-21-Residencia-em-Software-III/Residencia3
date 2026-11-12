import type { Knex } from 'knex';
import { db } from '../config/database';
import type { ListarSolicitacoesSvoInput } from '../validators/solicitacaoSvoSchemas';

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

  async listar(filtros: ListarSolicitacoesSvoInput): Promise<{ dados: SolicitacaoSvo[]; total: number }> {
    const consulta = db<SolicitacaoSvo>('solicitacoes_svo');

    if (filtros.status) {
      consulta.where({ status: filtros.status });
    }

    const [dados, contagem] = await Promise.all([
      consulta
        .clone()
        .select('*')
        .orderBy('id', 'desc')
        .limit(filtros.limite)
        .offset((filtros.pagina - 1) * filtros.limite),
      consulta.clone().count<{ total: string }[]>({ total: '*' }),
    ]);

    return { dados, total: Number(contagem[0]?.total ?? 0) };
  },

  async buscarPorId(id: number): Promise<SolicitacaoSvo | undefined> {
    return db('solicitacoes_svo').where({ id }).first();
  },
};
