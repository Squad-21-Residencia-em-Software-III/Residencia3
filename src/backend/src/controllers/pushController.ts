import type { Request, Response } from 'express';
import { env, HOSTS_PUSH_PADRAO } from '../config/env';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { pushService } from '../services/pushService';
import {
  codigoCategoriaSchema,
  criarSchemasPush,
  endpointPushSchema,
  preferenciaPushSchema,
} from '../validators/pushSchemas';

export const pushController = {
  chavePublica(_req: Request, res: Response) {
    res.json(pushService.chavePublica());
  },

  async assinar(req: Request, res: Response) {
    const usuario = usuarioAutenticado(req);
    // Desligado, responde 503 antes de validar o corpo
    pushService.chavePublica();
    const dados = criarSchemasPush(env.webPush?.hostsPermitidos ?? HOSTS_PUSH_PADRAO).assinatura.parse(req.body ?? {});
    const { criada } = await pushService.assinar(usuario, dados, req.get('user-agent'));
    res.status(criada ? 201 : 204).end();
  },

  async situacao(req: Request, res: Response) {
    const { endpoint } = endpointPushSchema.parse(req.body ?? {});
    res.json(await pushService.situacao(usuarioAutenticado(req), endpoint));
  },

  async cancelar(req: Request, res: Response) {
    const { endpoint } = endpointPushSchema.parse(req.body ?? {});
    await pushService.cancelar(usuarioAutenticado(req), endpoint);
    res.status(204).end();
  },

  async preferencias(req: Request, res: Response) {
    res.json(await pushService.preferencias(usuarioAutenticado(req)));
  },

  async salvarPreferencia(req: Request, res: Response) {
    const { codigo } = codigoCategoriaSchema.parse(req.params);
    const { push } = preferenciaPushSchema.parse(req.body ?? {});
    res.json(await pushService.salvarPreferencia(usuarioAutenticado(req), codigo, push));
  },
};
