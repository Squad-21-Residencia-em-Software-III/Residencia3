import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { notificacaoService } from '../services/notificacaoService';
import {
  lerReferenciaSchema,
  lerTodasSchema,
  listarNotificacoesSchema,
  notificacaoParamSchema,
} from '../validators/notificacaoSchemas';

// O usuário é sempre o da sessão: nenhum id de usuário enviado pelo cliente é lido
export const notificacaoController = {
  async listar(req: Request, res: Response): Promise<void> {
    const filtros = listarNotificacoesSchema.parse(req.query);
    res.json(await notificacaoService.listar(usuarioAutenticado(req), filtros));
  },

  async contador(req: Request, res: Response): Promise<void> {
    res.json(await notificacaoService.contador(usuarioAutenticado(req)));
  },

  async marcarLida(req: Request, res: Response): Promise<void> {
    const { id } = notificacaoParamSchema.parse(req.params);
    res.json(await notificacaoService.marcarLida(usuarioAutenticado(req), id));
  },

  async marcarTodasLidas(req: Request, res: Response): Promise<void> {
    const { ate_id } = lerTodasSchema.parse(req.body ?? {});
    res.json(await notificacaoService.marcarTodasLidas(usuarioAutenticado(req), ate_id));
  },

  async marcarReferenciaLida(req: Request, res: Response): Promise<void> {
    const { referencia_tipo, referencia_id } = lerReferenciaSchema.parse(req.body ?? {});
    res.json(await notificacaoService.marcarReferenciaLida(usuarioAutenticado(req), referencia_tipo, referencia_id));
  },
};
