import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// UUIDs can be propagated by a gateway; other input is never copied into logs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METODOS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

export function logRequisicao(req: Request, res: Response, next: NextFunction): void {
  const recebido = req.headers['x-request-id'];
  const requestId = typeof recebido === 'string' && UUID.test(recebido) ? recebido : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  const inicio = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'INFO', requestId,
      method: METODOS.has(req.method) ? req.method : 'OTHER',
      route: req.route ? 'matched' : 'unmatched',
      statusCode: res.statusCode, durationMs: Date.now() - inicio,
    }));
  });
  next();
}

// Only controlled event codes are accepted; exceptions and request data are not logged.
export function logFalha(res: Response, codigo: 'BANCO_TIMEOUT' | 'ERRO_INTERNO' | 'STATUS_BANCO'): void {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'ERROR',
    requestId: res.locals.requestId, codigo }));
}
