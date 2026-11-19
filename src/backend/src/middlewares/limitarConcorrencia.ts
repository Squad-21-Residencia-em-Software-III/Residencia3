import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

// O health check continua respondendo mesmo com o servidor ocupado
const ROTAS_LIVRES = new Set(['/api/status']);

// Limita as requisições em andamento nesta instância. Acima do máximo, responde 503 de imediato
// em vez de enfileirar trabalho que esgotaria o pool de conexões e o tempo de resposta.
export function criarLimitadorConcorrencia(maximo: () => number = () => env.maxRequisicoesSimultaneas) {
  let emAndamento = 0;

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    if (ROTAS_LIVRES.has(req.path)) {
      next();
      return;
    }
    if (emAndamento >= maximo()) {
      res.set('Retry-After', '1').status(503).json({ erro: 'Servidor ocupado. Tente novamente em instantes.' });
      return;
    }

    emAndamento += 1;
    let liberado = false;
    const liberar = () => {
      if (!liberado) {
        liberado = true;
        emAndamento -= 1;
      }
    };
    res.once('finish', liberar);
    res.once('close', liberar);
    next();
  };

  return Object.assign(middleware, { emAndamento: () => emAndamento });
}

export const limitarConcorrencia = criarLimitadorConcorrencia();
