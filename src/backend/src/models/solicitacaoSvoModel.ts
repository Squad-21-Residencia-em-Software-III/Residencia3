import type { Knex } from 'knex';
import { db } from '../config/database';
import type { ListarSolicitacoesSvoInput } from '../validators/solicitacaoSvoSchemas';

// Espelha a constraint chk_solicitacoes_svo_status
export const STATUS_SOLICITACAO_SVO = ['EM_TRIAGEM', 'CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'RECUSADA', 'CANCELADA'] as const;

export type StatusSolicitacaoSvo = (typeof STATUS_SOLICITACAO_SVO)[number];

// Espelha a constraint chk_solicitacoes_svo_canal_origem (SCRUM-263)
export const CANAIS_ORIGEM_SOLICITACAO_SVO = ['INTERNA', 'EXTERNA'] as const;

export type CanalOrigemSolicitacaoSvo = (typeof CANAIS_ORIGEM_SOLICITACAO_SVO)[number];

// Ordens de coleta que ainda ocupam a solicitação (BL27)
export const ORDENS_SVO_ATIVAS = ['AGUARDANDO_ALOCACAO', 'ALOCADA', 'EM_DESLOCAMENTO', 'NO_LOCAL'] as const;

export interface NovaSolicitacaoSvo {
  registrante_id: number | null;
  canal_origem?: CanalOrigemSolicitacaoSvo;
  protocolo?: string | null;
  dados_solicitante: string;
  local_ocorrencia: string;
  material_sensivel: boolean;
  status: StatusSolicitacaoSvo;
}

export interface SolicitacaoSvo extends NovaSolicitacaoSvo {
  id: number;
  canal_origem?: CanalOrigemSolicitacaoSvo;
  protocolo?: string | null;
  observacoes?: string | null;
  motivo_recusa?: string | null;
  criado_em?: Date | string;
  confirmado_por?: number | null;
  confirmado_em?: Date | null;
}

// Projeção operacional da fila interna. Dados protegidos ficam nas tabelas externas.
const COLUNAS_SOLICITACAO_SVO: Array<keyof SolicitacaoSvo> = [
  'id', 'registrante_id', 'canal_origem', 'protocolo', 'dados_solicitante',
  'local_ocorrencia', 'material_sensivel', 'status', 'observacoes',
  'motivo_recusa', 'criado_em', 'confirmado_por', 'confirmado_em',
];

export interface OrdemSvo {
  id: number;
  solicitacao_id: number;
  status: 'AGUARDANDO_ALOCACAO' | 'ALOCADA' | 'EM_DESLOCAMENTO' | 'NO_LOCAL' | 'CONCLUIDA' | 'CANCELADA';
  veiculo_id: number | null;
  motorista_id: number | null;
  equipe_id: number | null;
  capacidade_utilizada: number;
}

export const solicitacaoSvoModel = {
  async cadastrar(dados: NovaSolicitacaoSvo, trx?: Knex.Transaction): Promise<SolicitacaoSvo> {
    const conexao = trx || db;
    const [solicitacao] = await conexao('solicitacoes_svo').insert(dados).returning(COLUNAS_SOLICITACAO_SVO);
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
        .select(COLUNAS_SOLICITACAO_SVO)
        .orderBy('id', 'desc')
        .limit(filtros.limite)
        .offset((filtros.pagina - 1) * filtros.limite),
      consulta.clone().count<{ total: string }[]>({ total: '*' }),
    ]);

    return { dados, total: Number(contagem[0]?.total ?? 0) };
  },

  async buscarPorId(id: number): Promise<SolicitacaoSvo | undefined> {
    return db<SolicitacaoSvo>('solicitacoes_svo').where({ id }).first(...COLUNAS_SOLICITACAO_SVO);
  },

  async temPossivelDuplicidadeExterna(id: number): Promise<boolean> {
    const { rows: [resultado] } = await db.raw<{ rows: { encontrada: boolean }[] }>(
      `SELECT EXISTS (
        SELECT 1 FROM solicitacoes_svo_dados_externos AS alvo
        JOIN solicitacoes_svo_dados_externos AS outro
          ON outro.data_hora_ocorrencia = alvo.data_hora_ocorrencia
         AND outro.documento_falecido = alvo.documento_falecido
         AND outro.solicitacao_id <> alvo.solicitacao_id
        WHERE alvo.solicitacao_id = ?
          AND alvo.anonimizado_em IS NULL AND alvo.expurgado_em IS NULL
          AND outro.anonimizado_em IS NULL AND outro.expurgado_em IS NULL
      ) AS encontrada`,
      [id],
    );
    return resultado.encontrada;
  },

  async buscarParaAtualizar(id: number, trx: Knex.Transaction): Promise<SolicitacaoSvo | undefined> {
    return trx<SolicitacaoSvo>('solicitacoes_svo').where({ id }).forUpdate().first(...COLUNAS_SOLICITACAO_SVO);
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
      .returning(COLUNAS_SOLICITACAO_SVO);
    return solicitacao!;
  },

  async recusar(id: number, motivoRecusa: string, trx: Knex.Transaction): Promise<SolicitacaoSvo> {
    const [solicitacao] = await trx<SolicitacaoSvo>('solicitacoes_svo')
      .where({ id })
      .update({ status: 'RECUSADA', motivo_recusa: motivoRecusa })
      .returning(COLUNAS_SOLICITACAO_SVO);
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