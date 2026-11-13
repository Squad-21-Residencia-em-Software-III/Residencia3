import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

// Proteção contra CSRF nas rotas de autenticação que usam o cookie de sessão. Complementa o
// SameSite=Strict: navegadores sempre enviam Origin em POST/PATCH, então uma origem presente e
// não autorizada, ou um pedido marcado como cross-site, é recusado. Clientes fora do navegador
// (sem Origin) seguem permitidos, pois não carregam cookies da vítima.
export function verificarOrigem(req: Request, _res: Response, next: NextFunction): void {
  const origem = req.get('origin');
  const crossSite = req.get('sec-fetch-site') === 'cross-site';
  const mesmaOrigem = origem !== undefined && origem === `${req.protocol}://${req.get('host')}`;

  if (crossSite || (origem !== undefined && !mesmaOrigem && !env.corsOrigens.includes(origem))) {
    next(new AppError('Origem não autorizada', 403));
    return;
  }
  next();
}
