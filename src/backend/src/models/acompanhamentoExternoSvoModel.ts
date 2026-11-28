import type { Knex } from 'knex';
import { db } from '../config/database';
import type { StatusSolicitacaoSvo } from './solicitacaoSvoModel';

export interface CredencialExternaEmitidaRow {
  solicitacao_id: number;
  algoritmo_digest: 'SHA-256' | 'HMAC-SHA-256';
  versao_credencial: number;
  emitida_em: Date | string;
}

export interface CredencialExternaRevogadaRow {
  solicitacao_id: number;
  revogada_em: Date | string | null;
  revogada_motivo: string | null;
  atualizado_em: Date | string;
}

export interface NovaCredencialExternaSvo {
  solicitacao_id: number;
  segredo_digest: string;
  algoritmo_digest?: 'SHA-256' | 'HMAC-SHA-256';
  versao_credencial?: number;
  chave_idempotencia_criacao: string;
  payload_criacao_digest: string;
  prova_tentativa_digest?: string | null;
  emitida_em?: Date;
}

export interface NovaRecuperacaoTentativaSvo {
  solicitacao_id: number;
  envelope_cifrado: string;
  versao_chave: number;
  criado_em: Date;
  expira_em: Date;
}

export interface RegistroAcompanhamentoExternoRow {
  solicitacao_id: number;
  canal_origem: 'INTERNA' | 'EXTERNA';
  protocolo: string | null;
  status_solicitacao: StatusSolicitacaoSvo;
  criado_em: Date | string;
  confirmado_em: Date | string | null;
  analise_iniciada_em: Date | string | null;
  motivo_recusa_publico: string | null;
  cancelamento_status: 'PENDENTE' | 'ACEITO' | 'NEGADO' | null;
  cancelamento_solicitado_em: Date | string | null;
  cancelamento_decidido_em: Date | string | null;
  cancelamento_mensagem_publica: string | null;
  versao_dados: number;
  encerrado_operacional_em: Date | string | null;
  consulta_publica_expira_em: Date | string | null;
  atualizado_em_dados: Date | string;
  segredo_digest: string;
  algoritmo_digest: 'SHA-256' | 'HMAC-SHA-256';
  versao_credencial: number;
  emitida_em: Date | string;
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

export interface TentativaCriacaoExternaRow {
  solicitacao_id: number;
  protocolo: string | null;
  canal_origem: 'INTERNA' | 'EXTERNA';
  status_solicitacao: StatusSolicitacaoSvo;
  segredo_digest: string;
  algoritmo_digest: 'SHA-256' | 'HMAC-SHA-256';
  versao_credencial: number;
  chave_idempotencia_criacao: string;
  payload_criacao_digest: string;
  prova_tentativa_digest: string | null;
  emitida_em: Date | string;
  revogada_em: Date | string | null;
  envelope_cifrado: string | null;
  versao_chave: number | null;
  recuperacao_expira_em: Date | string | null;
  recuperacao_descartada_em: Date | string | null;
}

const COLUNAS_RETORNO_EMISSAO = [
  'solicitacao_id',
  'algoritmo_digest',
  'versao_credencial',
  'emitida_em',
] as const;

const COLUNAS_RETORNO_REVOGACAO = [
  'solicitacao_id',
  'revogada_em',
  'revogada_motivo',
  'atualizado_em',
] as const;

// Projecao estrita: nao seleciona CPF, documento_falecido, informacoes_medicas,
// motivo_recusa interno, cancelamento_justificativa_decisao interna, veiculo, motorista, equipe nem coordenadas GPS.
const COLUNAS_ACOMPANHAMENTO_SEGURO = [
  's.id as solicitacao_id',
  's.canal_origem',
  's.protocolo',
  's.status as status_solicitacao',
  's.criado_em',
  's.confirmado_em',
  'd.analise_iniciada_em',
  'd.motivo_recusa_publico',
  'd.cancelamento_status',
  'd.cancelamento_solicitado_em',
  'd.cancelamento_decidido_em',
  'd.cancelamento_mensagem_publica',
  'd.versao_dados',
  'd.encerrado_operacional_em',
  'd.consulta_publica_expira_em',
  'd.atualizado_em as atualizado_em_dados',
  'c.segredo_digest',
  'c.algoritmo_digest',
  'c.versao_credencial',
  'c.emitida_em',
  'c.revogada_em',
  'ordem.status as ordem_status',
  'ordem.data_hora_saida as ordem_saida_em',
  'ordem.data_hora_conclusao as ordem_conclusao_em',
] as const;

const COLUNAS_TENTATIVA_RECUPERACAO = [
  'c.solicitacao_id',
  's.protocolo',
  's.canal_origem',
  's.status as status_solicitacao',
  'c.segredo_digest',
  'c.algoritmo_digest',
  'c.versao_credencial',
  'c.chave_idempotencia_criacao',
  'c.payload_criacao_digest',
  'c.prova_tentativa_digest',
  'c.emitida_em',
  'c.revogada_em',
  'r.envelope_cifrado',
  'r.versao_chave',
  'r.expira_em as recuperacao_expira_em',
  'r.descartada_em as recuperacao_descartada_em',
] as const;

export const acompanhamentoExternoSvoModel = {
  async inserirCredencial(
    dados: NovaCredencialExternaSvo,
    trx: Knex.Transaction
  ): Promise<CredencialExternaEmitidaRow> {
    const [credencial] = await trx<CredencialExternaEmitidaRow>(
      'solicitacoes_svo_credenciais_externas'
    )
      .insert(dados)
      .returning([...COLUNAS_RETORNO_EMISSAO]);
    return credencial!;
  },

  async inserirRecuperacaoTentativa(
    dados: NovaRecuperacaoTentativaSvo,
    trx: Knex.Transaction
  ): Promise<void> {
    await trx('solicitacoes_svo_recuperacoes_tentativa').insert(dados);
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
      .leftJoin(
        'solicitacoes_svo_recuperacoes_tentativa as r',
        'r.solicitacao_id',
        'c.solicitacao_id'
      )
      .where({
        's.canal_origem': 'EXTERNA',
        'c.chave_idempotencia_criacao': chaveIdempotencia,
      })
      .first<TentativaCriacaoExternaRow>(...COLUNAS_TENTATIVA_RECUPERACAO);
  },

  /**
   * Atualiza ultimo_acesso_em de forma atomica condicionada a credencial nao revogada
   * e dentro da janela de consulta publica, bloqueando corridas entre leitura e revogacao/expiracao.
   */
  async registrarAcessoValidoSeAutorizado(
    solicitacaoId: number,
    agora: Date,
    conexao: Knex = db
  ): Promise<boolean> {
    const resultado = await conexao.raw<{ rows: Array<{ solicitacao_id: number }> }>(
      `UPDATE solicitacoes_svo_credenciais_externas AS c
          SET ultimo_acesso_em = ?,
              atualizado_em = ?
         FROM solicitacoes_svo_dados_externos AS d
        WHERE c.solicitacao_id = ?
          AND d.solicitacao_id = c.solicitacao_id
          AND c.revogada_em IS NULL
          AND (d.consulta_publica_expira_em IS NULL OR d.consulta_publica_expira_em >= ?)
       RETURNING c.solicitacao_id`,
      [agora, agora, solicitacaoId, agora]
    );
    return (resultado.rows?.length ?? 0) > 0;
  },

  async registrarInicioAnalise(
    solicitacaoId: number,
    autorId: number,
    agora: Date,
    conexao: Knex = db
  ): Promise<boolean> {
    const linhas = await conexao('solicitacoes_svo_dados_externos')
      .where({ solicitacao_id: solicitacaoId })
      .whereNull('analise_iniciada_em')
      .update({
        analise_iniciada_em: agora,
        analise_iniciada_por: autorId,
        atualizado_em: agora,
      });
    return linhas > 0;
  },

  async registrarEncerramentoOperacional(
    solicitacaoId: number,
    encerradoEm: Date,
    conexao: Knex = db
  ): Promise<void> {
    await conexao('solicitacoes_svo_dados_externos')
      .where({ solicitacao_id: solicitacaoId })
      .whereNull('encerrado_operacional_em')
      .update({
        encerrado_operacional_em: encerradoEm,
        atualizado_em: encerradoEm,
      });
  },

  async revogarCredencial(
    solicitacaoId: number,
    motivo: string,
    agora: Date,
    conexao: Knex = db
  ): Promise<CredencialExternaRevogadaRow | undefined> {
    const [atualizada] = await conexao<CredencialExternaRevogadaRow>(
      'solicitacoes_svo_credenciais_externas'
    )
      .where({ solicitacao_id: solicitacaoId })
      .whereNull('revogada_em')
      .update({
        revogada_em: agora,
        revogada_motivo: motivo,
        atualizado_em: agora,
      })
      .returning([...COLUNAS_RETORNO_REVOGACAO]);

    await conexao('solicitacoes_svo_recuperacoes_tentativa')
      .where({ solicitacao_id: solicitacaoId })
      .whereNull('descartada_em')
      .update({ descartada_em: agora });

    if (atualizada) return atualizada;

    return conexao<CredencialExternaRevogadaRow>('solicitacoes_svo_credenciais_externas')
      .where({ solicitacao_id: solicitacaoId })
      .first(...COLUNAS_RETORNO_REVOGACAO);
  },
};
