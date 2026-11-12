import type { Knex } from 'knex';
import { db } from '../config/database';
import type { ListarSolicitacoesSvoInput } from '../validators/solicitacaoSvoSchemas';

// Espelha a constraint chk_solicitacoes_svo_status
export const STATUS_SOLICITACAO_SVO = ['EM_TRIAGEM', 'CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'RECUSADA', 'CANCELADA'] as const;

export type StatusSolicitacaoSvo = (typeof STATUS_SOLICITACAO_SVO)[number];

// Ordens de coleta que ainda ocupam a solicitação (BL27)
export const ORDENS_SVO_ATIVAS = ['AGUARDANDO_ALOCACAO', 'ALOCADA', 'EM_DESLOCAMENTO'];

export interface NovaSolicitacaoSvo {
  registrante_id: number;
  dados_solicitante: string;
  local_ocorrencia: string;
  material_sensivel: boolean;
  status: StatusSolicitacaoSvo;
}

export interface SolicitacaoSvo extends NovaSolicitacaoSvo {
  id: number;
  confirmado_por?: number | null;
  confirmado_em?: Date | null;
}

export interface OrdemSvo {
  id: number;
  solicitacao_id: number;
  status: 'AGUARDANDO_ALOCACAO' | 'ALOCADA' | 'EM_DESLOCAMENTO' | 'CONCLUIDA' | 'CANCELADA';
  veiculo_id: number | null;
  motorista_id: number | null;
  equipe_id: number | null;
  capacidade_utilizada: number;
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

  async buscarParaAtualizar(id: number, trx: Knex.Transaction): Promise<SolicitacaoSvo | undefined> {
    return trx<SolicitacaoSvo>('solicitacoes_svo').where({ id }).forUpdate().first();
  },

  async buscarOrdemAtiva(solicitacaoId: number, conexao: Knex = db): Promise<OrdemSvo | undefined> {
    return conexao<OrdemSvo>('ordens_svo')
      .where({ solicitacao_id: solicitacaoId })
      .whereIn('status', ORDENS_SVO_ATIVAS)
      .first();
  },

  async confirmar(id: number, autorId: number, trx: Knex.Transaction): Promise<SolicitacaoSvo> {
    const [solicitacao] = await trx<SolicitacaoSvo>('solicitacoes_svo')
      .where({ id })
      .update({ status: 'CONFIRMADA', confirmado_por: autorId, confirmado_em: trx.fn.now() })
      .returning('*');
    return solicitacao!;
  },

  // A ordem nasce sem recursos; veículo, motorista e equipe são definidos na alocação (BL28)
  async gerarOrdem(solicitacaoId: number, trx: Knex.Transaction): Promise<OrdemSvo> {
    const [ordem] = await trx<OrdemSvo>('ordens_svo')
      .insert({
        solicitacao_id: solicitacaoId,
        status: 'AGUARDANDO_ALOCACAO',
        veiculo_id: null,
        motorista_id: null,
        equipe_id: null,
        capacidade_utilizada: 1,
      })
      .returning('*');
    return ordem!;
  },
};
