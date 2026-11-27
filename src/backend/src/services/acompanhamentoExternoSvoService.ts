import {
  createCipheriv,
  createDecipheriv,
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

// Janela curta do envelope cifrado para recuperar resposta perdida em falha de rede (15 minutos)
export const JANELA_RECUPERACAO_TENTATIVA_MS = 15 * 60 * 1000;

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
  chaveIdempotencia?: string | null;
  payloadNormalizado?: unknown;
  provaTentativa?: string | null;
  agora?: Date;
}

export interface EmissaoCredencialExternaResultado {
  solicitacaoId: number;
  protocolo: string;
  credencial: string;
  emitidaEm: string;
  recuperacaoExpiraEm: string | null;
}

export interface RecuperacaoTentativaInput {
  chaveIdempotencia: string;
  provaTentativa: string;
  payloadNormalizado?: unknown;
  agora?: Date;
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

function derivarChaveEnvelope(
  chaveIdempotencia: string,
  provaTentativa: string,
  payloadDigest: string
): Buffer {
  return createHmac('sha256', `${env.jwtSecret}:svo-envelope-tentativa-v1`)
    .update(`${chaveIdempotencia}:${provaTentativa}:${payloadDigest}`, 'utf8')
    .digest();
}

export function cifrarEnvelopeRecuperacao(params: {
  credencial: string;
  protocolo: string;
  chaveIdempotencia: string;
  provaTentativa: string;
  payloadDigest: string;
}): string {
  const chave = derivarChaveEnvelope(
    params.chaveIdempotencia,
    params.provaTentativa,
    params.payloadDigest
  );
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', chave, iv);
  cipher.setAAD(Buffer.from(params.protocolo, 'utf8'));
  const textoClaro = JSON.stringify({
    protocolo: params.protocolo,
    credencial: params.credencial,
  });
  const cifrado = Buffer.concat([
    cipher.update(textoClaro, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    cifrado.toString('base64url'),
  ].join('.');
}

export function decifrarEnvelopeRecuperacao(params: {
  envelope: string;
  protocolo: string;
  chaveIdempotencia: string;
  provaTentativa: string;
  payloadDigest: string;
}): { protocolo: string; credencial: string } | null {
  const partes = params.envelope.split('.');
  if (partes.length !== 4 || partes[0] !== 'v1') return null;
  try {
    const iv = Buffer.from(partes[1]!, 'base64url');
    const tag = Buffer.from(partes[2]!, 'base64url');
    const cifrado = Buffer.from(partes[3]!, 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || cifrado.length === 0) {
      return null;
    }
    const chave = derivarChaveEnvelope(
      params.chaveIdempotencia,
      params.provaTentativa,
      params.payloadDigest
    );
    const decipher = createDecipheriv('aes-256-gcm', chave, iv);
    decipher.setAAD(Buffer.from(params.protocolo, 'utf8'));
    decipher.setAuthTag(tag);
    const decifrado = Buffer.concat([
      decipher.update(cifrado),
      decipher.final(),
    ]).toString('utf8');
    const obj = JSON.parse(decifrado) as {
      protocolo?: string;
      credencial?: string;
    };
    if (
      typeof obj.protocolo !== 'string' ||
      typeof obj.credencial !== 'string' ||
      obj.protocolo !== params.protocolo
    ) {
      return null;
    }
    return { protocolo: obj.protocolo, credencial: obj.credencial };
  } catch {
    return null;
  }
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
  if (registro.valida_ate) {
    const d = new Date(registro.valida_ate);
    if (Number.isFinite(d.getTime())) return d;
  }
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
    const chaveIdempotencia = input.chaveIdempotencia?.trim() || null;
    const provaTentativa = input.provaTentativa?.trim() || null;

    if (chaveIdempotencia && input.payloadNormalizado === undefined) {
      throw new AppError(
        'A chave de idempotência exige o payload normalizado da solicitação',
        400
      );
    }

    const payloadDigest = chaveIdempotencia
      ? calcularDigestPayloadCriacao(input.payloadNormalizado)
      : null;
    const provaDigest =
      chaveIdempotencia && provaTentativa
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

    const recuperacaoExpiraEm =
      chaveIdempotencia && provaTentativa && payloadDigest
        ? new Date(agora.getTime() + JANELA_RECUPERACAO_TENTATIVA_MS)
        : null;

    const envelopeRecuperacao =
      chaveIdempotencia && provaTentativa && payloadDigest
        ? cifrarEnvelopeRecuperacao({
            credencial,
            protocolo,
            chaveIdempotencia,
            provaTentativa,
            payloadDigest,
          })
        : null;

    await acompanhamentoExternoSvoModel.inserirCredencial(
      {
        solicitacao_id: input.solicitacaoId,
        segredo_digest: segredoDigest,
        algoritmo_digest: 'HMAC-SHA-256',
        versao_credencial: 1,
        chave_idempotencia_criacao: chaveIdempotencia,
        payload_criacao_digest: payloadDigest,
        prova_tentativa_digest: provaDigest,
        envelope_recuperacao: envelopeRecuperacao,
        recuperacao_expira_em: recuperacaoExpiraEm,
        emitida_em: agora,
        valida_ate: null,
      },
      trx
    );

    return {
      solicitacaoId: input.solicitacaoId,
      protocolo,
      credencial,
      emitidaEm: agora.toISOString(),
      recuperacaoExpiraEm: recuperacaoExpiraEm
        ? recuperacaoExpiraEm.toISOString()
        : null,
    };
  },

  /**
   * Recupera o protocolo e a credencial secreta de uma tentativa de criacao cuja resposta
   * HTTP foi interrompida apos o commit (SCRUM-264 / SCRUM-266).
   * - Exige a mesma chave_idempotencia + prova_tentativa de alta entropia + mesmo payload (quando enviado).
   * - Se a chave foi reutilizada com payload diferente -> 409 CONFLITO_IDEMPOTENCIA.
   * - Se a prova de posse nao confere ou o envelope expirou -> 401 uniforme sem revelar o segredo.
   */
  async recuperarComprovanteTentativa(
    input: RecuperacaoTentativaInput,
    conexao: Knex = db
  ): Promise<EmissaoCredencialExternaResultado> {
    const agora = input.agora ?? new Date();
    const chave = input.chaveIdempotencia.trim();
    const prova = input.provaTentativa.trim();

    const tentativa =
      await acompanhamentoExternoSvoModel.buscarTentativaPorChaveIdempotencia(
        chave,
        conexao
      );

    const provaDigestCalculado = calcularDigestProvaTentativa(chave, prova);

    if (!tentativa || !tentativa.protocolo) {
      // Executa comparacao constante mesmo quando nao existe para evitar side-channel
      compararDigestsTempoConstante(
        provaDigestCalculado,
        DIGEST_FICTICIO_ANTI_ENUMERACAO
      );
      throw erroCredencialInvalida();
    }

    if (input.payloadNormalizado !== undefined) {
      const payloadDigestAtual = calcularDigestPayloadCriacao(
        input.payloadNormalizado
      );
      if (
        !tentativa.payload_criacao_digest ||
        !compararDigestsTempoConstante(
          payloadDigestAtual,
          tentativa.payload_criacao_digest
        )
      ) {
        throw new AppError(
          'Esta chave de tentativa já foi utilizada com dados diferentes.',
          409,
          'CONFLITO_IDEMPOTENCIA'
        );
      }
    }

    const provaConfere =
      tentativa.prova_tentativa_digest !== null &&
      compararDigestsTempoConstante(
        provaDigestCalculado,
        tentativa.prova_tentativa_digest
      );

    if (
      !provaConfere ||
      tentativa.revogada_em !== null ||
      !tentativa.envelope_recuperacao ||
      !tentativa.recuperacao_expira_em ||
      !tentativa.payload_criacao_digest
    ) {
      throw erroCredencialInvalida();
    }

    const expiraEm = new Date(tentativa.recuperacao_expira_em);
    if (!Number.isFinite(expiraEm.getTime()) || agora.getTime() > expiraEm.getTime()) {
      throw erroCredencialInvalida();
    }

    const decifrado = decifrarEnvelopeRecuperacao({
      envelope: tentativa.envelope_recuperacao,
      protocolo: tentativa.protocolo,
      chaveIdempotencia: chave,
      provaTentativa: prova,
      payloadDigest: tentativa.payload_criacao_digest,
    });

    if (!decifrado) {
      throw erroCredencialInvalida();
    }

    // Confirma que a credencial decifrada corresponde exatamente ao digest persistido
    const digestCalculado = calcularDigestCredencialExterna(
      decifrado.credencial,
      tentativa.algoritmo_digest
    );
    if (!compararDigestsTempoConstante(digestCalculado, tentativa.segredo_digest)) {
      throw erroCredencialInvalida();
    }

    return {
      solicitacaoId: tentativa.solicitacao_id,
      protocolo: decifrado.protocolo,
      credencial: decifrado.credencial,
      emitidaEm: new Date(tentativa.emitida_em).toISOString(),
      recuperacaoExpiraEm: expiraEm.toISOString(),
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
