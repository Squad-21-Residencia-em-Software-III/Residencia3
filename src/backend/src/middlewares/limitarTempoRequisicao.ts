import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

export const MENSAGEM_TEMPO_ESGOTADO = 'A requisição excedeu o tempo limite. Tente novamente.';

// Encerra com 503 a requisição que não respondeu dentro do tempo limite. A resposta que o
// handler tentar enviar depois é descartada, sem erro de "headers already sent".
export function criarLimitadorTempo(tempoMs: () => number = () => env.requestTimeoutMs) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const descartarSeEsgotado =
      <T extends (...args: never[]) => Response>(original: T) =>
      (...args: Parameters<T>): Response =>
        res.locals.tempoEsgotado && res.headersSent ? res : original(...args);

    res.json = descartarSeEsgotado(res.json.bind(res));
    res.send = descartarSeEsgotado(res.send.bind(res));

    const timer = setTimeout(() => {
      if (res.headersSent) return;
      res.locals.tempoEsgotado = true;
      res.set('Retry-After', '5').status(503).json({ erro: MENSAGEM_TEMPO_ESGOTADO });
    }, tempoMs());
    timer.unref();

    const limpar = () => clearTimeout(timer);
    res.once('finish', limpar);
    res.once('close', limpar);
    next();
  };
}

export const limitarTempoRequisicao = criarLimitadorTempo();
