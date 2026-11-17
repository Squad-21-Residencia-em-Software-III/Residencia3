import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { gestaoEquipesSvoService } from '../services/gestaoEquipesSvoService';
import { idParamSchema } from '../validators/comuns';
import { nomeEquipeSvoSchema } from '../validators/equipeSvoSchemas';

export const gestaoEquipesSvoController = {
  async listar(_req: Request, res: Response): Promise<void> {
    res.json(await gestaoEquipesSvoService.listar());
  },
  async buscar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    res.json(await gestaoEquipesSvoService.buscar(id));
  },
  async criar(req: Request, res: Response): Promise<void> {
    const { nome_equipe } = nomeEquipeSvoSchema.parse(req.body);
    const equipe = await gestaoEquipesSvoService.salvar(nome_equipe, usuarioAutenticado(req).id);
    res.status(201).location(`/api/equipes-svo/${equipe.id}`).json(equipe);
  },
  async atualizar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { nome_equipe } = nomeEquipeSvoSchema.parse(req.body);
    res.json(await gestaoEquipesSvoService.salvar(nome_equipe, usuarioAutenticado(req).id, id));
  },
};
