
import type { Request, Response } from 'express';
import { abastecimentoService } from '../services/abastecimentoService';
import { criarAbastecimentoSchema } from '../validators/abastecimentoSchemas';
import { AppError } from '../errors/AppError';
import { usuarioAutenticado } from '../middlewares/autenticar';

export const abastecimentoController = {
  async criar(req: Request, res: Response): Promise<void> {
    const dados = criarAbastecimentoSchema.parse(req.body);

  const autor = usuarioAutenticado(req);
const abastecimento = await abastecimentoService.criar(dados, autor.id);

    res.status(201)
      .location(`/api/abastecimentos/${abastecimento.id}`)
      .json(abastecimento);
  },

  async listarPorVeiculo(req: Request, res: Response): Promise<void> {
    const veiculoId = Number(req.params.veiculoId);

    if (!Number.isInteger(veiculoId) || veiculoId <= 0) {
      throw new AppError('ID do veículo inválido', 400);
    }

    const abastecimentos =
      await abastecimentoService.listarPorVeiculo(veiculoId);

    res.json(abastecimentos);
  },
};
