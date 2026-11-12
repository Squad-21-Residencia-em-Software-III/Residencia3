import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { authService } from '../services/authService';
import { alterarSenhaSchema, loginSchema, renovarSessaoSchema } from '../validators/authSchemas';

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const credenciais = loginSchema.parse(req.body);
    res.json(await authService.login(credenciais));
  },

  async renovar(req: Request, res: Response): Promise<void> {
    const { refreshToken } = renovarSessaoSchema.parse(req.body);
    res.json(await authService.renovarSessao(refreshToken));
  },

  me(req: Request, res: Response): void {
    res.json(usuarioAutenticado(req));
  },

  async alterarSenha(req: Request, res: Response): Promise<void> {
    const dados = alterarSenhaSchema.parse(req.body);
    // Sessões anteriores deixam de valer; a atual recebe tokens novos
    res.json(await authService.alterarPropriaSenha(usuarioAutenticado(req).id, dados));
  },
};
