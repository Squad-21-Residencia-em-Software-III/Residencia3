import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

// Identificação do IP real do cliente nos dois caminhos de acesso (docs/seguranca-http.md):
//
//   direto: cliente → borda do Render → API
//   Vercel: cliente → rewrite /api da Vercel → borda do Render → API
//
// O caminho da Vercel tem um proxy a mais, então nenhum TRUST_PROXY fixo serve aos dois: com o
// valor do caminho direto, o IP identificado no caminho da Vercel seria o da própria Vercel
// (todos os usuários dividiriam o mesmo limite); com um salto a mais, qualquer cliente que
// chame o Render diretamente poderia forjar o IP no X-Forwarded-For.
//
// Por isso, TRUST_PROXY descreve o caminho direto, e a Vercel se identifica com PROXY_SECRET
// no cabeçalho X-Proxy-Secret (definido no vercel.json com "set", que substitui qualquer valor
// enviado pelo visitante). Só com o segredo válido a API confia em mais um salto.

export const CABECALHO_SEGREDO_PROXY = 'x-proxy-secret';

export type CaminhoDeAcesso = 'direto' | 'vercel';

export interface ClienteIdentificado {
  ip: string;
  caminho: CaminhoDeAcesso;
}

function segredoConfere(recebido: unknown, esperado: string | undefined): boolean {
  if (!esperado || typeof recebido !== 'string') return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Todos os endereços da cadeia, do mais próximo (conexão) ao mais distante: [socket, ...XFF invertido]
function cadeiaCompleta(req: Request): string[] {
  const cabecalho = req.headers['x-forwarded-for'];
  const valor = Array.isArray(cabecalho) ? cabecalho.join(',') : (cabecalho ?? '');
  const encaminhados = valor.split(',').map((item) => item.trim()).filter(Boolean).reverse();
  return [req.socket.remoteAddress ?? '', ...encaminhados];
}

export function identificarCliente(req: Request, res: Response, next: NextFunction): void {
  const viaVercel = segredoConfere(req.headers[CABECALHO_SEGREDO_PROXY], env.proxySecret);
  // O segredo nunca segue para as rotas nem para logs
  delete req.headers[CABECALHO_SEGREDO_PROXY];

  // Guardado para o diagnóstico: o que o TRUST_PROXY sozinho identificaria
  res.locals.ipPeloTrustProxy = req.ip;
  if (viaVercel) {
    // req.ips tem uma entrada por endereço do X-Forwarded-For considerado pelo TRUST_PROXY, então
    // req.ip está na posição req.ips.length da cadeia completa. A Vercel é esse endereço, e o
    // cliente é o anterior a ela. Se não houver anterior (a borda não acrescentou a Vercel), o
    // req.ip já é o cliente.
    const anterior = cadeiaCompleta(req)[req.ips.length + 1];
    // Só nesta requisição, req.ip passa a ser o cliente. O keyGenerator padrão do rate limit
    // (e as validações ERR_ERL_* dele) continuam lendo req.ip normalmente.
    if (anterior) Object.defineProperty(req, 'ip', { value: anterior, configurable: true, enumerable: true });
  }

  res.locals.caminhoDeAcesso = viaVercel ? 'vercel' : 'direto';
  next();
}

export function clienteDaRequisicao(req: Request, res: Response): ClienteIdentificado {
  const caminho = (res.locals.caminhoDeAcesso as CaminhoDeAcesso | undefined) ?? 'direto';
  return { ip: req.ip ?? req.socket.remoteAddress ?? '', caminho };
}
