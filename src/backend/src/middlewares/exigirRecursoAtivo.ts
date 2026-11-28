import type { RequestHandler } from 'express';
import { env } from '../config/env';
import type { RecursoOperacional } from '../config/recursosOperacionais';

export function exigirRecursoAtivo(...recursos: [RecursoOperacional, ...RecursoOperacional[]]): RequestHandler {
  return (_req, res, next) => {
    if (!recursos.some((recurso) => env.recursosOperacionais.flags[recurso])) {
      res.status(404).json({ erro: 'Rota não encontrada', codigo: 'RECURSO_DESATIVADO' });
      return;
    }
    next();
  };
}
