import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { veiculoService } from '../services/veiculoService';
import { criarVeiculoSchema, atualizarVeiculoSchema } from '../validators/veiculoSchemas';
import { AppError } from '../errors/AppError';

export const veiculoController = {
  async listar(_req: Request, res: Response): Promise<void> {
    res.json(await veiculoService.listar());
  },

  async listarVeiculosSvoDisponiveis(_req: Request, res: Response): Promise<void> {
    res.json(await veiculoService.listarSvoDisponiveis());
  },

  async criar(req: Request, res: Response): Promise<void> {
    const dados = criarVeiculoSchema.parse(req.body);
    const autor = usuarioAutenticado(req);

    const veiculo = await veiculoService.criar(dados, autor.id);

    res.status(201).location(`/api/veiculos/${veiculo.id}`).json(veiculo);
  },

  async atualizar(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('ID do veículo inválido', 400);
    }
    const dados = atualizarVeiculoSchema.parse(req.body);
    const autor = usuarioAutenticado(req);

    const veiculo = await veiculoService.atualizar(id, dados, autor.id);
    res.json(veiculo);
  },
};
