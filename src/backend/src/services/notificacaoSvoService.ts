import type { Knex } from 'knex';
import { configNotificacoes } from '../config/notificacoes';
import { PERFIS } from '../constants/perfis';
import { UNIDADES } from '../constants/unidades';
import type { SolicitacaoSvo } from '../models/solicitacaoSvoModel';
import { publicarNotificacao } from './publicacaoNotificacoes';

export const URL_DESTINO_TRIAGEM_SVO = '/solicitacoes?aba=svo';
export const CATEGORIA_NOTIFICACAO_SVO = 'SVO';
export const EVENTO_SVO_S1 = 'SVO_SOLICITACAO_CRIADA';

async function listarAudienciaSvoAtiva(trx: Knex.Transaction): Promise<number[]> {
  return trx('usuarios as u')
    .leftJoin('gestores_unidades as gu', 'gu.usuario_id', 'u.id')
    .leftJoin('unidades as un', function () {
      this.on('un.id', '=', 'gu.unidade_id').andOnVal('un.nome', '=', UNIDADES.SVO);
    })
    .where('u.ativo', true)
    .andWhere(function () {
      this.where('u.perfil', PERFIS.ADMINISTRADOR).orWhere(function () {
        this.where('u.perfil', PERFIS.GESTOR_SVO).whereNotNull('un.id');
      });
    })
    .distinct().orderBy('u.id').pluck('u.id');
}

export const notificacaoSvoService = {
  async publicarAlertasRegistroSolicitacao(
    solicitacao: Pick<SolicitacaoSvo, 'id'>,
    registranteId: number,
    trx: Knex.Transaction,
  ): Promise<void> {
    if (!configNotificacoes.ativas) return;
    // SCRUM-233/S2: o formulário SVO ainda não fornece material_sensivel como fonte confirmada.
    await publicarNotificacao(trx, {
      tipo: EVENTO_SVO_S1,
      operacao: 'SVO',
      severidade: 'info',
      titulo: 'Nova solicitação SVO para triagem',
      mensagem: `A solicitação SVO #${solicitacao.id} aguarda análise na fila de triagem.`,
      urlDestino: URL_DESTINO_TRIAGEM_SVO,
      referencia: { tipo: 'SOLICITACAO_SVO', id: solicitacao.id },
      ocorrencia: 'criacao',
      autorId: registranteId,
      destinatarios: await listarAudienciaSvoAtiva(trx),
      push: {
        categoria: CATEGORIA_NOTIFICACAO_SVO,
        titulo: 'Nova solicitação SVO para triagem',
        corpo: 'Há uma solicitação aguardando análise.',
        tag: `svo-solicitacao-${solicitacao.id}`,
      },
    });
  },
};
