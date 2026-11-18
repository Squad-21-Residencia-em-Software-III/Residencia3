import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Knex } from 'knex';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

const VINTE_MINUTOS_MS = 20 * 60_000;

export interface Periodo { inicio: Date; fim: Date }

/** Intervalos semiabertos: zero minutos é uma folga curta, não uma sobreposição. */
export function classificarIntervalo(a: Periodo, b: Periodo): { sobrepoe: boolean; folgaMs: number } {
  if (a.inicio < b.fim && b.inicio < a.fim) return { sobrepoe: true, folgaMs: 0 };
  return { sobrepoe: false, folgaMs: Math.max(a.inicio.getTime() - b.fim.getTime(), b.inicio.getTime() - a.fim.getTime()) };
}

export interface ReservaSvo {
  id: number;
  status: 'ALOCADA' | 'EM_DESLOCAMENTO' | 'NO_LOCAL';
  veiculo_id: number | null;
  motorista_id: number | null;
  equipe_id: number | null;
  inicio_previsto: Date | string | null;
  fim_previsto: Date | string | null;
}

export interface DadosAgendaSvo {
  ordemId: number;
  autorId: number;
  veiculoId: number;
  motoristaId: number;
  equipeId?: number | null;
  inicio: Date;
  fim: Date;
  confirmar?: boolean;
  token?: string;
}

type Recurso = 'VEICULO' | 'MOTORISTA' | 'EQUIPE';
interface Conflito {
  ordem_id: number;
  recurso: Recurso;
  descricao: string;
  inicio: string;
  fim: string;
  intervalo_minutos: number;
}

/** O mesmo lock é usado por todas as alterações de agenda e transições operacionais SVO. */
export async function travarAgendaSvo(trx: Knex.Transaction): Promise<void> {
  await trx.raw('SELECT pg_advisory_xact_lock(?, ?)', [166, 182]);
}

function assinatura(dados: DadosAgendaSvo, conflitos: Conflito[]): string {
  return createHash('sha256').update(JSON.stringify({
    ordem: dados.ordemId, autor: dados.autorId, veiculo: dados.veiculoId,
    motorista: dados.motoristaId, equipe: dados.equipeId ?? null,
    inicio: dados.inicio.toISOString(), fim: dados.fim.toISOString(), conflitos,
  })).digest('hex');
}

/** Executar dentro da transação, após bloquear as linhas de veículo, motorista e equipe. */
export async function validarAgendaSvo(trx: Knex.Transaction, dados: DadosAgendaSvo): Promise<Conflito[]> {
  if (!Number.isFinite(dados.inicio.getTime()) || !Number.isFinite(dados.fim.getTime()) ||
      dados.fim <= dados.inicio || dados.inicio.getTime() <= Date.now()) {
    throw new AppError('Informe um período futuro válido para a coleta', 400);
  }

  const reservas: ReservaSvo[] = await trx('ordens_svo')
    .whereIn('status', ['ALOCADA', 'EM_DESLOCAMENTO', 'NO_LOCAL'])
    .whereNot({ id: dados.ordemId })
    .andWhere((q) => {
      q.where('veiculo_id', dados.veiculoId).orWhere('motorista_id', dados.motoristaId);
      if (dados.equipeId) q.orWhere('equipe_id', dados.equipeId);
    })
    .select('id', 'status', 'veiculo_id', 'motorista_id', 'equipe_id', 'inicio_previsto', 'fim_previsto')
    .orderBy('id');

  const conflitos: Conflito[] = [];
  for (const reserva of reservas) {
    const recursos: [Recurso, number | null][] = [
      ['VEICULO', reserva.veiculo_id === dados.veiculoId ? dados.veiculoId : null],
      ['MOTORISTA', reserva.motorista_id === dados.motoristaId ? dados.motoristaId : null],
      ['EQUIPE', dados.equipeId && reserva.equipe_id === dados.equipeId ? dados.equipeId : null],
    ];
    if (!reserva.inicio_previsto || !reserva.fim_previsto) {
      throw new AppError('Há uma reserva ativa sem período previsto para um dos recursos', 409, 'CONFLITO_AGENDA');
    }
    const existente = { inicio: new Date(reserva.inicio_previsto), fim: new Date(reserva.fim_previsto) };
    if (!Number.isFinite(existente.inicio.getTime()) || !Number.isFinite(existente.fim.getTime()) || existente.fim <= existente.inicio) {
      throw new AppError('Há uma reserva ativa com período inválido', 409, 'CONFLITO_AGENDA');
    }
    if (
      ['EM_DESLOCAMENTO', 'NO_LOCAL'].includes(reserva.status) &&
      existente.fim.getTime() <= Date.now()
    ) {
      throw new AppError('Um recurso permanece ocupado por uma coleta em andamento e atrasada', 409, 'CONFLITO_AGENDA');
    }
    const resultado = classificarIntervalo({ inicio: dados.inicio, fim: dados.fim }, existente);
    if (resultado.sobrepoe) {
      throw new AppError('Um recurso já está reservado no período solicitado', 409, 'CONFLITO_AGENDA');
    }
    if (resultado.folgaMs < VINTE_MINUTOS_MS) {
      for (const [recurso, id] of recursos) if (id !== null) conflitos.push({
        ordem_id: reserva.id, recurso, descricao: `#${id}`,
        inicio: existente.inicio.toISOString(), fim: existente.fim.toISOString(),
        intervalo_minutos: resultado.folgaMs / 60_000,
      });
    }
  }

  if (conflitos.length) {
    const sinal = assinatura(dados, conflitos);
    let confirmado = false;
    if (dados.confirmar && dados.token) {
      try {
        const token = jwt.verify(dados.token, env.jwtSecret, { algorithms: ['HS256'] });
        confirmado = typeof token !== 'string' && token.sinal === sinal && token.sub === String(dados.autorId);
      } catch {
        confirmado = false;
      }
    }
    if (!confirmado) {
      const token = jwt.sign({ sinal, sub: String(dados.autorId) }, env.jwtSecret, { algorithm: 'HS256', expiresIn: '5m' });
      throw new AppError('Confirme o intervalo inferior a 20 minutos', 409, 'CONFIRMACAO_INTERVALO_REDUZIDO', { conflitos, token_confirmacao: token });
    }
  }
  return conflitos;
}
