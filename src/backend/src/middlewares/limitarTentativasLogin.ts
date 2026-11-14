import { rateLimit } from 'express-rate-limit';

export const limitarTentativasLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

// Renovações recusadas (refresh token inválido) também são limitadas
export const limitarRenovacoesSessao = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de renovação de sessão. Tente novamente em alguns minutos.' },
});
