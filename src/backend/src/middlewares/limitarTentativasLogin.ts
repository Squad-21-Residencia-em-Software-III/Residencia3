import type { NextFunction, Request, Response } from 'express';
import { rateLimit, type Options } from 'express-rate-limit';
import { env } from '../config/env';

// Limites de requisição por tipo de operação (docs/limites-e-timeouts.md).
// A contagem é por req.ip: o TRUST_PROXY define o caminho direto, e identificarCliente o ajusta
// no caminho da Vercel, autenticado pelo PROXY_SECRET (docs/seguranca-http.md). O keyGenerator
// padrão é mantido de propósito: é nele que rodam as validações do express-rate-limit, que
// acusam trust proxy permissivo ou X-Forwarded-For inesperado (TRUST_PROXY ausente atrás de um
// proxy) com erros ERR_ERL_* no log.
// A memória é local, por instância.

const QUINZE_MINUTOS = 15 * 60 * 1000;
const UM_MINUTO = 60 * 1000;

interface OpcoesLimitador {
  limite: number | (() => number);
  mensagem: string;
  janelaMs?: number;
  // true: só as respostas com erro contam (login e refresh, onde importa a tentativa recusada)
  somenteFalhas?: boolean;
  pular?: (req: Request) => boolean;
}

export function criarLimitador(limiteOuOpcoes: number | OpcoesLimitador, mensagem?: string) {
  const config: OpcoesLimitador =
    typeof limiteOuOpcoes === 'number'
      ? { limite: limiteOuOpcoes, mensagem: mensagem ?? 'Muitas requisições.', somenteFalhas: true }
      : limiteOuOpcoes;
  const { limite } = config;
  const opcoes: Partial<Options> = {
    windowMs: config.janelaMs ?? QUINZE_MINUTOS,
    // O limite é lido a cada requisição, para refletir a configuração atual
    limit: typeof limite === 'function' ? () => limite() : limite,
    skipSuccessfulRequests: config.somenteFalhas ?? false,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: { trustProxy: true, xForwardedForHeader: true },
    message: { erro: config.mensagem },
    ...(config.pular ? { skip: config.pular } : {}),
  };
  return rateLimit(opcoes);
}

// ---- Autenticação: sempre ativos, contam apenas as tentativas recusadas ----

export const limitarTentativasLogin = criarLimitador(
  10,
  'Muitas tentativas de login. Tente novamente em alguns minutos.'
);

// Renovações recusadas (refresh token inválido) também são limitadas
export const limitarRenovacoesSessao = criarLimitador(
  20,
  'Muitas tentativas de renovação de sessão. Tente novamente em alguns minutos.'
);

// ---- Limites gerais da API, por minuto e por IP ----

const limitesDesligados = () => !env.limitarRequisicoes;
// Login e refresh já têm limites próprios, mais restritivos e voltados a tentativas recusadas
const ROTAS_COM_LIMITE_PROPRIO = new Set(['/auth/login', '/auth/refresh']);

export const limitarLeitura = criarLimitador({
  janelaMs: UM_MINUTO,
  limite: () => env.rateLimitLeituraPorMin,
  mensagem: 'Muitas consultas em pouco tempo. Aguarde alguns instantes e tente novamente.',
  pular: limitesDesligados,
});

export const limitarEscrita = criarLimitador({
  janelaMs: UM_MINUTO,
  limite: () => env.rateLimitEscritaPorMin,
  mensagem: 'Muitas alterações em pouco tempo. Aguarde alguns instantes e tente novamente.',
  pular: (req) => limitesDesligados() || ROTAS_COM_LIMITE_PROPRIO.has(req.path),
});

// Consultas que agregam muitos dados (dashboard, auditoria): limite menor, somado ao de leitura
export const limitarConsultasPesadas = criarLimitador({
  janelaMs: UM_MINUTO,
  limite: () => env.rateLimitPesadasPorMin,
  mensagem: 'Muitas consultas a relatórios em pouco tempo. Aguarde um minuto e tente novamente.',
  pular: limitesDesligados,
});

const METODOS_LEITURA = new Set(['GET', 'HEAD']);

// Leitura e escrita têm contadores independentes: excesso de consultas não bloqueia alterações
export function limitarPorTipoDeOperacao(req: Request, res: Response, next: NextFunction): void {
  const limitador = METODOS_LEITURA.has(req.method) ? limitarLeitura : limitarEscrita;
  void limitador(req, res, next);
}
