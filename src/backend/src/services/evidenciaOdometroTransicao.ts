import type { Knex } from 'knex';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import type { TipoOperacao } from '../validators/viagemSchemas';
import { lerEvidenciaVerificada } from './armazenamentoEvidencias';
import { CHAVE_OPACA } from './chavesEvidencias';

/**
 * Vínculo das fotos do odômetro com o início e o fim das viagens (SCRUM-208).
 * Tudo roda dentro da transação de iniciar/finalizar: sem foto válida (ou fase já coberta),
 * a transição não acontece. Tabelas da SCRUM-210 (PR #170).
 */

export type FaseOdometro = 'SAIDA' | 'CHEGADA';

export const CODIGOS_EVIDENCIA = {
  OBRIGATORIA: 'EVIDENCIA_OBRIGATORIA',
  INVALIDA: 'EVIDENCIA_INVALIDA',
  EXPIRADA: 'EVIDENCIA_EXPIRADA',
} as const;

// A foto enviada fica provisória (STAGING) até ser usada numa transição dentro deste prazo
export const VALIDADE_PROVISORIA_MS = 30 * 60 * 1000;

// Status que ocupam a fase (índices únicos parciais da SCRUM-210)
export const STATUS_DA_FASE = ['ATIVA', 'EXPURGADA_RETENCAO'] as const;

export interface EvidenciaOdometroRow {
  id: number;
  tipo_operacao: TipoOperacao;
  fase: FaseOdometro;
  viagem_frota_id: number | null;
  deslocamento_svo_id: number | null;
  ordem_svo_id: number | null;
  veiculo_id: number;
  motorista_id: number;
  km_registrado: number;
  modalidade: 'FOTO' | 'EXCECAO_GESTOR';
  status: string;
  storage_key: string | null;
  mime_type: string | null;
  tamanho_bytes: number | null;
  sha256: string | null;
  auditoria_id: number | null;
  registrado_por: number;
  excecao_aprovada_por: number | null;
  excecao_aprovada_em: Date | null;
  excecao_justificativa: string | null;
  criado_em: Date;
}

export interface DeslocamentoSvo {
  id: number;
  veiculo_id: number;
  motorista_id: number;
  km_inicial: number;
  status: string;
}

export function expiraEm(criadoEm: Date | string): Date {
  return new Date(new Date(criadoEm).getTime() + VALIDADE_PROVISORIA_MS);
}

/** Deslocamento físico ao qual a ordem SVO está ligada, se houver. */
export async function deslocamentoDaOrdem(
  conexao: Knex | Knex.Transaction,
  ordemId: number,
  travar = false
): Promise<DeslocamentoSvo | undefined> {
  const consulta = conexao('deslocamentos_svo as d')
    .join('deslocamentos_svo_ordens as dor', 'dor.deslocamento_svo_id', 'd.id')
    .where('dor.ordem_svo_id', ordemId)
    .first('d.id', 'd.veiculo_id', 'd.motorista_id', 'd.km_inicial', 'd.status');
  return travar ? consulta.forUpdate('d') : consulta;
}

/** Deslocamento SVO em curso do veículo (no máximo um, pelo índice único). */
export async function deslocamentoEmCursoDoVeiculo(
  conexao: Knex | Knex.Transaction,
  veiculoId: number,
  travar = false
): Promise<DeslocamentoSvo | undefined> {
  const consulta = conexao('deslocamentos_svo')
    .where({ veiculo_id: veiculoId, status: 'EM_CURSO' })
    .first('id', 'veiculo_id', 'motorista_id', 'km_inicial', 'status');
  return travar ? consulta.forUpdate() : consulta;
}

/** Evidência que ocupa a fase: foto confirmada, exceção autorizada ou foto expurgada. */
export async function evidenciaDaFase(
  conexao: Knex | Knex.Transaction,
  tipo: TipoOperacao,
  alvoId: number,
  fase: FaseOdometro
): Promise<EvidenciaOdometroRow | undefined> {
  return conexao<EvidenciaOdometroRow>('evidencias_odometro')
    .where({
      tipo_operacao: tipo,
      fase,
      [tipo === 'ADMINISTRATIVA' ? 'viagem_frota_id' : 'deslocamento_svo_id']: alvoId,
    })
    .whereIn('status', STATUS_DA_FASE)
    .first();
}

interface ViagemEmTransicao {
  veiculo_id: number;
  motorista_id: number;
  km_inicial?: number | null;
  data_hora_saida?: Date | null;
}

export interface Transicao {
  tipo: TipoOperacao;
  viagemId: number;
  viagem: ViagemEmTransicao;
  fase: FaseOdometro;
  km: number;
  evidenciaId?: number;
  autorId: number;
}

function erroEvidencia(mensagem: string, codigo: string): AppError {
  return new AppError(mensagem, 400, codigo);
}

// Confirma a foto provisória enviada para esta mesma viagem, fase e usuário
async function confirmarProvisoria(trx: Knex.Transaction, t: Transicao, deslocamentoId?: number): Promise<number> {
  const evidencia = await trx<EvidenciaOdometroRow>('evidencias_odometro')
    .where({ id: t.evidenciaId })
    .forUpdate()
    .first();
  const daViagem = evidencia && (t.tipo === 'ADMINISTRATIVA'
    ? evidencia.viagem_frota_id === t.viagemId
    : evidencia.ordem_svo_id === t.viagemId);
  if (
    !evidencia ||
    !daViagem ||
    evidencia.tipo_operacao !== t.tipo ||
    evidencia.fase !== t.fase ||
    evidencia.modalidade !== 'FOTO' ||
    evidencia.status !== 'STAGING' ||
    evidencia.registrado_por !== t.autorId
  ) {
    throw erroEvidencia('A foto informada não pertence a esta viagem ou já foi usada. Envie a foto novamente.', CODIGOS_EVIDENCIA.INVALIDA);
  }
  if (Date.now() >= expiraEm(evidencia.criado_em).getTime()) {
    throw erroEvidencia('A foto enviada expirou. Envie a foto novamente.', CODIGOS_EVIDENCIA.EXPIRADA);
  }
  if (!evidencia.storage_key || !evidencia.sha256 || !evidencia.tamanho_bytes ||
    (CHAVE_OPACA.test(evidencia.storage_key) && evidencia.auditoria_id === null)) {
    throw erroEvidencia('O envio da foto ainda não foi concluído.', CODIGOS_EVIDENCIA.INVALIDA);
  }
  await lerEvidenciaVerificada(evidencia.storage_key, evidencia.tamanho_bytes, evidencia.sha256);
  await trx('evidencias_odometro')
    .where({ id: evidencia.id })
    .update({
      status: 'ATIVA',
      km_registrado: t.km,
      ...(deslocamentoId === undefined ? {} : { deslocamento_svo_id: deslocamentoId }),
    });
  return evidencia.id;
}

// A fase já coberta (foto de outra ordem do mesmo deslocamento ou exceção) dispensa nova foto.
// Sem cobertura: usa a foto enviada ou, com as fotos obrigatórias, recusa a transição.
async function cobrirFase(
  trx: Knex.Transaction,
  t: Transicao,
  alvoId: number,
  deslocamentoId?: number
): Promise<number | undefined> {
  if (await evidenciaDaFase(trx, t.tipo, alvoId, t.fase)) return undefined;
  if (t.evidenciaId !== undefined) return confirmarProvisoria(trx, t, deslocamentoId);
  if (env.fotosOdometroObrigatorias) {
    throw erroEvidencia(
      `Envie a foto do odômetro na ${t.fase === 'SAIDA' ? 'saída' : 'chegada'} para continuar.`,
      CODIGOS_EVIDENCIA.OBRIGATORIA
    );
  }
  return undefined;
}

/**
 * Liga a ordem SVO ao deslocamento físico do veículo: entra no deslocamento em curso (coletas que
 * seguem juntas compartilham as fotos) ou abre um novo.
 */
async function vincularDeslocamento(trx: Knex.Transaction, t: Transicao): Promise<DeslocamentoSvo> {
  const ligado = await deslocamentoDaOrdem(trx, t.viagemId, true);
  if (ligado) return ligado;

  let deslocamento = await deslocamentoEmCursoDoVeiculo(trx, t.viagem.veiculo_id, true);
  if (deslocamento && deslocamento.motorista_id !== t.viagem.motorista_id) {
    throw new AppError('O veículo já está em outro deslocamento SVO com outro motorista', 409);
  }
  if (!deslocamento) {
    const outro = await trx('deslocamentos_svo')
      .where({ motorista_id: t.viagem.motorista_id, status: 'EM_CURSO' })
      .first('id');
    if (outro) {
      throw new AppError('O motorista já está em outro deslocamento SVO com outro veículo', 409);
    }
    // Na finalização de uma coleta iniciada antes desta funcionalidade, a saída vem da própria ordem
    const kmInicial = t.fase === 'SAIDA' ? t.km : Math.min(t.viagem.km_inicial ?? t.km, t.km);
    [deslocamento] = await trx('deslocamentos_svo')
      .insert({
        veiculo_id: t.viagem.veiculo_id,
        motorista_id: t.viagem.motorista_id,
        iniciado_por: t.autorId,
        km_inicial: kmInicial,
        data_hora_saida: t.fase === 'SAIDA' ? trx.fn.now() : (t.viagem.data_hora_saida ?? trx.fn.now()),
      })
      .returning(['id', 'veiculo_id', 'motorista_id', 'km_inicial', 'status']);
  }
  await trx('deslocamentos_svo_ordens').insert({
    deslocamento_svo_id: deslocamento!.id,
    ordem_svo_id: t.viagemId,
    vinculado_por: t.autorId,
  });
  return deslocamento!;
}

/**
 * Chamado em iniciar/finalizar antes de gravar a transição. Devolve o id da foto confirmada,
 * quando houver, para constar na auditoria.
 */
export async function registrarEvidenciaNaTransicao(trx: Knex.Transaction, t: Transicao): Promise<number | undefined> {
  if (t.tipo === 'ADMINISTRATIVA') {
    return cobrirFase(trx, t, t.viagemId);
  }
  const deslocamento = await vincularDeslocamento(trx, t);
  return cobrirFase(trx, t, deslocamento.id, deslocamento.id);
}

/**
 * Chamado em finalizar depois de gravar a viagem como concluída: inicia o prazo de guarda de
 * 12 meses a partir da conclusão real. No SVO, o deslocamento só termina com a última ordem.
 */
export async function concluirOperacao(trx: Knex.Transaction, t: Transicao): Promise<void> {
  const iniciarRetencao = (consulta: Knex.QueryBuilder) =>
    consulta
      .where({ status: 'ATIVA' })
      .whereNull('conclusao_operacao_em')
      .update({
        conclusao_operacao_em: trx.fn.now(),
        retencao_ate: trx.raw("CURRENT_TIMESTAMP + interval '12 months'"),
      });

  if (t.tipo === 'ADMINISTRATIVA') {
    await iniciarRetencao(trx('evidencias_odometro').where({ tipo_operacao: 'ADMINISTRATIVA', viagem_frota_id: t.viagemId }));
    return;
  }

  const deslocamento = await deslocamentoDaOrdem(trx, t.viagemId, true);
  if (!deslocamento || deslocamento.status !== 'EM_CURSO') return;
  const pendentes = await trx('deslocamentos_svo_ordens as dor')
    .join('ordens_svo as o', 'o.id', 'dor.ordem_svo_id')
    .where('dor.deslocamento_svo_id', deslocamento.id)
    .whereIn('o.status', ['EM_DESLOCAMENTO', 'NO_LOCAL'])
    .first('o.id');
  if (pendentes) return;

  await trx('deslocamentos_svo')
    .where({ id: deslocamento.id })
    .update({
      status: 'CONCLUIDO',
      km_final: Math.max(t.km, deslocamento.km_inicial),
      finalizado_por: t.autorId,
      data_hora_conclusao: trx.fn.now(),
    });
  await iniciarRetencao(trx('evidencias_odometro').where({ tipo_operacao: 'SVO', deslocamento_svo_id: deslocamento.id }));
}
