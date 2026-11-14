import type { Request, Response } from 'express';
import { COOKIE_REFRESH, opcoesBaseCookieRefresh, opcoesCookieRefresh } from '../config/cookieSessao';
import { AppError } from '../errors/AppError';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { authService, type SessaoEmitida } from '../services/authService';
import { alterarSenhaSchema, loginSchema } from '../validators/authSchemas';

// O access token vai no corpo; o refresh token só no cookie HttpOnly, nunca no JSON
function responderSessao(res: Response, sessao: SessaoEmitida): void {
  res.cookie(COOKIE_REFRESH, sessao.refreshToken, opcoesCookieRefresh(sessao.sessaoExp));
  res.json(sessao.resposta);
}

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const credenciais = loginSchema.parse(req.body);
    responderSessao(res, await authService.login(credenciais));
  },

  // O refresh token é lido apenas do cookie; o corpo da requisição é ignorado
  async renovar(req: Request, res: Response): Promise<void> {
    const refreshToken: unknown = req.cookies?.[COOKIE_REFRESH];
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new AppError('Token inválido ou expirado', 401);
    }
    responderSessao(res, await authService.renovarSessao(refreshToken));
  },

  // Remove o cookie deste navegador. Não revoga cópias do token, que valem até expirar
  logout(_req: Request, res: Response): void {
    res.clearCookie(COOKIE_REFRESH, opcoesBaseCookieRefresh());
    res.status(204).end();
  },

  me(req: Request, res: Response): void {
    res.json(usuarioAutenticado(req));
  },

  async alterarSenha(req: Request, res: Response): Promise<void> {
    const dados = alterarSenhaSchema.parse(req.body);
    // Sessões anteriores deixam de valer; a atual recebe access token e cookie novos
    responderSessao(res, await authService.alterarPropriaSenha(usuarioAutenticado(req).id, dados));
  },
};
