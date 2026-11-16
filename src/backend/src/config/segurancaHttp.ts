import cors from 'cors';
import helmet from 'helmet';
import { env } from './env';

// Cabeçalhos de segurança para uma API que só responde JSON (docs/seguranca-http.md).
// A política é restritiva: nada da API deve ser carregado como página, script ou iframe.
export function cabecalhosDeSeguranca() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
    },
    // HSTS só faz sentido sob HTTPS (produção); em desenvolvimento a API roda em http://localhost
    strictTransportSecurity: env.producao ? { maxAge: 180 * 24 * 60 * 60, includeSubDomains: true } : false,
    // same-site mantém o frontend local (localhost:5173 → localhost:3000) funcionando
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
  });
}

export const METODOS_CORS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export const CABECALHOS_CORS = ['Content-Type', 'Authorization'];

// Apenas as origens de CORS_ORIGIN (por ambiente), nunca "*", pois as rotas de sessão usam cookie
export function corsPorAmbiente() {
  return cors({
    origin: env.corsOrigens,
    credentials: true,
    methods: METODOS_CORS,
    allowedHeaders: CABECALHOS_CORS,
    maxAge: 600,
  });
}
