import type { Knex } from 'knex';
import { PERFIS } from '../constants/perfis';
import { UNIDADES } from '../constants/unidades';
import type { SolicitacaoSvo } from '../models/solicitacaoSvoModel';

export const URL_DESTINO_TRIAGEM_SVO = '/solicitacoes?aba=svo';
export const CATEGORIA_NOTIFICACAO_SVO = 'SVO_TRIAGEM';
export const EVENTO_SVO_S1 = 'SVO_SOLICITACAO_CRIADA';
export const EVENTO_SVO_S2 = 'SVO_PRIORIDADE_MATERIAL_SENSIVEL';

/**
 * Mapeamento de domínio da fonte legítima de material sensível no SVO (S2):
 *
 * - Estado atual na branch `develop`: BLOQUEADO (`false`).
 * - Motivo do bloqueio: o formulário e o fluxo de domínio do SVO ainda não possuem
 *   checkbox/atributo funcional confirmado de material sensível no SVO.
 * - Regra de isolamento: o campo `solicitacoes_viagem.material_sensivel` pertence
 *   exclusivamente ao fluxo administrativo e JAMAIS deve ser reaproveitado como
 *   fonte para alertas SVO S2.
 * - Ativação futura: somente após confirmação explícita de domínio e entrega do
 *   campo/checkbox oficial no fluxo SVO.
 */
export const FONTE_MATERIAL_SENSIVEL_SVO_CONFIRMADA = false;

export interface ContextoDominioSvo {
  /** Flag explícita de domínio confirmando que o atributo SVO oficial está ativo */
  fonteMaterialSensivelSvoConfirmada?: boolean;
  /** Valor vindo exclusivamente da fonte legítima de domínio SVO (nunca de solicitacoes_viagem) */
  materialSensivelSvoDominio?: boolean;
}

export interface ResultadoPublicacaoAlertasSvo {
  s1PublicadosInApp: number;
  s1EnfileiradosOutbox: number;
  s2PublicadosInApp: number;
  s2EnfileiradosOutbox: number;
  s2BloqueadoMotivo: string | null;
}

interface DestinatarioSvo {
  id: number;
  perfil: string;
  pushHabilitado: boolean;
}

function tabelaExiste(trx: Knex.Transaction, nomeTabela: string): Promise<boolean> {
  return trx
    .raw<{ rows: Array<{ reg: string | null }> }>('SELECT to_regclass(?) AS reg', [nomeTabela])
    .then((res) => Boolean(res.rows[0]?.reg));
}

/**
 * Seleciona estritamente usuários ativos com perfil ADMINISTRADOR ou GESTOR_SVO
 * formalmente associados à unidade SVO (`gestores_unidades` + `unidades.nome = 'SVO'`).
 */
async function listarAudienciaSvoAtiva(
  trx: Knex.Transaction,
  verificarPreferenciasPush: boolean,
): Promise<DestinatarioSvo[]> {
  const query = trx('usuarios as u')
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
    .distinct('u.id', 'u.perfil')
    .orderBy('u.id', 'asc');

  if (verificarPreferenciasPush) {
    query
      .leftJoin('preferencias_notificacao as pn', function () {
        this.on('pn.usuario_id', '=', 'u.id')
          .andOnVal('pn.categoria', '=', CATEGORIA_NOTIFICACAO_SVO)
          .andOnVal('pn.canal', '=', 'WEB_PUSH');
      })
      .select(trx.raw('COALESCE(pn.habilitado, false) AS "pushHabilitado"'));
  } else {
    query.select(trx.raw('false AS "pushHabilitado"'));
  }

  const linhas = await query;
  return linhas.map((linha: { id: number; perfil: string; pushHabilitado: boolean }) => ({
    id: Number(linha.id),
    perfil: String(linha.perfil),
    pushHabilitado: Boolean(linha.pushHabilitado),
  }));
}

interface DefinicaoAlertaSvo {
  eventoTipo: typeof EVENTO_SVO_S1 | typeof EVENTO_SVO_S2;
  severidade: 'info' | 'warning' | 'danger';
  titulo: string;
  mensagem: string;
  tagPush: string;
  chaveBase: string;
}

async function publicarParaAudiencia(
  trx: Knex.Transaction,
  solicitacaoId: number,
  audiencia: DestinatarioSvo[],
  alerta: DefinicaoAlertaSvo,
  temOutbox: boolean,
): Promise<{ inApp: number; outbox: number }> {
  let inAppInseridos = 0;
  let outboxInseridos = 0;

  for (const destinatario of audiencia) {
    const chaveIdempotencia = `${alerta.chaveBase}:u:${destinatario.id}`;

    const inseridasInApp = await trx('notificacoes')
      .insert({
        usuario_id: destinatario.id,
        tipo: alerta.eventoTipo,
        titulo: alerta.titulo,
        mensagem: alerta.mensagem,
        severidade: alerta.severidade,
        operacao: 'SVO',
        referencia_tipo: 'SOLICITACAO_SVO',
        referencia_id: solicitacaoId,
        url_destino: URL_DESTINO_TRIAGEM_SVO,
        chave_idempotencia: chaveIdempotencia,
      })
      .onConflict(['usuario_id', 'chave_idempotencia'])
      .ignore()
      .returning('id');

    const notificacaoId = inseridasInApp[0]?.id ?? null;
    if (notificacaoId !== null) {
      inAppInseridos += 1;
    }

    if (temOutbox) {
      // Payload Push sanitizado conforme LGPD: proibido incluir dados_solicitante,
      // local_ocorrencia, endereço, nome ou detalhes clínicos/ocorrência.
      const payloadPush = {
        title: alerta.titulo,
        body: alerta.mensagem,
        tag: alerta.tagPush,
        data: {
          url: URL_DESTINO_TRIAGEM_SVO,
          operacao: 'SVO',
          evento: alerta.eventoTipo,
          referenciaTipo: 'SOLICITACAO_SVO',
          referenciaId: solicitacaoId,
        },
      };

      const statusOutbox = destinatario.pushHabilitado ? 'PENDENTE' : 'IGNORADO';
      const inseridasOutbox = await trx('notificacao_outbox')
        .insert({
          notificacao_id: notificacaoId,
          usuario_id: destinatario.id,
          evento_tipo: alerta.eventoTipo,
          categoria: CATEGORIA_NOTIFICACAO_SVO,
          operacao: 'SVO',
          referencia_tipo: 'SOLICITACAO_SVO',
          referencia_id: solicitacaoId,
          ocorrencia_versao: 'v1',
          chave_idempotencia: chaveIdempotencia,
          canal: 'WEB_PUSH',
          payload_push: JSON.stringify(payloadPush),
          status: statusOutbox,
          processado_em: statusOutbox === 'IGNORADO' ? trx.fn.now() : null,
        })
        .onConflict(['usuario_id', 'chave_idempotencia'])
        .ignore()
        .returning('id');

      if (inseridasOutbox.length > 0) {
        outboxInseridos += 1;
      }
    }
  }

  return { inApp: inAppInseridos, outbox: outboxInseridos };
}

export const notificacaoSvoService = {
  /**
   * Publica transacionalmente os alertas da etapa de solicitação/triagem SVO:
   * - S1: sempre ativo na criação da solicitação SVO para GESTOR_SVO (associado ao SVO) e ADMINISTRADOR.
   * - S2: condicionalmente bloqueado até confirmação legítima de domínio SVO para material sensível.
   */
  async publicarAlertasRegistroSolicitacao(
    solicitacao: Pick<SolicitacaoSvo, 'id'>,
    trx: Knex.Transaction,
    contextoDominio: ContextoDominioSvo = {},
  ): Promise<ResultadoPublicacaoAlertasSvo> {
    const temNotificacoes = await tabelaExiste(trx, 'notificacoes');
    if (!temNotificacoes) {
      return {
        s1PublicadosInApp: 0,
        s1EnfileiradosOutbox: 0,
        s2PublicadosInApp: 0,
        s2EnfileiradosOutbox: 0,
        s2BloqueadoMotivo: 'TABELA_NOTIFICACOES_AUSENTE',
      };
    }

    const [temOutbox, temPreferencias] = await Promise.all([
      tabelaExiste(trx, 'notificacao_outbox'),
      tabelaExiste(trx, 'preferencias_notificacao'),
    ]);

    const audiencia = await listarAudienciaSvoAtiva(trx, temPreferencias);

    // S1 — Nova solicitação SVO aguardando triagem (sem dados sensíveis / PII)
    const resultadoS1 = await publicarParaAudiencia(
      trx,
      solicitacao.id,
      audiencia,
      {
        eventoTipo: EVENTO_SVO_S1,
        severidade: 'info',
        titulo: 'Nova solicitação SVO para triagem',
        mensagem: `A solicitação SVO #${solicitacao.id} aguarda análise na fila de triagem.`,
        tagPush: `svo-solicitacao-${solicitacao.id}`,
        chaveBase: `svo:s1:solicitacao:${solicitacao.id}`,
      },
      temOutbox,
    );

    // S2 — Prioridade material sensível SVO (ativação estritamente condicional ao domínio confirmado)
    const fonteConfirmada =
      contextoDominio.fonteMaterialSensivelSvoConfirmada ?? FONTE_MATERIAL_SENSIVEL_SVO_CONFIRMADA;

    if (!fonteConfirmada) {
      return {
        s1PublicadosInApp: resultadoS1.inApp,
        s1EnfileiradosOutbox: resultadoS1.outbox,
        s2PublicadosInApp: 0,
        s2EnfileiradosOutbox: 0,
        s2BloqueadoMotivo: 'FONTE_DOMINIO_SVO_MATERIAL_SENSIVEL_NAO_CONFIRMADA',
      };
    }

    if (contextoDominio.materialSensivelSvoDominio !== true) {
      return {
        s1PublicadosInApp: resultadoS1.inApp,
        s1EnfileiradosOutbox: resultadoS1.outbox,
        s2PublicadosInApp: 0,
        s2EnfileiradosOutbox: 0,
        s2BloqueadoMotivo: null,
      };
    }

    const resultadoS2 = await publicarParaAudiencia(
      trx,
      solicitacao.id,
      audiencia,
      {
        eventoTipo: EVENTO_SVO_S2,
        severidade: 'danger',
        titulo: 'Prioridade SVO: material sensível',
        mensagem: `A solicitação SVO #${solicitacao.id} possui sinalização prioritária de material sensível para triagem.`,
        tagPush: `svo-sensivel-${solicitacao.id}`,
        chaveBase: `svo:s2:solicitacao:${solicitacao.id}`,
      },
      temOutbox,
    );

    return {
      s1PublicadosInApp: resultadoS1.inApp,
      s1EnfileiradosOutbox: resultadoS1.outbox,
      s2PublicadosInApp: resultadoS2.inApp,
      s2EnfileiradosOutbox: resultadoS2.outbox,
      s2BloqueadoMotivo: null,
    };
  },
};