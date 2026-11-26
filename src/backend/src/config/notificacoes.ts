import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });

export function notificacoesLigadas(valor: string | undefined): boolean {
  const escolha = (valor ?? '').trim() || 'false';
  if (escolha !== 'true' && escolha !== 'false') throw new Error('NOTIFICACOES_ATIVAS deve ser true ou false');
  return escolha === 'true';
}

/**
 * Desligado, nenhum aviso é publicado e as operações ficam como antes (docs/scrum-230-avisos-solicitacoes.md).
 * Fora do env.ts de propósito: a rotina de expiração usa este módulo e não tem JWT_SECRET nem as demais
 * variáveis da API.
 */
export const configNotificacoes = { ativas: notificacoesLigadas(process.env.NOTIFICACOES_ATIVAS) };
