import { timingSafeEqual } from 'node:crypto';
import { isIP, SocketAddress } from 'node:net';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

const CABECALHO_SEGREDO_PROXY = 'x-proxy-secret';
const CABECALHO_IP_VERCEL = 'x-vercel-forwarded-for';

export function segredoConfere(recebido: unknown, esperado: string | undefined): boolean {
  if (!esperado || typeof recebido !== 'string' || recebido.includes(',')) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizarIp(valor: unknown): string | undefined {
  if (typeof valor !== 'string' || valor.includes('%')) return undefined;
  const familia = isIP(valor);
  if (familia === 4) return valor;
  if (familia !== 6) return undefined;

  const endereco = new SocketAddress({ address: valor, family: 'ipv6' }).address;
  const mapeado = endereco.slice(7);
  return endereco.startsWith('::ffff:') && isIP(mapeado) === 4 ? mapeado : endereco;
}

export function identificarCliente(req: Request, res: Response, next: NextFunction): void {
  // A Vercel define seu próprio XFF e substitui o segredo no rewrite da API.
  const autenticado = segredoConfere(req.headers[CABECALHO_SEGREDO_PROXY], env.proxySecret);
  const ipVercel = autenticado ? normalizarIp(req.headers[CABECALHO_IP_VERCEL]) : undefined;
  delete req.headers[CABECALHO_SEGREDO_PROXY];
  delete req.headers[CABECALHO_IP_VERCEL];

  const ip = ipVercel ?? normalizarIp(req.ip) ?? normalizarIp(req.socket.remoteAddress);
  if (ip) Object.defineProperty(req, 'ip', { value: ip, configurable: true, enumerable: true });
  res.locals.caminhoDeAcesso = ipVercel ? 'vercel' : 'direto';
  next();
}
