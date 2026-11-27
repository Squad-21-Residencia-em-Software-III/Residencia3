import type { RequestHandler } from 'express';
import { env } from '../config/env';
import type { RecursoFase3 } from '../config/fase3';

export function exigirRecursoFase3(...recursos: [RecursoFase3, ...RecursoFase3[]]): RequestHandler {
  return (_req, res, next) => {
    if (!recursos.some((recurso) => env.fase3.flags[recurso])) {
      res.status(404).json({ erro: 'Rota não encontrada', codigo: 'RECURSO_DESATIVADO' });
      return;
    }
    next();
  };
}
