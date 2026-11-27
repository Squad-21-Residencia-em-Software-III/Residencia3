import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

/**
 * Protocolo, credencial e digests do portal SVO (SCRUM-264).
 * Os formatos seguem o contrato da SCRUM-266 (protocolo SVO-AAAAMMDD-XXXXXXXXXXXX, digest HMAC-SHA-256),
 * para que a consulta de acompanhamento valide as credenciais emitidas aqui.
 *
 * Credencial derivada: em vez de guardar o segredo (ou um envelope criptografado), ele é recalculado
 * a partir do segredo do servidor + chave de idempotência + prova da tentativa. Só quem tem a prova
 * original (gerada pelo navegador) recupera a mesma credencial depois de uma resposta perdida.
 */

const ALFABETO_PROTOCOLO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const COMPRIMENTO_SUFIXO_PROTOCOLO = 12;

export const ALGORITMO_DIGEST_CREDENCIAL = 'HMAC-SHA-256';

export function gerarProtocoloExternoSvo(agora = new Date()): string {
  const ano = String(agora.getUTCFullYear()).padStart(4, '0');
  const mes = String(agora.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(agora.getUTCDate()).padStart(2, '0');
  const bytes = randomBytes(COMPRIMENTO_SUFIXO_PROTOCOLO);
  let sufixo = '';
  for (let i = 0; i < COMPRIMENTO_SUFIXO_PROTOCOLO; i += 1) {
    sufixo += ALFABETO_PROTOCOLO.charAt((bytes[i] ?? 0) % ALFABETO_PROTOCOLO.length);
  }
  return `SVO-${ano}${mes}${dia}-${sufixo}`;
}

/** Credencial de 256 bits (43 caracteres base64url), sempre a mesma para a mesma chave e prova. */
export function derivarCredencialExterna(chaveIdempotencia: string, provaTentativa: string): string {
  return createHmac('sha256', `${env.jwtSecret}:svo-credencial-derivada-v1`)
    .update(`${chaveIdempotencia.trim()}:${provaTentativa.trim()}`, 'utf8')
    .digest('base64url');
}

export function calcularDigestCredencialExterna(credencial: string): string {
  return createHmac('sha256', `${env.jwtSecret}:svo-credencial-externa-v1`)
    .update(credencial.trim(), 'utf8')
    .digest('hex');
}

export function calcularDigestProvaTentativa(chaveIdempotencia: string, provaTentativa: string): string {
  return createHmac('sha256', `${env.jwtSecret}:svo-prova-tentativa-v1`)
    .update(`${chaveIdempotencia.trim()}:${provaTentativa.trim()}`, 'utf8')
    .digest('hex');
}

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor !== null && typeof valor === 'object' && !(valor instanceof Date)) {
    const entradas = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entradas.map(([k, v]) => [k, canonico(v)]));
  }
  if (valor instanceof Date) return valor.toISOString();
  return valor;
}

/** Digest do corpo já normalizado: a mesma intenção gera sempre o mesmo digest. */
export function calcularDigestPayloadCriacao(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonico(payload ?? {})), 'utf8').digest('hex');
}

/** Comparação em tempo constante de dois digests hexadecimais de 64 caracteres. */
export function digestsIguais(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || !/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a.toLowerCase(), 'hex'), Buffer.from(b.toLowerCase(), 'hex'));
}
