import type { Knex } from 'knex';
import { configNotificacoes } from '../config/notificacoes';
import { PERFIS } from '../constants/perfis';
import { UNIDADES } from '../constants/unidades';
import type { SolicitacaoSvo } from '../models/solicitacaoSvoModel';
import { publicarNotificacao } from './publicacaoNotificacoes';

export const URL_DESTINO_TRIAGEM_SVO = '/solicitacoes?aba=svo';
export const CATEGORIA_NOTIFICACAO_SVO = 'SVO';
export const EVENTO_SVO_S1 = 'SVO_SOLICITACAO_CRIADA';
// SCRUM-235 (docs/scrum-235-avisos-svo-s6-s8.md)
export const EVENTO_SVO_S6 = 'SVO_CHEGADA_LOCAL';
export const EVENTO_SVO_S7 = 'SVO_COLETA_CONCLUIDA';
// Mesmos tipos de A9/A10: o pedido e a decisão são do mesmo fluxo, separados pela operação e pela referência
export const EVENTO_SVO_S8_PEDIDO = 'EXCECAO_ODOMETRO_SOLICITADA';
export const EVENTO_SVO_S8_DECISAO = 'EXCECAO_ODOMETRO_DECIDIDA';
export const URL_DESTINO_OPERACAO_SVO = '/viagens?aba=svo';
export const URL_DESTINO_MOTORISTA_SVO = '/viagens';
// Ordens citadas na mensagem de conclusão; o restante vira uma contagem
const ORDENS_NA_MENSAGEM = 10;

type FaseOdometro = 'SAIDA' | 'CHEGADA';
const NOME_FASE: Record<FaseOdometro, string> = { SAIDA: 'saída', CHEGADA: 'chegada' };

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

// Só gestores SVO ativos e associados à unidade SVO (quem decide os pedidos sem foto do SVO)
async function listarGestoresSvoAssociados(trx: Knex.Transaction): Promise<number[]> {
  return trx('usuarios as u')
    .join('gestores_unidades as gu', 'gu.usuario_id', 'u.id')
    .join('unidades as un', 'un.id', 'gu.unidade_id')
    .where({ 'u.ativo': true, 'u.perfil': PERFIS.GESTOR_SVO, 'un.nome': UNIDADES.SVO })
    .distinct().orderBy('u.id').pluck('u.id');
}

function listaDeOrdens(ids: number[]): string {
  const citadas = ids.slice(0, ORDENS_NA_MENSAGEM).map((id) => `#${id}`).join(', ');
  const resto = ids.length - ORDENS_NA_MENSAGEM;
  return resto > 0 ? `${citadas} e mais ${resto}` : citadas;
}

/** Conclusão vinda da transição: deslocamento físico encerrado, ou ordem antiga sem deslocamento. */
export type ConclusaoColetaSvo = { deslocamentoId: number; ordens: number[] } | { deslocamentoId: null; ordens: [number] };

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

  /**
   * S6: chegada ao local (NO_LOCAL). Uma por ordem: cada coleta tem o próprio local. Só na central, sem push.
   * A transição NO_LOCAL só acontece uma vez por ordem; a ocorrência fixa impede repetição em reenvio.
   */
  async publicarChegadaLocal(ordemId: number, autorId: number, trx: Knex.Transaction): Promise<void> {
    if (!configNotificacoes.ativas) return;
    await publicarNotificacao(trx, {
      tipo: EVENTO_SVO_S6,
      operacao: 'SVO',
      severidade: 'info',
      titulo: 'Equipe chegou ao local da coleta',
      mensagem: `A ordem SVO #${ordemId} registrou chegada ao local.`,
      urlDestino: URL_DESTINO_OPERACAO_SVO,
      referencia: { tipo: 'ORDEM_SVO', id: ordemId },
      ocorrencia: 'chegada-local',
      autorId,
      destinatarios: await listarAudienciaSvoAtiva(trx),
    });
  },

  /**
   * S7: conclusão. Uma por deslocamento físico, quando a última ordem dele termina: várias ordens no mesmo
   * veículo não geram um aviso cada. Só na central, sem push. A referência é a ordem que encerrou o deslocamento.
   */
  async publicarConclusaoColeta(
    conclusao: ConclusaoColetaSvo,
    ordemId: number,
    autorId: number,
    trx: Knex.Transaction,
  ): Promise<void> {
    if (!configNotificacoes.ativas) return;
    const { deslocamentoId, ordens } = conclusao;
    const varias = ordens.length > 1;
    await publicarNotificacao(trx, {
      tipo: EVENTO_SVO_S7,
      operacao: 'SVO',
      severidade: 'success',
      titulo: varias ? 'Coletas SVO concluídas' : 'Coleta SVO concluída',
      mensagem: varias
        ? `O deslocamento das ordens SVO ${listaDeOrdens(ordens)} foi concluído.`
        : `A ordem SVO #${ordens[0]} foi concluída.`,
      urlDestino: URL_DESTINO_OPERACAO_SVO,
      referencia: { tipo: 'ORDEM_SVO', id: ordemId },
      ocorrencia: deslocamentoId === null ? `ordem:${ordemId}` : `deslocamento:${deslocamentoId}`,
      autorId,
      destinatarios: await listarAudienciaSvoAtiva(trx),
    });
  },

  /**
   * S8 (pedido): o motorista SVO pediu autorização sem foto. Avisa os gestores SVO associados, com push.
   * Motivo, local e dados da solicitação ficam fora do aviso: o gestor vê o pedido na tela, com acesso conferido.
   */
  async publicarExcecaoSolicitada(
    excecao: { id: number; fase: FaseOdometro },
    ordemId: number,
    autorId: number,
    trx: Knex.Transaction,
  ): Promise<void> {
    if (!configNotificacoes.ativas) return;
    await publicarNotificacao(trx, {
      tipo: EVENTO_SVO_S8_PEDIDO,
      operacao: 'SVO',
      severidade: 'warning',
      titulo: 'Pedido de autorização sem foto',
      mensagem: `A ordem SVO #${ordemId} pede autorização sem foto na ${NOME_FASE[excecao.fase]} (pedido nº ${excecao.id}).`,
      urlDestino: URL_DESTINO_OPERACAO_SVO,
      referencia: { tipo: 'ORDEM_SVO', id: ordemId },
      ocorrencia: `${excecao.fase}:${excecao.id}:solicitada`,
      autorId,
      destinatarios: await listarGestoresSvoAssociados(trx),
      push: {
        categoria: CATEGORIA_NOTIFICACAO_SVO,
        titulo: 'Pedido sem foto',
        corpo: 'Um pedido de autorização aguarda análise.',
        tag: `svo-excecao-${excecao.id}`,
      },
    });
  },

  /**
   * S8 (decisão): avisa o motorista SVO que fez o pedido, se ele continua ativo e no perfil. A justificativa
   * fica fora do aviso (pode citar a ocorrência): o motorista a consulta na tela do pedido.
   */
  async publicarExcecaoDecidida(
    excecao: { id: number; fase: FaseOdometro; solicitada_por: number },
    decisao: 'APROVADA' | 'RECUSADA',
    ordemId: number,
    autorId: number,
    trx: Knex.Transaction,
  ): Promise<void> {
    if (!configNotificacoes.ativas) return;
    const ativo = await trx('usuarios')
      .where({ id: excecao.solicitada_por, perfil: PERFIS.MOTORISTA_SVO, ativo: true }).first('id');
    if (!ativo) return;
    const aprovada = decisao === 'APROVADA';
    await publicarNotificacao(trx, {
      tipo: EVENTO_SVO_S8_DECISAO,
      operacao: 'SVO',
      severidade: aprovada ? 'success' : 'warning',
      titulo: aprovada ? 'Autorização sem foto aprovada' : 'Autorização sem foto recusada',
      mensagem: `Seu pedido nº ${excecao.id} para a ${NOME_FASE[excecao.fase]} da ordem SVO #${ordemId} foi ${aprovada ? 'aprovado' : 'recusado'}.`,
      urlDestino: URL_DESTINO_MOTORISTA_SVO,
      referencia: { tipo: 'ORDEM_SVO', id: ordemId },
      ocorrencia: `${excecao.fase}:${excecao.id}:${decisao.toLowerCase()}`,
      autorId,
      destinatarios: [excecao.solicitada_por],
      push: {
        categoria: CATEGORIA_NOTIFICACAO_SVO,
        titulo: 'Decisão do pedido sem foto',
        corpo: aprovada ? 'Seu pedido foi aprovado.' : 'Seu pedido foi recusado.',
        tag: `svo-excecao-${excecao.id}`,
      },
    });
  },
};
