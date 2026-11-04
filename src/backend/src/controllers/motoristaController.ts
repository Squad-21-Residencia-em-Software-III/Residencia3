import type { Request, Response } from 'express';
import { motoristaService } from '../services/motoristaService';
import { listarMotoristasSchema } from '../validators/motoristaSchemas';

export const motoristaController = {
  async listar(req: Request, res: Response): Promise<void> {
    const filtros = listarMotoristasSchema.parse(req.query);
    res.json(await motoristaService.listar(filtros));
  },
};
