
import type { Request, Response } from 'express';
import { equipeSvoService } from '../services/equipeSvoService';
import { consultarDisponibilidadeEquipesQuerySchema } from '../validators/equipeSvoSchemas';

export const equipeSvoController = {
  async consultarDisponibilidade(
    req: Request,
    res: Response
  ): Promise<void> {
    const filtros = consultarDisponibilidadeEquipesQuerySchema.parse(req.query);

    const resultado = await equipeSvoService.consultarDisponibilidade(filtros);

    res.json(resultado);
  },
};
