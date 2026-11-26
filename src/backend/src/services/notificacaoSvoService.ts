import type { Knex } from 'knex';
import { configNotificacoes } from '../config/notificacoes';
import { PERFIS } from '../constants/perfis';
import { ORDENS_SVO_EM_CURSO } from '../constants/statusOrdemSvo';
import { UNIDADES } from '../constants/unidades';
import type { ExcecaoOdometroRow } from '../models/excecaoOdometroModel';
import type { SolicitacaoSvo } from '../models/solicitacaoSvoModel';
import { deslocamentoDaOrdem, evidenciaDaFase } from './evidenciaOdometroTransicao';
import { limitar, publicarNotificacao } from './publicacaoNotificacoes';

export const URL_DESTINO_TRIAGEM_SVO = '/solicitacoes?aba=svo';
export const CATEGORIA_NOTIFICACAO_SVO = 'SVO';
export const EVENTO_SVO_S1 = 'SVO_SOLICITACAO_CRIADA';
// SCRUM-234 (docs/scrum-234-avisos-svo-s3-s5.md)
export const EVENTO_SVO_S3 = 'SVO_ORDEM_ATRIBUIDA';
export const EVENTO_SVO_S4 = 'SVO_ORDEM_REAGENDADA';
export const EVENTO_SVO_S5 = 'SVO_ORDEM_CANCELADA';
export const URL_DESTINO_INTEGRANTE_SVO = '/minhas-coletas';
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

/**
 * Quem está designado individualmente para a ordem: o motorista dela (perfil Motorista SVO) e cada
 * integrante com designação não revogada. Nunca a equipe inteira.
 */
export interface EquipeDaOrdem {
  ordemId: number;
  motoristaUsuarioId: number | null;
  motoristaId: number | null;
  equipeId: number | null;
  /** usuario_id → id da designação (ordens_svo_integrantes) */
  integrantes: Map<number, number>;
  inicio: Date | null;
  fim: Date | null;
  veiculoId: number | null;
}

const FORMATO_HORARIO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Maceio', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
const horario = (data: Date | null) => (data ? FORMATO_HORARIO.format(data) : null);

export async function equipeDaOrdem(trx: Knex.Transaction, ordemId: number): Promise<EquipeDaOrdem> {
  const ordem = await trx('ordens_svo as o')
    .leftJoin('motoristas as m', 'm.id', 'o.motorista_id')
    .leftJoin('usuarios as u', function () {
      this.on('u.id', '=', 'm.usuario_id').andOnVal('u.perfil', '=', PERFIS.MOTORISTA_SVO);
    })
    .where('o.id', ordemId)
    .first('o.inicio_previsto', 'o.fim_previsto', 'o.veiculo_id', 'o.motorista_id', 'o.equipe_id', 'u.id as motorista_usuario_id');
  const designacoes: { id: number; usuario_id: number }[] = await trx('ordens_svo_integrantes as d')
    .join('usuarios as u', 'u.id', 'd.usuario_id')
    .where({ 'd.ordem_id': ordemId, 'u.perfil': PERFIS.INTEGRANTE_SVO })
    .whereNull('d.revogado_em')
    .orderBy('d.usuario_id')
    .select('d.id', 'd.usuario_id');
  const data = (valor: unknown) => (valor ? new Date(valor as string) : null);
  return {
    ordemId,
    motoristaUsuarioId: ordem?.motorista_usuario_id ?? null,
    motoristaId: ordem?.motorista_id ?? null,
    equipeId: ordem?.equipe_id ?? null,
    integrantes: new Map(designacoes.map((d) => [d.usuario_id, d.id])),
    inicio: data(ordem?.inicio_previsto),
    fim: data(ordem?.fim_previsto),
    veiculoId: ordem?.veiculo_id ?? null,
  };
}

/** Conclusão vinda da transição: deslocamento físico encerrado, ou ordem antiga sem deslocamento. */
export type ConclusaoColetaSvo = { deslocamentoId: number; ordens: number[] } | { deslocamentoId: null; ordens: [number] };

export const notificacaoSvoService = {
  /** Equipe designada para os avisos S3 a S5; `null` com os avisos desligados (nenhuma consulta a mais). */
  async equipeParaAvisos(trx: Knex.Transaction, ordemId: number): Promise<EquipeDaOrdem | null> {
    return configNotificacoes.ativas ? equipeDaOrdem(trx, ordemId) : null;
  },

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
   * S3 (atribuição) e S4 (reagendamento), na transação da alocação ou da reprogramação. `antes` é a equipe
   * antes da reprogramação (`null` na alocação):
   * - quem entrou (motorista novo, integrante com designação nova) recebe S3;
   * - quem continua recebe S4 quando mudam horário, veículo ou composição;
   * - quem saiu não recebe nada e perde o acesso ao conteúdo dos avisos anteriores (designação revogada).
   */
  async publicarDesignacoes(
    antes: EquipeDaOrdem | null,
    depois: EquipeDaOrdem | null,
    autorId: number,
    trx: Knex.Transaction,
    auditoriaId?: number,
  ): Promise<void> {
    if (!configNotificacoes.ativas || !depois) return;
    if (antes && !auditoriaId) throw new Error('A reprogramação exige uma identidade persistida');
    const ocorrencia = auditoriaId === undefined ? 'alocacao' : `auditoria:${auditoriaId}`;
    const { ordemId } = depois;
    const quando = horario(depois.inicio);
    const tag = `ordem-svo-${ordemId}`;
    const atribuir = (urlDestino: string, ocorrencia: string, destinatario: number) =>
      publicarNotificacao(trx, {
        tipo: EVENTO_SVO_S3, operacao: 'SVO', severidade: 'info',
        titulo: 'Nova coleta SVO atribuída',
        mensagem: `Você foi designado para a ordem SVO #${ordemId}${quando ? `, com saída prevista para ${quando}` : ''}.`,
        urlDestino, referencia: { tipo: 'ORDEM_SVO', id: ordemId }, ocorrencia, autorId, destinatarios: [destinatario],
        push: { categoria: CATEGORIA_NOTIFICACAO_SVO, titulo: 'Nova coleta atribuída', corpo: 'Confira a coleta e o horário previsto.', tag },
      });
    const reagendar = (urlDestino: string, destinatarios: number[]) =>
      publicarNotificacao(trx, {
        tipo: EVENTO_SVO_S4, operacao: 'SVO', severidade: 'warning',
        titulo: 'Coleta SVO reagendada',
        mensagem: `A ordem SVO #${ordemId} foi reagendada${quando ? ` para ${quando}` : ''}.`,
        urlDestino, referencia: { tipo: 'ORDEM_SVO', id: ordemId }, ocorrencia, autorId, destinatarios,
        push: { categoria: CATEGORIA_NOTIFICACAO_SVO, titulo: 'Coleta reagendada', corpo: 'Confira as alterações na coleta.', tag },
      });

    const motorista = depois.motoristaUsuarioId;
    const coletaMudou = antes !== null && (
      antes.inicio?.getTime() !== depois.inicio?.getTime() || antes.fim?.getTime() !== depois.fim?.getTime() ||
      antes.veiculoId !== depois.veiculoId || antes.motoristaId !== depois.motoristaId ||
      antes.equipeId !== depois.equipeId || antes.integrantes.size !== depois.integrantes.size ||
      [...depois.integrantes.keys()].some((id) => !antes.integrantes.has(id))
    );
    if (motorista !== null) {
      if (antes?.motoristaUsuarioId !== motorista || antes.motoristaId !== depois.motoristaId) {
        await atribuir(URL_DESTINO_MOTORISTA_SVO, `motorista:${ocorrencia}`, motorista);
      } else if (coletaMudou) {
        await reagendar(URL_DESTINO_MOTORISTA_SVO, [motorista]);
      }
    }
    const continuam: number[] = [];
    for (const [usuarioId, designacaoId] of depois.integrantes) {
      if (antes?.integrantes.has(usuarioId)) continuam.push(usuarioId);
      else await atribuir(URL_DESTINO_INTEGRANTE_SVO, `designacao:${designacaoId}`, usuarioId);
    }
    if (coletaMudou && continuam.length) await reagendar(URL_DESTINO_INTEGRANTE_SVO, continuam);
  },

  /**
   * S5: cancelamento da ordem alocada. Avisa o motorista e os integrantes designados naquele momento. O
   * cancelamento não revoga as designações: quem participava continua vendo o histórico.
   */
  async publicarCancelamento(equipe: EquipeDaOrdem | null, autorId: number, trx: Knex.Transaction): Promise<void> {
    if (!configNotificacoes.ativas || !equipe) return;
    const { ordemId } = equipe;
    const cancelar = (urlDestino: string, destinatarios: number[]) =>
      publicarNotificacao(trx, {
        tipo: EVENTO_SVO_S5, operacao: 'SVO', severidade: 'danger',
        titulo: 'Coleta SVO cancelada',
        mensagem: `A ordem SVO #${ordemId} foi cancelada.`,
        urlDestino, referencia: { tipo: 'ORDEM_SVO', id: ordemId }, ocorrencia: 'cancelamento', autorId, destinatarios,
        push: { categoria: CATEGORIA_NOTIFICACAO_SVO, titulo: 'Coleta cancelada', corpo: 'Uma coleta designada a você foi cancelada.', tag: `ordem-svo-${ordemId}` },
      });
    if (equipe.motoristaUsuarioId !== null) await cancelar(URL_DESTINO_MOTORISTA_SVO, [equipe.motoristaUsuarioId]);
    if (equipe.integrantes.size) await cancelar(URL_DESTINO_INTEGRANTE_SVO, [...equipe.integrantes.keys()]);
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
   * O motivo resumido aparece apenas no aviso da central, sujeito ao acesso atual à ordem.
   */
  async publicarExcecaoSolicitada(
    excecao: { id: number; fase: FaseOdometro; motivo: string },
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
      mensagem: `A ordem SVO #${ordemId} pede autorização sem foto na ${NOME_FASE[excecao.fase]} (pedido nº ${excecao.id}). Motivo: ${limitar(excecao.motivo, 160)}`,
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

  /** Chamado sob a trava da agenda, após inserir, decidir ou encerrar um pedido. */
  async avisarProximoPedidoDoDeslocamento(
    ordemId: number,
    fase: FaseOdometro,
    trx: Knex.Transaction,
  ): Promise<boolean> {
    // A ordem só é vinculada ao deslocamento no início, quando seu pedido de saída encerra.
    if (!configNotificacoes.ativas || fase !== 'CHEGADA') return false;
    const deslocamento = await deslocamentoDaOrdem(trx, ordemId);
    if (deslocamento?.status !== 'EM_CURSO') return false;
    const ordem = await trx('ordens_svo').where({ id: ordemId }).first('veiculo_id', 'motorista_id');
    if (ordem?.veiculo_id !== deslocamento.veiculo_id || ordem.motorista_id !== deslocamento.motorista_id) return false;
    if (await evidenciaDaFase(trx, 'SVO', deslocamento.id, fase)) return true;

    const proximo = await trx<ExcecaoOdometroRow>('excecoes_odometro as e')
      .join('deslocamentos_svo_ordens as dor', 'dor.ordem_svo_id', 'e.ordem_svo_id')
      .join('ordens_svo as o', 'o.id', 'e.ordem_svo_id')
      .join('motoristas as m', 'm.id', 'o.motorista_id')
      .join('usuarios as u', function () {
        this.on('u.id', '=', 'm.usuario_id').andOn('u.id', '=', 'e.solicitada_por');
      })
      .where({
        'dor.deslocamento_svo_id': deslocamento.id,
        'e.tipo_operacao': 'SVO', 'e.fase': fase, 'e.status': 'PENDENTE',
        'e.motorista_id': deslocamento.motorista_id, 'o.motorista_id': deslocamento.motorista_id,
        'e.veiculo_id': deslocamento.veiculo_id, 'o.veiculo_id': deslocamento.veiculo_id,
        'u.ativo': true, 'u.perfil': PERFIS.MOTORISTA_SVO,
      })
      .whereNull('e.encerrada_em')
      .whereIn('o.status', [...ORDENS_SVO_EM_CURSO])
      .orderBy('e.id')
      .first('e.id', 'e.fase', 'e.motivo', 'e.ordem_svo_id', 'e.solicitada_por');
    if (proximo?.ordem_svo_id != null) {
      await this.publicarExcecaoSolicitada(proximo, proximo.ordem_svo_id, proximo.solicitada_por, trx);
    }
    return true;
  },

  /**
   * S8 (decisão): avisa o motorista SVO que fez o pedido, se ele continua ativo e no perfil. A justificativa
   * resumida aparece apenas no aviso da central, sujeito ao acesso atual à ordem.
   */
  async publicarExcecaoDecidida(
    excecao: { id: number; fase: FaseOdometro; solicitada_por: number },
    decisao: 'APROVADA' | 'RECUSADA',
    justificativa: string,
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
      mensagem: `Seu pedido nº ${excecao.id} para a ${NOME_FASE[excecao.fase]} da ordem SVO #${ordemId} foi ${aprovada ? 'aprovado' : 'recusado'}. Justificativa: ${limitar(justificativa, 160)}`,
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
