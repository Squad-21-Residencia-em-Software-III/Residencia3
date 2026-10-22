import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { veiculoService } from '../services/veiculoService';
import { criarVeiculoSchema } from '../validators/veiculoSchemas';

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
};