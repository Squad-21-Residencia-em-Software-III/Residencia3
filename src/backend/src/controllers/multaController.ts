import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { multaService } from '../services/multaService';
import { criarMultaSchema, atualizarMultaSchema } from '../validators/multaSchemas';
import { AppError } from '../errors/AppError';

export const multaController = {
  async listar(_req: Request, res: Response): Promise<void> {
    res.json(await multaService.listar());
  },

  async criar(req: Request, res: Response): Promise<void> {
    const dados = criarMultaSchema.parse(req.body);
    const autor = usuarioAutenticado(req);

    const multa = await multaService.criar(dados, autor.id);

    res.status(201).location(`/api/multas/${multa.id}`).json(multa);
  },

  async atualizar(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('ID da multa inválido', 400);
    }

    const dados = atualizarMultaSchema.parse(req.body);
    const autor = usuarioAutenticado(req);

    const multa = await multaService.atualizar(id, dados, autor.id);
    res.json(multa);
  },

  async excluir(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('ID da multa inválido', 400);
    }

    const autor = usuarioAutenticado(req);
    await multaService.excluir(id, autor.id);
    res.status(204).send();
  },
};
