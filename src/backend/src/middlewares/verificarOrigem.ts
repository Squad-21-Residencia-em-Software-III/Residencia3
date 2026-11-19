import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

// A origem pública é configurada explicitamente: Host e X-Forwarded-* não são prova de origem.
export function verificarOrigem(req: Request, res: Response, next: NextFunction): void {
  res.vary('Origin');
  res.vary('Referer');
  res.vary('Sec-Fetch-Site');
  const origin = req.get('origin');
  const referer = req.get('referer');
  let origem = origin;
  if (origin === undefined && referer !== undefined) {
    try {
      const url = new URL(referer);
      origem = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin : undefined;
    } catch {
      origem = undefined;
    }
  }

  if (req.get('sec-fetch-site') === 'cross-site' || !origem || !env.corsOrigens.includes(origem)) {
    next(new AppError('Origem não autorizada', 403));
    return;
  }
  next();
}
