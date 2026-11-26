import type { Knex } from 'knex';
import { db } from '../config/database';

// Assinaturas e preferências de alerta no aparelho (tabelas da SCRUM-236). As chaves (`p256dh`, `auth`)
// permanecem no servidor ao enviar ou identificar o vínculo da assinatura.

export interface NovaAssinatura {
  usuario_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
}

const CANAL = 'WEB_PUSH';

export const pushAssinaturaModel = {
  /**
   * Cria ou renova a assinatura do aparelho. Renovar (mesmo usuário e endpoint) troca as chaves e reativa
   * uma assinatura expirada ou revogada. O gatilho do banco recusa (23514) o endpoint de outra pessoa e o
   * aparelho além do limite; a renovação do próprio endpoint não ocupa vaga nova.
   */
  async assinar(dados: NovaAssinatura, conexao: Knex = db): Promise<{ criada: boolean }> {
    const { rows } = await conexao.raw(
      `INSERT INTO push_subscriptions (usuario_id, endpoint, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET
         p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent,
         status = 'ATIVA', ativa = true, revogada_em = NULL, expirada_em = NULL,
         falhas_consecutivas = 0, atualizado_em = GREATEST(clock_timestamp(), push_subscriptions.criado_em)
       WHERE push_subscriptions.usuario_id = EXCLUDED.usuario_id
       RETURNING (xmax = 0) AS criada`,
      [dados.usuario_id, dados.endpoint, dados.p256dh, dados.auth, dados.user_agent]
    );
    // Sem linha: o endpoint é de outra pessoa (o gatilho normalmente recusa antes)
    if (rows.length === 0) throw Object.assign(new Error('ENDPOINT_DE_OUTRO_USUARIO'), { code: '23514' });
    return { criada: Boolean(rows[0].criada) };
  },

  async chavesDaAssinaturaAtiva(usuario_id: number, endpoint: string, conexao: Knex = db) {
    return conexao<NovaAssinatura & { ativa: boolean; id: number; geracao_vinculo: number }>('push_subscriptions')
      .where({ usuario_id, endpoint, ativa: true }).first('id', 'geracao_vinculo', 'p256dh', 'auth');
  },

  /** Apaga (as chaves não ficam guardadas sem uso). Só a do próprio usuário; repetir não tem efeito. */
  async cancelar(usuario_id: number, endpoint: string, conexao: Knex = db): Promise<void> {
    await conexao('push_subscriptions').where({ usuario_id, endpoint }).del();
  },

  async preferencias(usuario_id: number, conexao: Knex = db): Promise<Map<string, boolean>> {
    const linhas: { categoria: string; habilitado: boolean }[] = await conexao('preferencias_notificacao')
      .where({ usuario_id, canal: CANAL })
      .select('categoria', 'habilitado');
    return new Map(linhas.map(({ categoria, habilitado }) => [categoria, habilitado]));
  },

  async salvarPreferencia(usuario_id: number, categoria: string, habilitado: boolean, conexao: Knex = db): Promise<void> {
    await conexao('preferencias_notificacao')
      .insert({ usuario_id, categoria, canal: CANAL, habilitado })
      .onConflict(['usuario_id', 'categoria', 'canal'])
      .merge({ habilitado, atualizado_em: conexao.raw('GREATEST(clock_timestamp(), preferencias_notificacao.criado_em)') });
  },
};
