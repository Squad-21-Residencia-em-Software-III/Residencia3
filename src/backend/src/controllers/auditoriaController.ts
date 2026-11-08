
import type { Request, Response } from 'express';
import { auditoriaService } from '../services/auditoriaService';

export const auditoriaController = {
  async listar(_req: Request, res: Response): Promise<void> {
    const registros = await auditoriaService.listar();

    res.status(200).json(registros);
  },
};
