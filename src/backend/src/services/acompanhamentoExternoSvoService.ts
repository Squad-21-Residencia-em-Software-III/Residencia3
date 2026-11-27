import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { Knex } from 'knex';
import { db } from '../config/database';
import { env } from '../config/env';
import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import {
  acompanhamentoExternoSvoModel,
  type RegistroAcompanhamentoExternoRow,
} from '../models/acompanhamentoExternoSvoModel';
import { auditoriaModel, MODULOS_AUDITORIA } from '../models/auditoriaModel';
import {
  LABELS_STATUS_PUBLICO_ACOMPANHAMENTO_SVO,
  credencialExternaSvoSchema,
  protocoloExternoSvoSchema,
  type StatusPublicoAcompanhamentoSvo,
} from '../validators/acompanhamentoExternoSvoSchemas';

// Janela oficial de consulta publica apos encerramento operacional: 30 dias (SCRUM-250 / SCRUM-266)
export const JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_DIAS = 30;
export const JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_MS =
  JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_DIAS * 24 * 60 * 60 * 1000;

export const MENSAGEM_CREDENCIAL_EXTERNA_INVALIDA =
  'Não foi possível consultar a solicitação com os dados informados. Verifique o protocolo e a credencial secreta.';

const ALFABETO_PROTOCOLO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const COMPRIMENTO_SUFIXO_PROTOCOLO = 12;
const BYTES_SEGREDO_CREDENCIAL = 32; // 256 bits de entropia -> 43 caracteres Base64URL

const MENSAGENS_PUBLICAS_PADRAO: Record<StatusPublicoAcompanhamentoSvo, string> = {
  RECEBIDA:
    'Sua solicitação foi recebida pelo portal e aguarda início da análise pelo SVO. O registro não representa confirmação imediata de atendimento.',
  EM_ANALISE:
    'Sua solicitação está em análise na triagem do SVO. Caso necessário, você ainda pode corrigir dados de contato ou localização.',
  CONFIRMADA:
    'Sua solicitação foi confirmada na triagem e aguarda programação operacional de atendimento.',
  EM_ANDAMENTO:
    'O atendimento da sua solicitação está em andamento pela operação do SVO.',
  CONCLUIDA:
    'O atendimento referente a esta solicitação foi concluído.',
  NAO_ACOLHIDA:
    'A solicitação foi analisada e não pôde ser acolhida pelo SVO.',
  CANCELADA:
    'A solicitação foi cancelada.',
};

// Digest falso fixo para comparacao em tempo constante quando o protocolo nao existe
const DIGEST_FICTICIO_ANTI_ENUMERACAO = createHash('sha256')
  .update('fsph-svo-anti-enumeracao-digest-constante')
  .digest('hex');

export interface DtoAcompanhamentoExternoSvo {
  protocolo: string;
  status: StatusPublicoAcompanhamentoSvo;
  status_label: string;
  mensagem_publica: string;
  registrada_em: string;
  atualizada_em: string;
  encerrada_em: string | null;
  consulta_disponivel_ate: string | null;
  versao_dados: number;
  permite_editar_contato_local: boolean;
  permite_solicitar_cancelamento: boolean;
  cancelamento: {
    solicitado: boolean;
    status: 'PENDENTE' | 'ACEITO' | 'NEGADO' | null;
    solicitado_em: string | null;
    decidido_em: string | null;
    mensagem_decisao: string | null;
  };
}

export interface EmissaoCredencialExternaInput {
  solicitacaoId: number;
  protocolo?: string;
  chaveIdempotencia: string;
  payloadNormalizado: unknown;
  provaTentativa?: string | null;
  agora?: Date;
}

export interface EmissaoCredencialExternaResultado {
  solicitacaoId: number;
  protocolo: string;
  credencial: string;
  emitidaEm: string;
}

function normalizarObjetoCanonico(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map(normalizarObjetoCanonico);
  }
  if (valor !== null && typeof valor === 'object' && !(valor instanceof Date)) {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(
      entradas.map(([k, v]) => [k, normalizarObjetoCanonico(v)])
    );
  }
  if (valor instanceof Date) {
    return valor.toISOString();
  }
  return valor;
}

export function calcularDigestPayloadCriacao(payload: unknown): string {
  const canonico = JSON.stringify(normalizarObjetoCanonico(payload ?? {}));
  return createHash('sha256').update(canonico, 'utf8').digest('hex');
}

export function calcularDigestCredencialExterna(
  credencial: string,
  algoritmo: 'SHA-256' | 'HMAC-SHA-256' = 'HMAC-SHA-256'
): string {
  const limpa = credencial.trim();
  if (algoritmo === 'SHA-256') {
    return createHash('sha256').update(limpa, 'utf8').digest('hex');
  }
  return createHmac('sha256', `${env.jwtSecret}:svo-credencial-externa-v1`)
    .update(limpa, 'utf8')
    .digest('hex');
}

export function calcularDigestProvaTentativa(
  chaveIdempotencia: string,
  provaTentativa: string
): string {
  return createHmac('sha256', `${env.jwtSecret}:svo-prova-tentativa-v1`)
    .update(`${chaveIdempotencia.trim()}:${provaTentativa.trim()}`, 'utf8')
    .digest('hex');
}

export function compararDigestsTempoConstante(
  digestA: string,
  digestB: string
): boolean {
  const validoA = /^[0-9a-f]{64}$/i.test(digestA);
  const validoB = /^[0-9a-f]{64}$/i.test(digestB);
  const bufA = Buffer.from(
    validoA ? digestA.toLowerCase() : DIGEST_FICTICIO_ANTI_ENUMERACAO,
    'hex'
  );
  const bufB = Buffer.from(
    validoB ? digestB.toLowerCase() : DIGEST_FICTICIO_ANTI_ENUMERACAO,
    'hex'
  );
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB) && validoA && validoB;
}

export function gerarProtocoloExternoSvo(agora = new Date()): string {
  const ano = String(agora.getUTCFullYear()).padStart(4, '0');
  const mes = String(agora.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(agora.getUTCDate()).padStart(2, '0');
  const bytes = randomBytes(COMPRIMENTO_SUFIXO_PROTOCOLO);
  let sufixo = '';
  for (let i = 0; i < COMPRIMENTO_SUFIXO_PROTOCOLO; i += 1) {
    sufixo += ALFABETO_PROTOCOLO[bytes[i]! % ALFABETO_PROTOCOLO.length];
  }
  return `SVO-${ano}${mes}${dia}-${sufixo}`;
}

export function gerarSegredoCredencialExterna(): string {
  return randomBytes(BYTES_SEGREDO_CREDENCIAL).toString('base64url');
}

export function mapearStatusPublicoAcompanhamentoSvo(
  registro: Pick<
    RegistroAcompanhamentoExternoRow,
    | 'status_solicitacao'
    | 'ordem_status'
    | 'versao_dados'
    | 'motivo_recusa_publico'
    | 'cancelamento_status'
    | 'cancelamento_justificativa_decisao'
  >
): {
  status: StatusPublicoAcompanhamentoSvo;
  status_label: string;
  mensagem_publica: string;
} {
  let status: StatusPublicoAcompanhamentoSvo;

  switch (registro.status_solicitacao) {
    case 'EM_TRIAGEM':
      // Recebida: estado inicial logo apos o envio externo (versao_dados === 1 e sem pedido/decisao de cancelamento).
      // Em analise: quando em revisao/atualizacao durante a triagem (versao_dados > 1 ou pedido de cancelamento).
      status =
        registro.versao_dados > 1 || registro.cancelamento_status !== null
          ? 'EM_ANALISE'
          : 'RECEBIDA';
      break;
    case 'CONFIRMADA':
      status =
        registro.ordem_status &&
        ['ALOCADA', 'EM_DESLOCAMENTO', 'NO_LOCAL'].includes(registro.ordem_status)
          ? 'EM_ANDAMENTO'
          : 'CONFIRMADA';
      break;
    case 'EM_ANDAMENTO':
      status = 'EM_ANDAMENTO';
      break;
    case 'CONCLUIDA':
      status = 'CONCLUIDA';
      break;
    case 'RECUSADA':
      status = 'NAO_ACOLHIDA';
      break;
    case 'CANCELADA':
      status = 'CANCELADA';
      break;
    default:
      status = 'RECEBIDA';
  }

  let mensagemPublica = MENSAGENS_PUBLICAS_PADRAO[status];

  if (status === 'NAO_ACOLHIDA') {
    const motivoPublico = registro.motivo_recusa_publico?.trim();
    if (motivoPublico) {
      mensagemPublica = `A solicitação foi analisada e não pôde ser acolhida pelo SVO. Orientação: ${motivoPublico}`;
    }
  } else if (status === 'CANCELADA') {
    const justCancelamento = registro.cancelamento_justificativa_decisao?.trim();
    if (justCancelamento) {
      mensagemPublica = `A solicitação foi cancelada. Observação: ${justCancelamento}`;
    }
  } else if (registro.cancelamento_status === 'PENDENTE') {
    mensagemPublica = `${mensagemPublica} Há um pedido de cancelamento registrado aguardando decisão do gestor do SVO.`;
  } else if (registro.cancelamento_status === 'NEGADO') {
    const justNegada = registro.cancelamento_justificativa_decisao?.trim();
    mensagemPublica = justNegada
      ? `${mensagemPublica} O pedido de cancelamento anterior não foi aprovado: ${justNegada}`
      : `${mensagemPublica} O pedido de cancelamento anterior não pôde ser aprovado porque o atendimento já avançou.`;
  }

  return {
    status,
    status_label: LABELS_STATUS_PUBLICO_ACOMPANHAMENTO_SVO[status],
    mensagem_publica: mensagemPublica,
  };
}

function paraIso(data: Date | string | null | undefined): string | null {
  if (!data) return null;
  const d = data instanceof Date ? data : new Date(data);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function resolverMomentoEncerramento(
  registro: RegistroAcompanhamentoExternoRow
): Date | null {
  if (registro.encerrado_operacional_em) {
    const d = new Date(registro.encerrado_operacional_em);
    if (Number.isFinite(d.getTime())) return d;
  }
  const encerrada = ['CONCLUIDA', 'RECUSADA', 'CANCELADA'].includes(
    registro.status_solicitacao
  );
  if (!encerrada) return null;

  const candidato =
    registro.ordem_conclusao_em ??
    registro.cancelamento_decidido_em ??
    registro.atualizado_em_dados ??
    registro.criado_em;
  const d = new Date(candidato);
  return Number.isFinite(d.getTime()) ? d : null;
}

function resolverLimiteConsultaPublica(
  registro: RegistroAcompanhamentoExternoRow,
  encerradoEm: Date | null
): Date | null {
  // consulta_publica_expira_em e coluna GENERATED (encerramento + 30 dias em UTC) na SCRUM-263
  if (registro.consulta_publica_expira_em) {
    const d = new Date(registro.consulta_publica_expira_em);
    if (Number.isFinite(d.getTime())) return d;
  }
  if (!encerradoEm) return null;
  return new Date(
    encerradoEm.getTime() + JANELA_ACOMPANHAMENTO_APOS_ENCERRAMENTO_MS
  );
}

function erroCredencialInvalida(): AppError {
  return new AppError(
    MENSAGEM_CREDENCIAL_EXTERNA_INVALIDA,
    401,
    'CREDENCIAL_EXTERNA_INVALIDA'
  );
}

export const acompanhamentoExternoSvoService = {
  /**
   * Emite atomicamente o protocolo opaco (se ainda nao definido) e persiste o digest
   * protegido da credencial secreta dentro da mesma transacao da criacao da solicitacao externa (SCRUM-264 / SCRUM-266).
   */
  async emitirCredencialNaTransacao(
    trx: Knex.Transaction,
    input: EmissaoCredencialExternaInput
  ): Promise<EmissaoCredencialExternaResultado> {
    if (!trx.isTransaction) {
      throw new Error(
        'emitirCredencialNaTransacao exige a transação da solicitação externa SVO'
      );
    }

    const agora = input.agora ?? new Date();
    const chaveIdempotencia = input.chaveIdempotencia.trim();
    const provaTentativa = input.provaTentativa?.trim() || null;

    // Schema SCRUM-263 corrigido: chave de idempotencia e digest do payload sao obrigatorios
    if (!chaveIdempotencia || input.payloadNormalizado === undefined) {
      throw new AppError(
        'A chave de idempotência e o payload normalizado da solicitação são obrigatórios',
        400
      );
    }

    const payloadDigest = calcularDigestPayloadCriacao(input.payloadNormalizado);
    const provaDigest = provaTentativa
      ? calcularDigestProvaTentativa(chaveIdempotencia, provaTentativa)
      : null;

    let protocolo = input.protocolo?.trim().toUpperCase();
    if (!protocolo) {
      const atual = await trx('solicitacoes_svo')
        .where({ id: input.solicitacaoId })
        .first<{ protocolo: string | null }>('protocolo');
      protocolo = atual?.protocolo ?? gerarProtocoloExternoSvo(agora);
      if (!atual?.protocolo) {
        await trx('solicitacoes_svo')
          .where({ id: input.solicitacaoId })
          .update({ protocolo });
      }
    }

    const credencial = gerarSegredoCredencialExterna();
    const segredoDigest = calcularDigestCredencialExterna(
      credencial,
      'HMAC-SHA-256'
    );

    await acompanhamentoExternoSvoModel.inserirCredencial(
      {
        solicitacao_id: input.solicitacaoId,
        segredo_digest: segredoDigest,
        algoritmo_digest: 'HMAC-SHA-256',
        versao_credencial: 1,
        chave_idempotencia_criacao: chaveIdempotencia,
        payload_criacao_digest: payloadDigest,
        prova_tentativa_digest: provaDigest,
        emitida_em: agora,
      },
      trx
    );

    return {
      solicitacaoId: input.solicitacaoId,
      protocolo,
      credencial,
      emitidaEm: agora.toISOString(),
    };
  },

  /**
   * Valida o par (protocolo, credencial secreta) em tempo constante, respeitando
   * revogacao e validade de ate 30 dias apos encerramento operacional.
   * Qualquer falha (protocolo inexistente, credencial incorreta, cruzada, revogada ou expirada)
   * retorna a mesma resposta uniforme 401 para impedir enumeracao de protocolos.
   */
  async autenticarEObterRegistro(
    protocoloBruto: string,
    credencialBruta: string,
    opcoes?: { agora?: Date; conexao?: Knex; registrarAcesso?: boolean }
  ): Promise<{
    registro: RegistroAcompanhamentoExternoRow;
    encerradoEm: Date | null;
    consultaDisponivelAte: Date | null;
  }> {
    const agora = opcoes?.agora ?? new Date();
    const conexao = opcoes?.conexao ?? db;

    const validacaoProtocolo = protocoloExternoSvoSchema.safeParse(protocoloBruto);
    const validacaoCredencial = credencialExternaSvoSchema.safeParse(credencialBruta);

    if (!validacaoProtocolo.success || !validacaoCredencial.success) {
      // Mantem custo criptografico constante mesmo para formato invalido
      const digestDummy = calcularDigestCredencialExterna(
        credencialBruta || 'credencial-invalida',
        'HMAC-SHA-256'
      );
      compararDigestsTempoConstante(digestDummy, DIGEST_FICTICIO_ANTI_ENUMERACAO);
      throw erroCredencialInvalida();
    }

    const protocolo = validacaoProtocolo.data;
    const credencial = validacaoCredencial.data;

    const registro = await acompanhamentoExternoSvoModel.buscarPorProtocolo(
      protocolo,
      conexao
    );

    const algoritmo = registro?.algoritmo_digest ?? 'HMAC-SHA-256';
    const digestInformado = calcularDigestCredencialExterna(credencial, algoritmo);
    const digestEsperado =
      registro?.segredo_digest ?? DIGEST_FICTICIO_ANTI_ENUMERACAO;

    const credencialConfere = compararDigestsTempoConstante(
      digestInformado,
      digestEsperado
    );

    if (!registro || !credencialConfere || registro.revogada_em !== null) {
      throw erroCredencialInvalida();
    }

    const encerradoEm = resolverMomentoEncerramento(registro);
    const consultaDisponivelAte = resolverLimiteConsultaPublica(
      registro,
      encerradoEm
    );

    if (
      consultaDisponivelAte &&
      agora.getTime() > consultaDisponivelAte.getTime()
    ) {
      throw erroCredencialInvalida();
    }

    if (opcoes?.registrarAcesso !== false) {
      await acompanhamentoExternoSvoModel.registrarAcessoValido(
        registro.solicitacao_id,
        agora,
        conexao
      );
    }

    return { registro, encerradoEm, consultaDisponivelAte };
  },

  /**
   * Consulta o andamento publico da solicitacao externa usando allowlist estrita (DTO minimo).
   * Nunca retorna equipe, motorista, veiculo, placa, GPS, justificativa interna ou PII desnecessaria.
   */
  async consultarAcompanhamentoPublico(
    protocoloBruto: string,
    credencialBruta: string,
    opcoes?: { agora?: Date; conexao?: Knex }
  ): Promise<DtoAcompanhamentoExternoSvo> {
    const { registro, encerradoEm, consultaDisponivelAte } =
      await this.autenticarEObterRegistro(protocoloBruto, credencialBruta, opcoes);

    const mapeado = mapearStatusPublicoAcompanhamentoSvo(registro);
    const emAnalise = registro.status_solicitacao === 'EM_TRIAGEM';
    const encerrada = ['CONCLUIDA', 'RECUSADA', 'CANCELADA'].includes(
      registro.status_solicitacao
    );

    return {
      protocolo: registro.protocolo!,
      status: mapeado.status,
      status_label: mapeado.status_label,
      mensagem_publica: mapeado.mensagem_publica,
      registrada_em: paraIso(registro.criado_em)!,
      atualizada_em: paraIso(
        registro.ordem_conclusao_em ??
          registro.ordem_saida_em ??
          registro.confirmado_em ??
          registro.atualizado_em_dados ??
          registro.criado_em
      )!,
      encerrada_em: paraIso(encerradoEm),
      consulta_disponivel_ate: paraIso(consultaDisponivelAte),
      versao_dados: registro.versao_dados,
      permite_editar_contato_local:
        emAnalise && registro.cancelamento_status !== 'ACEITO',
      permite_solicitar_cancelamento:
        !encerrada && registro.cancelamento_status !== 'PENDENTE',
      cancelamento: {
        solicitado: registro.cancelamento_status !== null,
        status: registro.cancelamento_status,
        solicitado_em: paraIso(registro.cancelamento_solicitado_em),
        decidido_em: paraIso(registro.cancelamento_decidido_em),
        mensagem_decisao: registro.cancelamento_justificativa_decisao ?? null,
      },
    };
  },

  /**
   * Revoga explicitamente a credencial externa de uma solicitacao SVO (uso interno por GESTOR_SVO ou ADMINISTRADOR).
   */
  async revogarCredencial(
    solicitacaoId: number,
    motivo: string,
    autor: { id: number; perfil: Perfil }
  ): Promise<{ solicitacao_id: number; revogada_em: string }> {
    if (
      autor.perfil !== PERFIS.ADMINISTRADOR &&
      autor.perfil !== PERFIS.GESTOR_SVO
    ) {
      throw new AppError(
        'Você não tem permissão para revogar credenciais externas SVO',
        403
      );
    }

    const agora = new Date();
    return db.transaction(async (trx) => {
      const revogada = await acompanhamentoExternoSvoModel.revogarCredencial(
        solicitacaoId,
        motivo.trim(),
        agora,
        trx
      );
      if (!revogada) {
        throw new AppError(
          'Credencial externa não encontrada para esta solicitação SVO',
          404
        );
      }

      await auditoriaModel.registrar(
        {
          usuario_id: autor.id,
          acao: `REVOGOU_CREDENCIAL_EXTERNA_SVO solicitacao_id=${solicitacaoId}`,
          modulo: MODULOS_AUDITORIA.SOLICITACOES_SVO,
        },
        trx
      );

      return {
        solicitacao_id: solicitacaoId,
        revogada_em: new Date(revogada.revogada_em!).toISOString(),
      };
    });
  },
};
