
import type { Request, Response } from 'express';
import { auditoriaService } from '../services/auditoriaService';
import { AppError } from '../errors/AppError';

export const auditoriaController = {
  async listar(req: Request, res: Response): Promise<void> {
    const pagina = Number(req.query.pagina ?? 1);
    const limite = Number(req.query.limite ?? 20);

    if (!Number.isInteger(pagina) || pagina < 1) {
      throw new AppError('Página inválida', 400);
    }

    if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
      throw new AppError('Limite inválido. Informe um valor entre 1 e 100', 400);
    }

    const registros = await auditoriaService.listar(pagina, limite);

    res.status(200).json(registros);
  },
};
