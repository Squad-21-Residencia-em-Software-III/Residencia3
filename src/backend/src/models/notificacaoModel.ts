import type { Knex } from 'knex';
import { db } from '../config/database';

export type OperacaoNotificacao = 'Administrativo' | 'SVO';

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
}

/** `em` é texto com microssegundos: em `Date` a precisão cai para milissegundos e a página seguinte repetiria itens. */
export interface CursorNotificacao {
  em: string;
  id: number;
}

export interface FiltroNaoLidas {
  ateId?: number;
  referencia?: { tipo: string; id: number };
}

const CAMPOS = [
  'id', 'tipo', 'titulo', 'mensagem', 'severidade', 'operacao',
  'referencia_tipo', 'referencia_id', 'url_destino', 'lida_em', 'criado_em',
] as const;

// A leitura nunca fica antes da criação (chk_notificacoes_leitura_temporal)
const AGORA = 'GREATEST(clock_timestamp(), criado_em)';

const doEscopo = (escopo: EscopoNotificacoes, conexao: Knex) =>
  conexao('notificacoes').where({ usuario_id: escopo.usuarioId }).whereIn('operacao', escopo.operacoes);

export const notificacaoModel = {
  async listar(
    escopo: EscopoNotificacoes,
    { limite, cursor, apenasNaoLidas }: { limite: number; cursor?: CursorNotificacao; apenasNaoLidas?: boolean },
    conexao: Knex = db
  ): Promise<{ itens: Notificacao[]; proximo?: CursorNotificacao }> {
    const consulta = doEscopo(escopo, conexao)
      .select(...CAMPOS)
      .select(conexao.raw(`to_char(criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_em`))
      .orderBy([{ column: 'criado_em', order: 'desc' }, { column: 'id', order: 'desc' }])
      .limit(limite + 1);
    if (cursor) consulta.whereRaw('(criado_em, id) < (?::timestamptz, ?::integer)', [cursor.em, cursor.id]);
    if (apenasNaoLidas) consulta.whereNull('lida_em');

    const linhas: (Notificacao & { cursor_em: string })[] = await consulta;
    const pagina = linhas.slice(0, limite);
    const ultima = pagina[pagina.length - 1];
    return {
      itens: pagina.map(({ cursor_em: _, ...item }) => item),
      ...(linhas.length > limite && ultima ? { proximo: { em: ultima.cursor_em, id: ultima.id } } : {}),
    };
  },

  async contarNaoLidas(escopo: EscopoNotificacoes, conexao: Knex = db): Promise<{ total: number; ultimoId: number }> {
    const linha = await doEscopo(escopo, conexao)
      .whereNull('lida_em')
      .first(conexao.raw('count(*)::integer AS total'), conexao.raw('coalesce(max(id), 0) AS "ultimoId"'));
    return linha as unknown as { total: number; ultimoId: number };
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
    if (filtro.ateId !== undefined) alvos.where('id', '<=', filtro.ateId);
    if (filtro.referencia) {
      alvos.where({ referencia_tipo: filtro.referencia.tipo, referencia_id: filtro.referencia.id });
    }
    // Sempre na ordem do id: duas marcações simultâneas do mesmo usuário não entram em deadlock
    alvos.orderBy('id').forUpdate();
    return conexao('notificacoes').whereIn('id', alvos).update({ lida_em: conexao.raw(AGORA) });
  },
};
