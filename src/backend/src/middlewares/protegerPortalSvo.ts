import { createHmac } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { db } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

const TABELA = 'limites_portal_svo';
type Operacao = 'geocodificar' | 'cadastrar' | 'acompanhar' | 'recuperar';
const COTAS: Record<Operacao, { porIp?: number; porOperacao: number; simultaneas: number }> = {
  geocodificar: { porIp: 12, porOperacao: 18, simultaneas: 2 },
  cadastrar: { porIp: 12, porOperacao: 40, simultaneas: 4 },
  acompanhar: { porOperacao: 40, simultaneas: 4 },
  recuperar: { porOperacao: 30, simultaneas: 4 },
};

class CotaExcedida extends Error {
  constructor(readonly segundos: number) {
    super('Cota do portal excedida');
  }
}

function excedida(res: Response, segundos: number): void {
  res.set('Retry-After', String(segundos)).status(429).json({
    erro: 'Muitas requisições ao portal. Aguarde e tente novamente.',
    codigo: 'PORTAL_LIMITE',
  });
}

async function consumirCota(operacao: Operacao, ip: string): Promise<void> {
  await db.transaction(async (trx) => {
    // Hora do PostgreSQL para que réplicas usem a mesma janela.
    const { rows: [{ agora }] } = await trx.raw<{ rows: { agora: number }[] }>(
      'SELECT floor(extract(epoch FROM transaction_timestamp()))::double precision AS agora',
    );
    const cotas = COTAS[operacao];
    const janelas = [
      { escopo: 'portal:rajada', duracao: 10, limite: 20 },
      { escopo: 'portal:minuto', duracao: 60, limite: 50 },
      { escopo: operacao, duracao: 60, limite: cotas.porOperacao },
    ];
    if (cotas.porIp !== undefined) {
      const chaveIp = createHmac('sha256', env.jwtSecret).update('portal-svo:' + ipKeyGenerator(ip)).digest('hex');
      janelas.push({ escopo: operacao + ':' + chaveIp, duracao: 60, limite: cotas.porIp });
    }
    for (const { escopo, duracao, limite } of janelas) {
      const expira = agora - agora % duracao + duracao;
      const { rowCount } = await trx.raw<{ rowCount: number }>(
        `INSERT INTO ?? (expira_em, escopo, total) VALUES (?, ?, 1)
           ON CONFLICT (expira_em, escopo) DO UPDATE SET total = ??.total + 1
             WHERE ??.total < ?`,
        [TABELA, expira, escopo, TABELA, TABELA, limite],
      );
      if (rowCount === 0) throw new CotaExcedida(expira - agora);
    }
    // Limpeza limitada e sem espera por linhas bloqueadas por outro processo.
    const expiradas = trx(TABELA).select('expira_em', 'escopo')
      .where('expira_em', '<=', agora - 60).orderBy('expira_em').limit(50).forUpdate().skipLocked();
    await trx(TABELA).whereIn(['expira_em', 'escopo'], expiradas).delete();
  });
}

const emCurso: Record<Operacao, number> = {
  geocodificar: 0, cadastrar: 0, acompanhar: 0, recuperar: 0,
};

async function reservar(operacao: Operacao, req: Request, res: Response): Promise<(() => void) | undefined> {
  if (emCurso[operacao] >= COTAS[operacao].simultaneas) {
    excedida(res, 1);
    return;
  }
  emCurso[operacao]++;
  let liberada = false;
  const liberar = () => {
    if (liberada) return;
    liberada = true;
    emCurso[operacao]--;
  };
  try {
    await consumirCota(operacao, req.ip ?? req.socket.remoteAddress ?? 'desconhecido');
    if (!res.headersSent && !res.destroyed) return liberar;
  } catch (erro) {
    if (!res.headersSent && !res.destroyed) {
      if (erro instanceof CotaExcedida) excedida(res, erro.segundos);
      else {
        liberar();
        throw erro;
      }
    }
  }
  liberar();
  return undefined;
}

export function protegerTrabalhoPortalSvo(
  operacao: Operacao,
  executar: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return async (req, res) => {
    const liberar = await reservar(operacao, req, res);
    if (!liberar) return;
    try {
      await executar(req, res);
    } finally {
      liberar();
    }
  };
}

// O campo é removido antes da validação estrita do contrato de criação.
export const verificarHoneypotPortalSvo: RequestHandler = (req, _res, next) => {
  const campo = req.body?.website_hp;
  if (campo !== undefined && campo !== '') {
    throw new AppError('Dados inválidos.', 400, 'PORTAL_DADOS_INVALIDOS');
  }
  if (campo === '') delete req.body.website_hp;
  next();
};
