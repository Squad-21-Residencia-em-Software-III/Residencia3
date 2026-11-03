
import type { Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { disponibilidadeService } from '../services/disponibilidadeService';

export const disponibilidadeController = {
  async consultar(req: Request, res: Response): Promise<void> {
    const solicitacaoId = Number(req.params.id);

    if (!Number.isInteger(solicitacaoId) || solicitacaoId <= 0) {
      throw new AppError('ID da solicitação inválido', 400);
    }

    const resultado = await disponibilidadeService.consultar(
      solicitacaoId
    );

    res.status(200).json(resultado);
  },
};
