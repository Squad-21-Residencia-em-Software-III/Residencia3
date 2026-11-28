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
// Idempotency-Key e X-Prova-Tentativa: criação do portal SVO (SCRUM-264/266);
// X-Credencial-Acompanhamento: consulta pública por credencial (SCRUM-266). Só os necessários, com origens restritas.
export const CABECALHOS_CORS = [
  'Content-Type',
  'Authorization',
  'Idempotency-Key',
  'X-Prova-Tentativa',
  'X-Credencial-Acompanhamento',
];

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
