import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { viagemService } from '../services/viagemService';
import { idParamSchema } from '../validators/comuns';
import {
  cancelarViagemSchema,
  criarViagemSchema,
  finalizarViagemSchema,
  iniciarViagemSchema,
} from '../validators/viagemSchemas';

export const viagemController = {
  async listar(req: Request, res: Response): Promise<void> {
  const autor = usuarioAutenticado(req);
  res.json(await viagemService.listar(autor));
  },

  async criar(req: Request, res: Response): Promise<void> {
    const dados = criarViagemSchema.parse(req.body);
    const autor = usuarioAutenticado(req);

    const viagem = await viagemService.criar(dados, autor);
    res.status(dados.tipo_operacao === 'SVO' ? 200 : 201).json(viagem);
  },

  async iniciar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { tipo_operacao, km_inicial } = iniciarViagemSchema.parse(req.body);
    const autor = usuarioAutenticado(req);

    res.json(await viagemService.iniciarViagem(tipo_operacao, id, km_inicial, autor));
  },

  async finalizar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { tipo_operacao, km_final } = finalizarViagemSchema.parse(req.body);
    const autor = usuarioAutenticado(req);

    res.json(await viagemService.finalizarViagem(tipo_operacao, id, km_final, autor));
  },

  async cancelar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    // O corpo é opcional: sem ele, a viagem é tratada como administrativa
    const { tipo_operacao, cancelar_solicitacao } = cancelarViagemSchema.parse(req.body ?? {});
    const autor = usuarioAutenticado(req);

    res.json(await viagemService.cancelarViagem(tipo_operacao, id, autor, cancelar_solicitacao));
  },
};
