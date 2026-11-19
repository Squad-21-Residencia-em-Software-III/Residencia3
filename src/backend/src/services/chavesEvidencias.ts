import { createHash } from 'node:crypto';
import { AppError } from '../errors/AppError';

const CHAVE_LEGADA = /^odometro\/\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHAVE_POSTGRES = /^odometro\/pg\/[0-9a-f]{64}$/;
// Limite de metadados compatível com as evidências já persistidas.
export const limiteLeituraEvidencia = 15 * 1024 * 1024;

export function validarChave(chave: string): string {
  if (chave.trim() !== chave || (!CHAVE_LEGADA.test(chave) && !CHAVE_POSTGRES.test(chave))) {
    throw new AppError('Chave de armazenamento inválida', 500);
  }
  return chave;
}

export function chavePostgresEvidencia(autorId: number, chaveIdempotencia: string): string {
  const identificador = createHash('sha256').update(`${autorId}:${chaveIdempotencia}`).digest('hex');
  return `odometro/pg/${identificador}`;
}
