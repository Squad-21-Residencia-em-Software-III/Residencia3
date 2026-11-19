import type { Request, Response } from 'express';
import { z } from 'zod';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { integrantesSvoService } from '../services/integrantesSvoService';
import { idParamSchema } from '../validators/comuns';
import { criarIntegranteSvoSchema, atualizarIntegranteSvoSchema } from '../validators/usuarioSchemas';
import { consultarDisponibilidadeEquipesQuerySchema } from '../validators/equipeSvoSchemas';

const vinculoSchema = z.object({ id: z.coerce.number().int().positive(), usuarioId: z.coerce.number().int().positive() });
export const integrantesSvoController = {
  async disponibilidade(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const p = consultarDisponibilidadeEquipesQuerySchema.parse(req.query);
    res.json(await integrantesSvoService.disponibilidade(id, new Date(p.inicio), new Date(p.fim), p.ignorar_ordem_id));
  },
  async atualizar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    res.json(await integrantesSvoService.atualizar(id, atualizarIntegranteSvoSchema.parse(req.body), usuarioAutenticado(req).id));
  },
  async criar(req: Request, res: Response): Promise<void> {
    res.status(201).json(await integrantesSvoService.criar(criarIntegranteSvoSchema.parse(req.body), usuarioAutenticado(req).id));
  },
  async listar(_req: Request, res: Response): Promise<void> { res.json(await integrantesSvoService.listar()); },
  async listarEquipe(req: Request, res: Response): Promise<void> {
    res.json(await integrantesSvoService.listarEquipe(idParamSchema.parse(req.params).id));
  },
  async vincular(req: Request, res: Response): Promise<void> {
    const { id, usuarioId } = vinculoSchema.parse(req.params);
    await integrantesSvoService.vincular(id, usuarioId, usuarioAutenticado(req).id); res.status(204).send();
  },
  async desvincular(req: Request, res: Response): Promise<void> {
    const { id, usuarioId } = vinculoSchema.parse(req.params);
    await integrantesSvoService.desvincular(id, usuarioId, usuarioAutenticado(req).id); res.status(204).send();
  },
};
