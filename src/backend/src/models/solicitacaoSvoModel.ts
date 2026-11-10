import type { Knex } from 'knex';
import { db } from '../config/database';
import { ORDENS_SVO_ATIVAS, STATUS_SOLICITACAO_SVO } from '../constants/svo';
import type { ListarSolicitacoesSvoInput } from '../validators/solicitacaoSvoSchemas';

export interface SolicitacaoSvo {
  id: number;
  registrante_id: number | null;
  dados_solicitante: string;
  local_ocorrencia: string;
  material_sensivel: boolean;
  status: (typeof STATUS_SOLICITACAO_SVO)[number];
  confirmado_por: number | null;
  confirmado_em: Date | null;
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
  async listar(filtros: ListarSolicitacoesSvoInput): Promise<{ dados: SolicitacaoSvo[]; total: number }> {
    const consulta = db<SolicitacaoSvo>('solicitacoes_svo');
    if (filtros.status) consulta.where({ status: filtros.status });
    const total = await consulta.clone().count<{ total: string }>('* as total').first();
    const dados = await consulta.select('*').orderBy('id', 'desc')
      .limit(filtros.limite)
      .offset((filtros.pagina - 1) * filtros.limite);
    return { dados, total: Number(total?.total ?? 0) };
  },

  async buscarPorId(id: number, conexao: Knex = db): Promise<SolicitacaoSvo | undefined> {
    return conexao<SolicitacaoSvo>('solicitacoes_svo').where({ id }).first();
  },

  async buscarParaAtualizar(id: number, trx: Knex.Transaction): Promise<SolicitacaoSvo | undefined> {
    return trx<SolicitacaoSvo>('solicitacoes_svo').where({ id }).forUpdate().first();
  },

  async buscarOrdemAtiva(solicitacaoId: number, conexao: Knex = db): Promise<OrdemSvo | undefined> {
    return conexao<OrdemSvo>('ordens_svo').where({ solicitacao_id: solicitacaoId })
      .whereIn('status', ORDENS_SVO_ATIVAS).first();
  },

  async confirmar(id: number, autorId: number, trx: Knex.Transaction): Promise<SolicitacaoSvo> {
    const [solicitacao] = await trx<SolicitacaoSvo>('solicitacoes_svo').where({ id })
      .update({ status: 'CONFIRMADA', confirmado_por: autorId, confirmado_em: trx.fn.now() })
      .returning('*');
    return solicitacao!;
  },

  async gerarOrdem(solicitacaoId: number, trx: Knex.Transaction): Promise<OrdemSvo> {
    const [ordem] = await trx<OrdemSvo>('ordens_svo').insert({
      solicitacao_id: solicitacaoId,
      status: 'AGUARDANDO_ALOCACAO',
      veiculo_id: null,
      motorista_id: null,
      equipe_id: null,
      capacidade_utilizada: 1,
    }).returning('*');
    return ordem!;
  },
};
