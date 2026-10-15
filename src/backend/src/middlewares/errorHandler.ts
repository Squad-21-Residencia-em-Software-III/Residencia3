import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';

const VIOLACAO_UNIQUE_POSTGRES = '23505';

export function rotaNaoEncontrada(req: Request, res: Response): void {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ erro: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      erro: 'Dados inválidos',
      detalhes: err.issues.map((issue) => ({
        campo: issue.code === 'unrecognized_keys' ? issue.keys.join(', ') : issue.path.join('.'),
        mensagem: issue.message,
      })),
    });
    return;
  }

  if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json({ erro: 'JSON inválido no corpo da requisição' });
    return;
  }

  if (typeof err === 'object' && err !== null && 'code' in err && err.code === VIOLACAO_UNIQUE_POSTGRES) {
    res.status(409).json({ erro: 'Registro duplicado: já existe um cadastro com estes dados' });
    return;
  }

  console.error('Erro inesperado:', err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
}
