import type { Knex } from 'knex';
import { db } from '../config/database';

export interface PayloadPush {
  notificacao_id: number;
  titulo: string;
  corpo: string;
  url: string;
  tag?: string;
}

export interface ItemFilaPush {
  id: number;
  usuario_id: number;
  categoria: string;
  /** `entregues`: aparelhos que já receberam, para uma nova tentativa não repetir o alerta neles. */
  payload_push: PayloadPush & { entregues?: number[] };
  /** Já conta a tentativa atual. Também identifica quem reservou o item (ver `concluir`). */
  tentativas: number;
  max_tentativas: number;
}

export interface AssinaturaAtiva {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type MotivoIgnorado =
  | 'PRAZO_ENCERRADO' | 'USUARIO_INATIVO' | 'CATEGORIA_DESLIGADA' | 'SEM_ASSINATURA';

export interface FalhaEnvio {
  erro: string;
  statusHttp: number | null;
}

export type Conclusao =
  | { status: 'ENVIADO' }
  | { status: 'IGNORADO'; erro: MotivoIgnorado }
  | ({ status: 'FALHA_DEFINITIVA' } & FalhaEnvio)
  | ({ status: 'PENDENTE'; esperaSegundos: number; entregues: number[] } & FalhaEnvio);

const TABELA = 'notificacao_outbox';
// Nunca antes da criação (chk_notificacao_outbox_processamento_coerente)
const AGORA = 'GREATEST(clock_timestamp(), criado_em)';

export const notificacaoOutboxModel = {
  /** Encerra o que ficou velho (ex.: servidor parado) e o que caiu na última tentativa. */
  async encerrarVencidos(horasValidade: number, conexao: Knex = db): Promise<number> {
    const { rowCount } = await conexao.raw(
      `UPDATE ${TABELA} SET
         status = CASE WHEN tentativas >= max_tentativas THEN 'FALHA_DEFINITIVA' ELSE 'IGNORADO' END,
         ultimo_erro = CASE WHEN tentativas >= max_tentativas THEN 'PROCESSO_INTERROMPIDO' ELSE 'PRAZO_ENCERRADO' END,
         bloqueado_ate = NULL, processado_em = ${AGORA}, atualizado_em = ${AGORA}
       WHERE id IN (
         SELECT id FROM ${TABELA}
         WHERE (status = 'PENDENTE' OR (status = 'PROCESSANDO' AND bloqueado_ate < clock_timestamp()))
           AND (criado_em < clock_timestamp() - ? * interval '1 hour' OR tentativas >= max_tentativas)
         ORDER BY id LIMIT 1000 FOR UPDATE SKIP LOCKED)`,
      [horasValidade]
    );
    return rowCount;
  },

  /**
   * Reserva itens por tempo limitado. `SKIP LOCKED`: dois processos nunca pegam o mesmo. A reserva de um
   * processo que caiu vence e o item volta para a fila.
   */
  async reservar(limite: number, segundos: number, horasValidade: number, conexao: Knex = db): Promise<ItemFilaPush[]> {
    const { rows } = await conexao.raw(
      `UPDATE ${TABELA} SET status = 'PROCESSANDO', tentativas = tentativas + 1,
         bloqueado_ate = clock_timestamp() + ? * interval '1 second', atualizado_em = clock_timestamp()
       WHERE id IN (
         SELECT id FROM ${TABELA}
         WHERE ((status = 'PENDENTE' AND proxima_execucao_em <= clock_timestamp())
             OR (status = 'PROCESSANDO' AND bloqueado_ate < clock_timestamp()))
           AND tentativas < max_tentativas
           AND criado_em >= clock_timestamp() - ? * interval '1 hour'
         ORDER BY proxima_execucao_em, id LIMIT ? FOR UPDATE SKIP LOCKED)
       RETURNING id, usuario_id, categoria, payload_push, tentativas, max_tentativas`,
      [segundos, horasValidade, limite]
    );
    return rows;
  },

  /** Sem efeito se a reserva venceu e outro processo assumiu o item. */
  async concluir({ id, tentativas }: ItemFilaPush, c: Conclusao, conexao: Knex = db): Promise<boolean> {
    const alteradas = await conexao(TABELA)
      .where({ id, tentativas, status: 'PROCESSANDO' })
      .update({
        status: c.status,
        bloqueado_ate: null,
        atualizado_em: conexao.raw(AGORA),
        ultimo_erro: c.status === 'ENVIADO' ? null : c.erro,
        ...('statusHttp' in c ? { ultimo_status_http: c.statusHttp } : {}),
        ...(c.status === 'PENDENTE'
          ? {
              proxima_execucao_em: conexao.raw("clock_timestamp() + ? * interval '1 second'", [c.esperaSegundos]),
              payload_push: conexao.raw('payload_push || ?::jsonb', [JSON.stringify({ entregues: c.entregues })]),
            }
          : { processado_em: conexao.raw(AGORA) }),
      });
    return alteradas > 0;
  },

  /** Milissegundos até o próximo item da fila; `null` se não há nenhum. */
  async esperaAteProximo(conexao: Knex = db): Promise<number | null> {
    const { rows } = await conexao.raw(
      `SELECT (extract(epoch FROM min(CASE WHEN status = 'PROCESSANDO' THEN bloqueado_ate ELSE proxima_execucao_em END)
         - clock_timestamp()) * 1000)::float8 AS espera
       FROM ${TABELA} WHERE status IN ('PENDENTE', 'PROCESSANDO')`
    );
    const espera: number | null = rows[0].espera;
    return espera === null ? null : Math.max(0, Math.ceil(espera));
  },

  /** Conferido na hora do envio: o usuário pode ter mudado a escolha depois de o aviso ser criado. */
  async destino(
    { usuario_id, categoria }: ItemFilaPush,
    conexao: Knex = db
  ): Promise<MotivoIgnorado | AssinaturaAtiva[]> {
    if (!(await conexao('usuarios').where({ id: usuario_id, ativo: true }).first('id'))) return 'USUARIO_INATIVO';
    // Sem escolha registrada, a categoria fica desligada (padrão da SCRUM-236)
    const ligada = await conexao('preferencias_notificacao')
      .where({ usuario_id, categoria, canal: 'WEB_PUSH', habilitado: true })
      .first('id');
    if (!ligada) return 'CATEGORIA_DESLIGADA';
    const assinaturas: AssinaturaAtiva[] = await conexao('push_subscriptions')
      .where({ usuario_id, ativa: true })
      .orderBy('id')
      .select('id', 'endpoint', 'p256dh', 'auth');
    return assinaturas.length > 0 ? assinaturas : 'SEM_ASSINATURA';
  },

  /** As chaves entram na condição: se a pessoa assinou de novo no meio do envio, o resultado antigo não vale. */
  async registrarEnvio(
    { id, p256dh, auth }: AssinaturaAtiva,
    resultado: 'sucesso' | 'expirada' | 'falha',
    statusHttp: number | null,
    conexao: Knex = db
  ): Promise<void> {
    const agora = conexao.raw(AGORA);
    const campos = {
      sucesso: { falhas_consecutivas: 0, ultimo_sucesso_em: agora },
      falha: { falhas_consecutivas: conexao.raw('falhas_consecutivas + 1'), ultimo_erro_em: agora },
      expirada: { status: 'EXPIRADA', ativa: false, expirada_em: agora, ultimo_erro_em: agora },
    }[resultado];
    await conexao('push_subscriptions')
      .where({ id, p256dh, auth, ativa: true })
      .update({ ...campos, ultimo_status_http: statusHttp, atualizado_em: agora });
  },
};
