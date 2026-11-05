import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { unidadeService } from '../services/unidadeService';
import { idParamSchema } from '../validators/comuns';
import { associarGestorSchema, gestorUnidadeParamSchema } from '../validators/unidadeSchemas';

export const unidadeController = {
  async listar(_req: Request, res: Response): Promise<void> {
    res.json(await unidadeService.listar());
  },

  async listarComGestores(_req: Request, res: Response): Promise<void> {
    res.json(await unidadeService.listarComGestores());
  },

  async associarGestor(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { gestor_id } = associarGestorSchema.parse(req.body ?? {});
    const autor = usuarioAutenticado(req);

    res.status(201).json(await unidadeService.associarGestor(id, gestor_id, autor.id));
  },

  async removerGestor(req: Request, res: Response): Promise<void> {
    const { id, gestorId } = gestorUnidadeParamSchema.parse(req.params);
    const autor = usuarioAutenticado(req);

    await unidadeService.removerGestor(id, gestorId, autor.id);
    res.status(204).send();
  },
};
