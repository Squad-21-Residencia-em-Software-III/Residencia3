import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env';
import { clienteDaRequisicao } from '../middlewares/identificarCliente';

// Diagnóstico da cadeia de proxies (docs/seguranca-http.md#decisão-e-validação).
// Só existe com DIAGNOSTICO_PROXY_TOKEN definido e exige o token no cabeçalho
// X-Diagnostico-Token. Sem a variável, responde 404 como qualquer rota inexistente.
// Retorna apenas os cabeçalhos ligados a proxy: nunca cookies, Authorization ou o PROXY_SECRET.

const CABECALHOS_DE_PROXY = [
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-real-ip',
  'x-vercel-forwarded-for',
  'cf-connecting-ip',
  'true-client-ip',
] as const;

function tokenConfere(recebido: unknown, esperado: string): boolean {
  if (typeof recebido !== 'string') return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const diagnosticoRoutes = Router();

diagnosticoRoutes.get('/ip', (req, res, next) => {
  const token = env.diagnosticoProxyToken;
  if (!token) {
    next();
    return;
  }
  if (!tokenConfere(req.headers['x-diagnostico-token'], token)) {
    res.status(401).json({ erro: 'Token de diagnóstico inválido' });
    return;
  }

  const cabecalhos: Record<string, string | null> = {};
  for (const nome of CABECALHOS_DE_PROXY) {
    const valor = req.headers[nome];
    cabecalhos[nome] = valor === undefined ? null : Array.isArray(valor) ? valor.join(', ') : valor;
  }
  const cliente = clienteDaRequisicao(req, res);

  res.set('Cache-Control', 'no-store').json({
    clienteIdentificado: cliente.ip,
    caminho: cliente.caminho,
    ipPeloTrustProxy: (res.locals.ipPeloTrustProxy as string | undefined) ?? null,
    reqIps: req.ips,
    conexao: req.socket.remoteAddress ?? null,
    protocolo: req.protocol,
    trustProxy: env.trustProxy,
    cabecalhoVercelPresente: req.headers['x-vercel-id'] !== undefined,
    cabecalhos,
  });
});
