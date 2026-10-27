import type { Request, Response } from 'express';
import { manutencaoService } from '../services/manutencaoService';
import {
  criarManutencaoSchema,
  atualizarStatusManutencaoSchema,
} from '../validators/manutencaoSchemas';
import { AppError } from '../errors/AppError';
import { usuarioAutenticado } from '../middlewares/autenticar';

export const manutencaoController = {
  async criar(req: Request, res: Response): Promise<void> {
    const dados = criarManutencaoSchema.parse(req.body);
    const autor = usuarioAutenticado(req);

    const manutencao = await manutencaoService.criar(dados, autor.id);

    res
      .status(201)
      .location(`/api/manutencoes/${manutencao.id}`)
      .json(manutencao);
  },

  async atualizarStatus(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('ID da manutenção inválido', 400);
    }

    const { status } = atualizarStatusManutencaoSchema.parse(req.body);
    const autor = usuarioAutenticado(req);

    const manutencao = await manutencaoService.atualizarStatus(id, status, autor.id);
    res.json(manutencao);
  },

  async listarPorVeiculo(req: Request, res: Response): Promise<void> {
    const veiculoId = Number(req.params.veiculoId);

    if (!Number.isInteger(veiculoId) || veiculoId <= 0) {
      throw new AppError('ID do veículo inválido', 400);
    }

    const manutencoes = await manutencaoService.listarPorVeiculo(veiculoId);
    res.json(manutencoes);
  },
};
