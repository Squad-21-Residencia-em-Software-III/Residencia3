import type { Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { motoristaService } from '../services/motoristaService';
import { listarMotoristasSchema } from '../validators/motoristaSchemas';

export const motoristaController = {
  async listar(req: Request, res: Response): Promise<void> {
    const filtros = listarMotoristasSchema.parse(req.query);
    res.json(await motoristaService.listar(filtros));
  },

  async me(req: Request, res: Response): Promise<void> {
    const usuario = usuarioAutenticado(req);
    const motorista = await motoristaService.buscarPorUsuarioId(usuario.id);
    if (!motorista) {
      throw new AppError('Registro de motorista não encontrado para o usuário logado', 404);
    }
    res.json(motorista);
  },
};
