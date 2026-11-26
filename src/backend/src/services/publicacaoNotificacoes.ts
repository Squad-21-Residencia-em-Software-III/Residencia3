import type { Knex } from 'knex';
import { configNotificacoes } from '../config/notificacoes';
import { OPERACAO_DA_REFERENCIA, type OperacaoNotificacao, type ReferenciaNotificacao } from '../constants/referenciasNotificacao';
import { acordarFilaPush } from './filaPush';

// Limites das colunas (SCRUM-225) e do texto do push (SCRUM-237)
const LIMITE_TITULO = 120;
const LIMITE_MENSAGEM = 280;
export const LIMITE_TITULO_PUSH = 45;
export const LIMITE_CORPO_PUSH = 110;
// Com tipo e referência, a chave cabe nos 190 caracteres da coluna
const LIMITE_OCORRENCIA = 60;

export interface EventoNotificacao {
  /** Ex.: `VIAGEM_AGENDADA`. */
  tipo: string;
  operacao: OperacaoNotificacao;
  severidade?: 'info' | 'success' | 'warning' | 'danger';
  titulo: string;
  mensagem: string;
  /** Rota interna, ex.: `/viagens`. */
  urlDestino: string;
  referencia?: { tipo: ReferenciaNotificacao; id: number };
  /**
   * Identifica uma transição persistida. Repetir a mesma ocorrência não avisa de novo.
   */
  ocorrencia: string;
  /** Quem fez a ação nunca é avisado dela. `null`: rotina do sistema. */
  autorId: number | null;
  destinatarios: number[];
  /** Sem `push`, o aviso fica só no sistema. Aparece na tela bloqueada: sem dado pessoal nem sensível. */
  push?: {
    /** Igual à de `preferencias_notificacao.categoria`. */
    categoria: string;
    titulo: string;
    corpo: string;
    /** Alertas com a mesma tag se substituem no aparelho. */
    tag?: string;
  };
}

// Por caractere, e não por unidade UTF-16: o banco conta assim, e um emoji não é partido ao meio
export function limitar(texto: string, limite: number): string {
  const caracteres = [...texto.trim()];
  return caracteres.length <= limite ? caracteres.join('') : `${caracteres.slice(0, limite - 1).join('').trimEnd()}…`;
}

function chaveDe({ tipo, referencia, ocorrencia }: EventoNotificacao): string {
  return [tipo, referencia?.tipo ?? '', referencia?.id ?? '', ocorrencia].join(':');
}

/**
 * Cria os avisos In-App e as pendências de push **na transação da operação**: se ela for desfeita, nada
 * fica. Os serviços de domínio escolhem os destinatários; inativos e o autor são descartados aqui.
 * Uma falha aqui desfaz a operação; uma falha de envio do push, não (filaPush).
 * Com `NOTIFICACOES_ATIVAS` desligada, não faz nada.
 */
export async function publicarNotificacao(trx: Knex.Transaction, evento: EventoNotificacao): Promise<{ criadas: number }> {
  if (!configNotificacoes.ativas) return { criadas: 0 };
  if (evento.referencia && OPERACAO_DA_REFERENCIA[evento.referencia.tipo] !== evento.operacao) {
    throw new Error('Referência incompatível com a operação da notificação');
  }
  if (!trx.isTransaction) throw new Error('publicarNotificacao exige a transação da operação');
  const ocorrencia = evento.ocorrencia.trim();
  if (!ocorrencia || ocorrencia.length > LIMITE_OCORRENCIA) {
    throw new Error(`A ocorrência da notificação deve ter de 1 a ${LIMITE_OCORRENCIA} caracteres`);
  }

  const usuarios: number[] = await trx('usuarios')
    .whereIn('id', [...new Set(evento.destinatarios)])
    .where({ ativo: true })
    .modify((consulta) => {
      if (evento.autorId !== null) consulta.whereNot({ id: evento.autorId });
    })
    // Sempre na mesma ordem: duas operações que avisam as mesmas pessoas não entram em deadlock
    .orderBy('id')
    .pluck('id');
  if (usuarios.length === 0) return { criadas: 0 };

  const chave_idempotencia = chaveDe({ ...evento, ocorrencia });
  const comum = {
    operacao: evento.operacao,
    referencia_tipo: evento.referencia?.tipo ?? null,
    referencia_id: evento.referencia?.id ?? null,
    chave_idempotencia,
  };
  const criadas = await trx('notificacoes')
    .insert(usuarios.map((usuario_id) => ({
      ...comum,
      usuario_id,
      tipo: evento.tipo,
      titulo: limitar(evento.titulo, LIMITE_TITULO),
      mensagem: limitar(evento.mensagem, LIMITE_MENSAGEM),
      severidade: evento.severidade ?? 'info',
      url_destino: evento.urlDestino,
    })))
    .onConflict(['usuario_id', 'chave_idempotencia'])
    .ignore()
    .returning('id');

  const { push } = evento;
  if (push) {
    const avisos: { id: number; usuario_id: number }[] = await trx('notificacoes')
      .where({ chave_idempotencia })
      .whereIn('usuario_id', usuarios)
      .orderBy('usuario_id')
      .select('id', 'usuario_id');
    await trx('notificacao_outbox')
      .insert(avisos.map(({ id, usuario_id }) => ({
        ...comum,
        usuario_id,
        notificacao_id: id,
        evento_tipo: evento.tipo,
        categoria: push.categoria,
        ocorrencia_versao: ocorrencia,
        payload_push: JSON.stringify({
          notificacao_id: id,
          titulo: limitar(push.titulo, LIMITE_TITULO_PUSH),
          corpo: limitar(push.corpo, LIMITE_CORPO_PUSH),
          url: evento.urlDestino,
          ...(push.tag ? { tag: push.tag } : {}),
        }),
      })))
      .onConflict()
      .ignore();
    // Só depois do commit de fora (com savepoint, o de dentro ainda não vale); com rollback não há o que enviar
    let externa = trx;
    while (externa.parentTransaction) externa = externa.parentTransaction;
    externa.executionPromise.then(acordarFilaPush, () => undefined);
  }
  return { criadas: criadas.length };
}
