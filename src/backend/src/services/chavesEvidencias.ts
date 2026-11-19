import { createHmac } from 'node:crypto';
import { AppError } from '../errors/AppError';

const CHAVE_LEGADA = /^odometro\/\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const CHAVE_OPACA = /^odometro\/v1\/[0-9a-f]{64}$/;
// Limite de metadados compatível com as evidências já persistidas.
export const limiteLeituraEvidencia = 15 * 1024 * 1024;

export function validarChave(chave: string): string {
  if (chave.trim() !== chave || (!CHAVE_LEGADA.test(chave) && !CHAVE_OPACA.test(chave))) {
    throw new AppError('Chave de armazenamento inválida', 500);
  }
  return chave;
}

export function chaveR2Evidencia(autorId: number, chaveIdempotencia: string, segredo: string): string {
  const identificador = createHmac('sha256', Buffer.from(segredo, 'hex'))
    .update(`${autorId}:${chaveIdempotencia}`).digest('hex');
  return `odometro/v1/${identificador}`;
}
