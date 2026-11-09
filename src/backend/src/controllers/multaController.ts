import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { multaService } from '../services/multaService';
import { criarMultaSchema } from '../validators/multaSchemas';

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
};