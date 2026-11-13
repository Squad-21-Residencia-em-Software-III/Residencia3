import type { CookieOptions } from 'express';
import { env } from './env';

// Refresh token em cookie HttpOnly (docs/seguranca-sessoes.md): inacessível ao JavaScript da
// página, enviado só às rotas /api/auth e nunca a outros sites (SameSite=Strict). Sem Domain:
// o cookie fica preso ao host que o emitiu (o domínio do frontend, quando atrás do proxy /api).
export const COOKIE_REFRESH = 'refreshToken';
export const CAMINHO_COOKIE_REFRESH = '/api/auth';

export function opcoesBaseCookieRefresh(): CookieOptions {
  return { httpOnly: true, secure: env.cookieSecure, sameSite: 'strict', path: CAMINHO_COOKIE_REFRESH };
}

// O cookie expira junto com a sessão (fim absoluto, em segundos)
export function opcoesCookieRefresh(sessaoExp: number): CookieOptions {
  return { ...opcoesBaseCookieRefresh(), maxAge: Math.max(0, sessaoExp * 1000 - Date.now()) };
}
