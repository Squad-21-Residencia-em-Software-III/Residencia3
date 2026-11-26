import type { Request, Response } from 'express';
import { env } from '../config/env';
import { configNotificacoes } from '../config/notificacoes';
import { pushService } from '../services/pushService';
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
  async obterAutorizada(req: Request, res: Response): Promise<void> {
    const { id } = notificacaoParamSchema.parse(req.params);
    res.json(await notificacaoService.obterAutorizada(usuarioAutenticado(req), id));
  },

  async badge(req: Request, res: Response): Promise<void> {
    if (!configNotificacoes.ativas || !env.webPush) {
      res.json({ elegiveis: 0 });
      return;
    }
    const autor = usuarioAutenticado(req);
    const { categorias } = await pushService.preferencias(autor);
    res.json(await notificacaoService.badge(autor, categorias.filter(({ push }) => push).map(({ codigo }) => codigo)));
  },

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
    const { ids } = lerTodasSchema.parse(req.body ?? {});
    res.json(await notificacaoService.marcarTodasLidas(usuarioAutenticado(req), ids));
  },

  async marcarReferenciaLida(req: Request, res: Response): Promise<void> {
    const { referencia_tipo, referencia_id } = lerReferenciaSchema.parse(req.body ?? {});
    res.json(await notificacaoService.marcarReferenciaLida(usuarioAutenticado(req), referencia_tipo, referencia_id));
  },
};
