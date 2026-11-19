import sharp from 'sharp';
import { AppError } from '../errors/AppError';

export const TAMANHO_MAXIMO_FOTO_BYTES = 10 * 1024 * 1024;
export type FormatoFoto = 'image/jpeg' | 'image/png' | 'image/webp';

/** Primeiro confere a assinatura, antes de acionar o decodificador. */
export function detectarFormato(bytes: Buffer): FormatoFoto | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export async function normalizarFotoOdometro(entrada: Buffer) {
  if (entrada.length > TAMANHO_MAXIMO_FOTO_BYTES) {
    throw new AppError('A foto deve ter no máximo 10 MB', 413);
  }
  const formato = detectarFormato(entrada);
  if (!formato) {
    throw new AppError('Envie uma foto JPG, PNG ou WebP. Fotos HEIC do iPhone precisam ser convertidas.', 400);
  }
  let bytes: Buffer;
  try {
    const decoder = formato === 'image/jpeg' ? 'jpeg' : formato === 'image/png' ? 'png' : 'webp';
    const imagem = sharp(entrada, { failOn: 'warning', limitInputPixels: 16_000_000 });
    const metadados = await imagem.metadata();
    if (metadados.format !== decoder || (metadados.pages ?? 1) > 1) {
      throw new Error('Formato de imagem inválido');
    }
    bytes = await imagem.autoOrient().toFormat(decoder).timeout({ seconds: 4 }).toBuffer();
  } catch {
    throw new AppError('A foto está corrompida ou ultrapassa o limite de resolução', 422);
  }
  if (bytes.length > TAMANHO_MAXIMO_FOTO_BYTES) {
    throw new AppError('A foto processada deve ter no máximo 10 MB', 413);
  }
  return { formato, bytes };
}
