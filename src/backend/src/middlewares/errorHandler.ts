import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';

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

export function rotaNaoEncontrada(req: Request, res: Response): void {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // A resposta já foi enviada (ex.: tempo limite da requisição); não há o que responder
  if (res.headersSent) {
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      erro: err.message,
      ...(err.codigo ? { codigo: err.codigo } : {}),
      ...(err.contexto === undefined ? {} : { contexto: err.contexto }),
    });
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

  // O banco pode ainda aguardar a migration da agenda; não expor SQL nem prometer operação parcial.
  if (typeof err === 'object' && err !== null && 'code' in err && 'message' in err &&
      ((err.code === '42703' && String(err.message).includes('liberada_em')) ||
       (err.code === '42P01' && String(err.message).includes('alertas_atraso_svo')))) {
    res.status(503).json({ erro: 'A agenda SVO ainda não está disponível: a estrutura do banco precisa ser atualizada pela equipe responsável.' });
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
    // Registra só o tipo do erro, sem SQL nem parâmetros
    console.error('Tempo limite no banco de dados:', (err as Error).name, (err as { code?: string }).code ?? '');
    res.set('Retry-After', '5').status(503).json({ erro: tempoEsgotado });
    return;
  }

  console.error('Erro inesperado:', err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
}
