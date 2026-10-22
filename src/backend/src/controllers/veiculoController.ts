import type { Request, Response } from 'express';
import { veiculoModel } from '../models/veiculoModel';

export const veiculoController = {
  async listarVeiculosSvoDisponiveis(_req: Request, res: Response): Promise<void> {
    const veiculos = await veiculoModel.listarSvoDisponiveis();
    res.status(200).json(veiculos);
  }
};
