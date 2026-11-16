import { rateLimit, type Options } from 'express-rate-limit';

// O limite é contado por req.ip, que só reflete o IP real do cliente se TRUST_PROXY estiver
// de acordo com a cadeia de proxies da hospedagem (docs/seguranca-http.md). As validações do
// express-rate-limit ficam ativas para acusar trust proxy permissivo ou X-Forwarded-For
// inesperado (sinal de TRUST_PROXY ausente atrás de um proxy).
export function criarLimitador(limite: number, mensagem: string) {
  const opcoes: Partial<Options> = {
    windowMs: 15 * 60 * 1000,
    limit: limite,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: { trustProxy: true, xForwardedForHeader: true },
    message: { erro: mensagem },
  };
  return rateLimit(opcoes);
}

export const limitarTentativasLogin = criarLimitador(
  10,
  'Muitas tentativas de login. Tente novamente em alguns minutos.'
);

// Renovações recusadas (refresh token inválido) também são limitadas
export const limitarRenovacoesSessao = criarLimitador(
  20,
  'Muitas tentativas de renovação de sessão. Tente novamente em alguns minutos.'
);
