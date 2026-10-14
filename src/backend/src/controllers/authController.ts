import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { authService } from '../services/authService';
import { alterarSenhaSchema, loginSchema } from '../validators/authSchemas';

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const credenciais = loginSchema.parse(req.body);
    res.json(await authService.login(credenciais));
  },

  me(req: Request, res: Response): void {
    res.json(usuarioAutenticado(req));
  },

  async alterarSenha(req: Request, res: Response): Promise<void> {
    const dados = alterarSenhaSchema.parse(req.body);
    await authService.alterarPropriaSenha(usuarioAutenticado(req).id, dados);
    res.status(204).send();
  },
};
