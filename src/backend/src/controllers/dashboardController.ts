import type { Request, Response } from 'express';
import { dashboardService } from '../services/dashboardService';
import { consultarDashboardSchema } from '../validators/dashboardSchemas';

export const dashboardController = {
  async consultar(req: Request, res: Response): Promise<void> {
    const filtros = consultarDashboardSchema.parse(req.query);
    res.json(await dashboardService.consultar(filtros));
  },
};
