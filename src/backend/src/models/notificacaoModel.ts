import type { Knex } from 'knex';
import { db } from '../config/database';
import {
  OPERACAO_DA_REFERENCIA,
  type OperacaoNotificacao,
  type ReferenciaNotificacao,
  type VinculoComRegistro,
} from '../constants/referenciasNotificacao';

export interface Notificacao {
  id: number;
  tipo: string;
  titulo: string;
  mensagem: string;
  severidade: 'info' | 'success' | 'warning' | 'danger';
  operacao: OperacaoNotificacao;
  referencia_tipo: string | null;
  referencia_id: number | null;
  url_destino: string;
  lida_em: Date | null;
  criado_em: Date;
}

/** O que o usuário da sessão pode ver. Toda consulta e alteração passa por aqui. */
export interface EscopoNotificacoes {
  usuarioId: number;
  operacoes: OperacaoNotificacao[];
  /** Como o usuário acessa cada tipo de registro; sem o tipo, não acessa. */
  acesso: Partial<Record<ReferenciaNotificacao, VinculoComRegistro>>;
}

/** `em` é texto com microssegundos: em `Date` a precisão cai para milissegundos e a página seguinte repetiria itens. */
export interface CursorNotificacao {
  em: string;
  id: number;
}

export interface FiltroNaoLidas {
  ids?: number[];
  referencia?: { tipo: ReferenciaNotificacao; id: number };
}

const CAMPOS = [
  'id', 'tipo', 'titulo', 'mensagem', 'severidade', 'operacao',
  'referencia_tipo', 'referencia_id', 'url_destino', 'lida_em', 'criado_em',
] as const;

// A leitura nunca fica antes da criação (chk_notificacoes_leitura_temporal)
const AGORA = 'GREATEST(clock_timestamp(), criado_em)';

const doEscopo = (escopo: EscopoNotificacoes, conexao: Knex) =>
  conexao('notificacoes').where({ usuario_id: escopo.usuarioId }).whereIn('operacao', escopo.operacoes);

// Prova do vínculo com o registro agora, e não quando o aviso foi criado. Só com a linha da página
const PROVAS: Record<ReferenciaNotificacao, Partial<Record<VinculoComRegistro, string>>> = {
  SOLICITACAO_VIAGEM: {
    solicitante: 'SELECT 1 FROM solicitacoes_viagem r WHERE r.id = notificacoes.referencia_id AND r.solicitante_id = notificacoes.usuario_id',
  },
  VIAGEM_FROTA: {
    solicitante: `SELECT 1 FROM viagens_frota r JOIN solicitacoes_viagem s ON s.id = r.solicitacao_id
      WHERE r.id = notificacoes.referencia_id AND s.solicitante_id = notificacoes.usuario_id`,
    condutor: `SELECT 1 FROM viagens_frota r JOIN motoristas m ON m.id = r.motorista_id
      WHERE r.id = notificacoes.referencia_id AND m.usuario_id = notificacoes.usuario_id`,
  },
  SOLICITACAO_SVO: {},
  ORDEM_SVO: {
    condutor: `SELECT 1 FROM ordens_svo r JOIN motoristas m ON m.id = r.motorista_id
      WHERE r.id = notificacoes.referencia_id AND m.usuario_id = notificacoes.usuario_id`,
    designado: `SELECT 1 FROM ordens_svo_integrantes r
      WHERE r.ordem_id = notificacoes.referencia_id AND r.usuario_id = notificacoes.usuario_id AND r.revogado_em IS NULL`,
  },
};

/** Aviso sem registro de origem é livre. Tipo desconhecido, ou que o perfil não acessa, não é. */
function temAcessoSql({ acesso }: EscopoNotificacoes): string {
  const casos = (Object.keys(PROVAS) as ReferenciaNotificacao[]).map((tipo) => {
    const vinculo = acesso[tipo];
    const prova = vinculo === undefined ? undefined : PROVAS[tipo][vinculo];
    const condicao = vinculo === 'gestao' ? 'true' : prova ? `EXISTS (${prova})` : 'false';
    return `WHEN referencia_tipo = '${tipo}' AND operacao = '${OPERACAO_DA_REFERENCIA[tipo]}' THEN ${condicao}`;
  });
  return `CASE WHEN referencia_tipo IS NULL THEN true ${casos.join(' ')} ELSE false END`;
}

export const notificacaoModel = {
  async podeEntregar(escopo: EscopoNotificacoes, id: number, conexao: Knex = db): Promise<boolean> {
    const aviso = await doEscopo(escopo, conexao).where({ id }).whereRaw(temAcessoSql(escopo)).first('id');
    return Boolean(aviso);
  },

  async listar(
    escopo: EscopoNotificacoes,
    { limite, cursor, apenasNaoLidas }: { limite: number; cursor?: CursorNotificacao; apenasNaoLidas?: boolean },
    conexao: Knex = db
  ): Promise<{ itens: (Notificacao & { tem_acesso: boolean })[]; proximo?: CursorNotificacao }> {
    const consulta = doEscopo(escopo, conexao)
      .select(...CAMPOS)
      .select(conexao.raw(`${temAcessoSql(escopo)} AS tem_acesso`))
      .select(conexao.raw(`to_char(criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_em`))
      .orderBy([{ column: 'criado_em', order: 'desc' }, { column: 'id', order: 'desc' }])
      .limit(limite + 1);
    if (cursor) consulta.whereRaw('(criado_em, id) < (?::timestamptz, ?::integer)', [cursor.em, cursor.id]);
    if (apenasNaoLidas) consulta.whereNull('lida_em');

    const linhas: (Notificacao & { tem_acesso: boolean; cursor_em: string })[] = await consulta;
    const pagina = linhas.slice(0, limite);
    const ultima = pagina[pagina.length - 1];
    return {
      itens: pagina.map(({ cursor_em: _, ...item }) => item),
      ...(linhas.length > limite && ultima ? { proximo: { em: ultima.cursor_em, id: ultima.id } } : {}),
    };
  },

  /** `soma` dos ids: muda quando um aviso é lido e outro chega, mesmo com o total igual. */
  async contarNaoLidas(escopo: EscopoNotificacoes, conexao: Knex = db): Promise<{ total: number; soma: string }> {
    const linha = await doEscopo(escopo, conexao)
      .whereNull('lida_em')
      .first(conexao.raw('count(*)::integer AS total'), conexao.raw('coalesce(sum(id), 0)::text AS soma'));
    return linha as unknown as { total: number; soma: string };
  },

  /** Repetir mantém a data da primeira leitura. Sem retorno: não existe ou não é do usuário. */
  async marcarLida(
    escopo: EscopoNotificacoes,
    id: number,
    conexao: Knex = db
  ): Promise<{ id: number; lida_em: Date } | undefined> {
    const [linha] = await doEscopo(escopo, conexao)
      .where({ id })
      .update({ lida_em: conexao.raw(`COALESCE(lida_em, ${AGORA})`) })
      .returning(['id', 'lida_em']);
    return linha;
  },

  async marcarNaoLidas(escopo: EscopoNotificacoes, filtro: FiltroNaoLidas = {}, conexao: Knex = db): Promise<number> {
    const alvos = doEscopo(escopo, conexao).select('id').whereNull('lida_em');
    if (filtro.ids !== undefined) alvos.whereIn('id', filtro.ids);
    if (filtro.referencia) {
      const { tipo, id } = filtro.referencia;
      alvos.where({ referencia_tipo: tipo, referencia_id: id, operacao: OPERACAO_DA_REFERENCIA[tipo] });
    }
    // Sempre na ordem do id: duas marcações simultâneas do mesmo usuário não entram em deadlock
    alvos.orderBy('id').forUpdate();
    return conexao('notificacoes').whereIn('id', alvos).update({ lida_em: conexao.raw(AGORA) });
  },
};
