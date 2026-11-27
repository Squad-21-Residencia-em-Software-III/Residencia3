import { createHmac } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { db } from '../config/database';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

const TABELA = 'limites_portal_svo';
const COTAS = {
  geocodificar: { porIp: 12, porOperacao: 18 },
  cadastrar: { porIp: 12, porOperacao: 40 },
} as const;
type Operacao = keyof typeof COTAS;

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
  const chaveIp = createHmac('sha256', env.jwtSecret).update('portal-svo:' + ipKeyGenerator(ip)).digest('hex');
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
      { escopo: operacao + ':' + chaveIp, duracao: 60, limite: cotas.porIp },
    ];
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
    // Mantém a tabela limitada mesmo depois de um período sem tráfego.
    await trx(TABELA).where('expira_em', '<=', agora - 60).delete();
  });
}

export function protegerPortalSvo(operacao: Operacao): RequestHandler {
  let emCurso = 0;
  return async (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (emCurso >= (operacao === 'geocodificar' ? 2 : 4)) {
      excedida(res, 1);
      return;
    }
    emCurso++;
    let liberada = false;
    const liberar = () => {
      if (liberada) return;
      liberada = true;
      emCurso--;
    };
    try {
      await consumirCota(operacao, req.ip ?? req.socket.remoteAddress ?? 'desconhecido');
    } catch (erro) {
      liberar();
      if (res.headersSent || res.destroyed) return;
      if (erro instanceof CotaExcedida) {
        excedida(res, erro.segundos);
        return;
      }
      throw erro;
    }
    if (res.headersSent || res.destroyed) {
      liberar();
      return;
    }
    res.once('finish', liberar);
    res.once('close', liberar);
    next();
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
