import type { Knex } from 'knex';
import { configNotificacoes } from '../config/notificacoes';
import { CATEGORIAS_NOTIFICACAO, REFERENCIAS_NOTIFICACAO } from '../constants/notificacoes';
import { PERFIS, type Perfil } from '../constants/perfis';
import type { SolicitacaoViagem } from '../models/solicitacaoViagemModel';
import { publicarNotificacao, type EventoNotificacao } from './publicacaoNotificacoes';

// Avisos A1 a A4 das solicitações administrativas (SCRUM-230). No push, que aparece na tela bloqueada,
// só textos fixos: sem motivo, nome, local ou número.

// Quem tem a tela de Solicitações. O autor que mudou para um perfil sem ela não é avisado
const PERFIS_COM_A_TELA: Perfil[] = [PERFIS.ADMINISTRADOR, PERFIS.SOLICITANTE, PERFIS.GESTOR_FROTA, PERFIS.GESTOR_SVO];

const comPerfil = (trx: Knex.Transaction, perfis: Perfil[]): Promise<number[]> =>
  trx('usuarios').whereIn('perfil', perfis).pluck('id');

async function autorDoPedido(trx: Knex.Transaction, solicitanteId: number | null, perfis: Perfil[]): Promise<number[]> {
  // Pedidos antigos podem não ter solicitante
  if (solicitanteId === null) return [];
  return trx('usuarios').where({ id: solicitanteId }).whereIn('perfil', perfis).pluck('id');
}

const push = (titulo: string, corpo: string, id: number): EventoNotificacao['push'] => ({
  categoria: CATEGORIAS_NOTIFICACAO.SOLICITACOES, titulo, corpo, tag: `solicitacao-${id}`,
});

const base = (id: number) => ({
  operacao: 'Administrativo' as const,
  urlDestino: '/solicitacoes',
  referencia: { tipo: REFERENCIAS_NOTIFICACAO.SOLICITACAO_VIAGEM, id },
  // Cada situação acontece uma vez só por pedido; o tipo do evento já distingue
  ocorrencia: '1',
});

export const avisosSolicitacao = {
  /** A1: quem analisa, só no sistema. */
  async criada(trx: Knex.Transaction, { id, solicitante_id }: Pick<SolicitacaoViagem, 'id' | 'solicitante_id'>): Promise<void> {
    if (!configNotificacoes.ativas) return;
    await publicarNotificacao(trx, {
      ...base(id),
      tipo: 'SOLICITACAO_CRIADA',
      titulo: 'Nova solicitação de viagem',
      mensagem: `A solicitação nº ${id} aguarda análise.`,
      autorId: solicitante_id,
      destinatarios: await comPerfil(trx, [PERFIS.GESTOR_FROTA, PERFIS.ADMINISTRADOR]),
    });
  },

  /** A2 e A3: o autor do pedido. O motivo da recusa fica só no sistema. */
  async decidida(
    trx: Knex.Transaction,
    { id, solicitante_id, status, motivo_recusa }: SolicitacaoViagem,
    analistaId: number
  ): Promise<void> {
    if (!configNotificacoes.ativas) return;
    const comum = { ...base(id), autorId: analistaId, destinatarios: await autorDoPedido(trx, solicitante_id, [PERFIS.SOLICITANTE, PERFIS.GESTOR_SVO]) };
    if (status === 'APROVADA') {
      await publicarNotificacao(trx, {
        ...comum,
        tipo: 'SOLICITACAO_APROVADA',
        severidade: 'success',
        titulo: 'Solicitação aprovada',
        mensagem: `A solicitação nº ${id} foi aprovada e aguarda agendamento.`,
        push: push('Solicitação aprovada', 'Sua solicitação de viagem foi aprovada.', id),
      });
    } else if (status === 'RECUSADA') {
      await publicarNotificacao(trx, {
        ...comum,
        tipo: 'SOLICITACAO_RECUSADA',
        severidade: 'danger',
        titulo: 'Solicitação recusada',
        mensagem: `A solicitação nº ${id} foi recusada. Motivo: ${motivo_recusa}`,
        push: push('Solicitação atualizada', 'Sua solicitação de viagem foi analisada. Veja no sistema.', id),
      });
    }
  },

  /** A4: o autor do pedido, com push, e o Gestor de Frota, só no sistema. Rotina automática, sem autor. */
  async expiradas(trx: Knex.Transaction, ids: number[]): Promise<void> {
    if (!configNotificacoes.ativas || ids.length === 0) return;
    const pedidos: { id: number; solicitante_id: number | null }[] = await trx('solicitacoes_viagem')
      .whereIn('id', ids).orderBy('id').select('id', 'solicitante_id');
    const gestores = await comPerfil(trx, [PERFIS.GESTOR_FROTA]);
    for (const { id, solicitante_id } of pedidos) {
      const comum = {
        ...base(id),
        tipo: 'SOLICITACAO_EXPIRADA',
        severidade: 'warning' as const,
        titulo: 'Solicitação expirada',
        mensagem: `A solicitação nº ${id} expirou sem agendamento.`,
        autorId: null,
      };
      // Primeiro o autor: se também for Gestor de Frota, recebe um aviso só, com push
      await publicarNotificacao(trx, {
        ...comum,
        destinatarios: await autorDoPedido(trx, solicitante_id, PERFIS_COM_A_TELA),
        push: push('Solicitação expirada', 'Sua solicitação de viagem expirou sem agendamento.', id),
      });
      await publicarNotificacao(trx, { ...comum, destinatarios: gestores });
    }
  },
};
