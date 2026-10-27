import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { manutencaoService } from '../services/manutencaoService';
import { idParamSchema } from '../validators/comuns';
import { criarManutencaoSchema } from '../validators/manutencaoSchemas';

export const manutencaoController = {
  async criar(req: Request, res: Response): Promise<void> {
    const dados = criarManutencaoSchema.parse(req.body);
    const autor = usuarioAutenticado(req);
    const manutencao = await manutencaoService.criar(dados, autor.id);

    res.status(201).location(`/api/manutencoes/${manutencao.id}`).json(manutencao);
  },

  async listarPorVeiculo(req: Request, res: Response): Promise<void> {
    const { id: veiculoId } = idParamSchema.parse({ id: req.params.veiculoId });

    res.json(await manutencaoService.listarPorVeiculo(veiculoId));
  },
};
