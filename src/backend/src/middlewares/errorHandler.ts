import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { sanitizeData } from '../utils/sanitizer';

const VIOLACAO_UNIQUE_POSTGRES = '23505';
// statement_timeout atingido: o PostgreSQL cancelou a consulta
const CONSULTA_CANCELADA_POSTGRES = '57014';

const OPERACAO_DEMORADA = 'A operação demorou mais que o permitido. Tente novamente.';

function tempoEsgotadoNoBanco(err: object): string | undefined {
  if ('code' in err && err.code === CONSULTA_CANCELADA_POSTGRES) return OPERACAO_DEMORADA;
  // query_timeout do driver pg (lado do cliente)
  if (err instanceof Error && err.message === 'Query read timeout') return OPERACAO_DEMORADA;
  // Nenhuma conexão livre no pool dentro de acquireTimeoutMillis
  if (err instanceof Error && err.name === 'KnexTimeoutError') return 'Banco de dados ocupado. Tente novamente em instantes.';
  return undefined;
}

function sanitizarTextoErro(texto: string): string {
  return texto
    .replace(/(senha|password|token|authorization|secret|cpf|cartao|credencial)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

export function rotaNaoEncontrada(_req: Request, res: Response): void {
  res.status(404).json({ erro: 'Rota não encontrada' });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // A resposta já foi enviada (ex.: tempo limite da requisição); não há o que responder
  if (res.headersSent) {
    return;
  }

  const requestId = (req.headers['x-request-id'] as string) || 'N/A';

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

  // Corpo acima do limite do express.json (100 KB)
  if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.too.large') {
    res.status(413).json({ erro: 'O corpo da requisição excede o limite de 100 KB' });
    return;
  }

  if (typeof err === 'object' && err !== null && 'code' in err && err.code === VIOLACAO_UNIQUE_POSTGRES) {
    res.status(409).json({ erro: 'Registro duplicado: já existe um cadastro com estes dados' });
    return;
  }

  const tempoEsgotado = typeof err === 'object' && err !== null ? tempoEsgotadoNoBanco(err) : undefined;
  if (tempoEsgotado) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        level: 'ERROR',
        method: req.method,
        path: req.path,
        statusCode: 503,
        errorName: (err as Error).name,
        errorCode: (err as { code?: string }).code ?? '',
        message: tempoEsgotado,
      })
    );
    res.set('Retry-After', '5').status(503).json({ erro: tempoEsgotado });
    return;
  }

  const mensagemOriginal = err instanceof Error ? err.message : String(err);
  const stackOriginal = err instanceof Error ? err.stack : undefined;

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId,
      level: 'ERROR',
      method: req.method,
      path: req.path,
      statusCode: 500,
      message: sanitizarTextoErro(mensagemOriginal),
      body: sanitizeData(req.body),
      stack: process.env.NODE_ENV === 'production' ? '[REDACTED]' : stackOriginal ? sanitizarTextoErro(stackOriginal) : undefined,
    })
  );

  res.status(500).json({ erro: 'Erro interno do servidor' });
}