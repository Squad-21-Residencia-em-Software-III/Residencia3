import type { Knex } from 'knex';
import { db } from '../config/database';
import type { StatusSolicitacaoSvo } from './solicitacaoSvoModel';

export interface CredencialExternaSvoRow {
  solicitacao_id: number;
  segredo_digest: string;
  algoritmo_digest: 'SHA-256' | 'HMAC-SHA-256';
  versao_credencial: number;
  chave_idempotencia_criacao: string | null;
  payload_criacao_digest: string | null;
  prova_tentativa_digest: string | null;
  envelope_recuperacao: string | null;
  recuperacao_expira_em: Date | string | null;
  emitida_em: Date | string;
  valida_ate: Date | string | null;
  revogada_em: Date | string | null;
  revogada_motivo: string | null;
  ultimo_acesso_em: Date | string | null;
  atualizado_em: Date | string;
}

export interface NovaCredencialExternaSvo {
  solicitacao_id: number;
  segredo_digest: string;
  algoritmo_digest?: 'SHA-256' | 'HMAC-SHA-256';
  versao_credencial?: number;
  chave_idempotencia_criacao?: string | null;
  payload_criacao_digest?: string | null;
  prova_tentativa_digest?: string | null;
  envelope_recuperacao?: string | null;
  recuperacao_expira_em?: Date | null;
  emitida_em?: Date;
  valida_ate?: Date | null;
}

export interface RegistroAcompanhamentoExternoRow {
  solicitacao_id: number;
  canal_origem: 'INTERNA' | 'EXTERNA';
  protocolo: string | null;
  status_solicitacao: StatusSolicitacaoSvo;
  criado_em: Date | string;
  confirmado_em: Date | string | null;
  motivo_recusa_publico: string | null;
  cancelamento_status: 'PENDENTE' | 'ACEITO' | 'NEGADO' | null;
  cancelamento_solicitado_em: Date | string | null;
  cancelamento_decidido_em: Date | string | null;
  cancelamento_justificativa_decisao: string | null;
  versao_dados: number;
  encerrado_operacional_em: Date | string | null;
  consulta_publica_expira_em: Date | string | null;
  atualizado_em_dados: Date | string;
  segredo_digest: string;
  algoritmo_digest: 'SHA-256' | 'HMAC-SHA-256';
  versao_credencial: number;
  emitida_em: Date | string;
  valida_ate: Date | string | null;
  revogada_em: Date | string | null;
  ordem_status:
    | 'AGUARDANDO_ALOCACAO'
    | 'ALOCADA'
    | 'EM_DESLOCAMENTO'
    | 'NO_LOCAL'
    | 'CONCLUIDA'
    | 'CANCELADA'
    | null;
  ordem_saida_em: Date | string | null;
  ordem_conclusao_em: Date | string | null;
}

export interface TentativaCriacaoExternaRow extends CredencialExternaSvoRow {
  protocolo: string | null;
  canal_origem: 'INTERNA' | 'EXTERNA';
  status_solicitacao: StatusSolicitacaoSvo;
  criado_em: Date | string;
}

// Projecao estrita: nao seleciona CPF, documento_falecido, informacoes_medicas,
// motivo_recusa interno, veiculo, motorista, equipe nem coordenadas GPS.
const COLUNAS_ACOMPANHAMENTO_SEGURO = [
  's.id as solicitacao_id',
  's.canal_origem',
  's.protocolo',
  's.status as status_solicitacao',
  's.criado_em',
  's.confirmado_em',
  'd.motivo_recusa_publico',
  'd.cancelamento_status',
  'd.cancelamento_solicitado_em',
  'd.cancelamento_decidido_em',
  'd.cancelamento_justificativa_decisao',
  'd.versao_dados',
  'd.encerrado_operacional_em',
  'd.consulta_publica_expira_em',
  'd.atualizado_em as atualizado_em_dados',
  'c.segredo_digest',
  'c.algoritmo_digest',
  'c.versao_credencial',
  'c.emitida_em',
  'c.valida_ate',
  'c.revogada_em',
  'ordem.status as ordem_status',
  'ordem.data_hora_saida as ordem_saida_em',
  'ordem.data_hora_conclusao as ordem_conclusao_em',
] as const;

export const acompanhamentoExternoSvoModel = {
  async inserirCredencial(
    dados: NovaCredencialExternaSvo,
    trx: Knex.Transaction
  ): Promise<CredencialExternaSvoRow> {
    const [credencial] = await trx<CredencialExternaSvoRow>(
      'solicitacoes_svo_credenciais_externas'
    )
      .insert(dados)
      .returning('*');
    return credencial!;
  },

  async buscarPorProtocolo(
    protocolo: string,
    conexao: Knex = db
  ): Promise<RegistroAcompanhamentoExternoRow | undefined> {
    return conexao('solicitacoes_svo as s')
      .innerJoin(
        'solicitacoes_svo_dados_externos as d',
        'd.solicitacao_id',
        's.id'
      )
      .innerJoin(
        'solicitacoes_svo_credenciais_externas as c',
        'c.solicitacao_id',
        's.id'
      )
      .joinRaw(
        `LEFT JOIN LATERAL (
          SELECT o.status, o.data_hora_saida, o.data_hora_conclusao
          FROM ordens_svo o
          WHERE o.solicitacao_id = s.id
          ORDER BY o.id DESC
          LIMIT 1
        ) AS ordem ON TRUE`
      )
      .where({
        's.canal_origem': 'EXTERNA',
        's.protocolo': protocolo,
      })
      .first<RegistroAcompanhamentoExternoRow>(...COLUNAS_ACOMPANHAMENTO_SEGURO);
  },

  async buscarTentativaPorChaveIdempotencia(
    chaveIdempotencia: string,
    conexao: Knex = db
  ): Promise<TentativaCriacaoExternaRow | undefined> {
    return conexao('solicitacoes_svo_credenciais_externas as c')
      .innerJoin('solicitacoes_svo as s', 's.id', 'c.solicitacao_id')
      .where({
        's.canal_origem': 'EXTERNA',
        'c.chave_idempotencia_criacao': chaveIdempotencia,
      })
      .first<TentativaCriacaoExternaRow>(
        'c.*',
        's.protocolo',
        's.canal_origem',
        's.status as status_solicitacao',
        's.criado_em'
      );
  },

  async registrarAcessoValido(
    solicitacaoId: number,
    agora: Date,
    conexao: Knex = db
  ): Promise<void> {
    await conexao('solicitacoes_svo_credenciais_externas')
      .where({ solicitacao_id: solicitacaoId })
      .update({
        ultimo_acesso_em: agora,
        atualizado_em: agora,
      });
  },

  async registrarEncerramentoOperacional(
    solicitacaoId: number,
    encerradoEm: Date,
    expiraConsultaPublicaEm: Date,
    retencaoAte: Date,
    conexao: Knex = db
  ): Promise<void> {
    await conexao('solicitacoes_svo_dados_externos')
      .where({ solicitacao_id: solicitacaoId })
      .whereNull('encerrado_operacional_em')
      .update({
        encerrado_operacional_em: encerradoEm,
        consulta_publica_expira_em: expiraConsultaPublicaEm,
        retencao_ate: retencaoAte,
        atualizado_em: encerradoEm,
      });

    await conexao('solicitacoes_svo_credenciais_externas')
      .where({ solicitacao_id: solicitacaoId })
      .whereNull('valida_ate')
      .update({
        valida_ate: expiraConsultaPublicaEm,
        atualizado_em: encerradoEm,
      });
  },

  async revogarCredencial(
    solicitacaoId: number,
    motivo: string,
    agora: Date,
    conexao: Knex = db
  ): Promise<CredencialExternaSvoRow | undefined> {
    const [atualizada] = await conexao<CredencialExternaSvoRow>(
      'solicitacoes_svo_credenciais_externas'
    )
      .where({ solicitacao_id: solicitacaoId })
      .update({
        revogada_em: agora,
        revogada_motivo: motivo,
        envelope_recuperacao: null,
        recuperacao_expira_em: null,
        atualizado_em: agora,
      })
      .returning('*');
    return atualizada;
  },
};
