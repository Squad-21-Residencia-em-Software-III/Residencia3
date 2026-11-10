import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { solicitacaoSvoService } from '../services/solicitacaoSvoService';
import { idParamSchema } from '../validators/comuns';
import { confirmarSolicitacaoSvoSchema, listarSolicitacoesSvoSchema } from '../validators/solicitacaoSvoSchemas';

export const solicitacaoSvoController = {
  async listar(req: Request, res: Response): Promise<void> {
    const filtros = listarSolicitacoesSvoSchema.parse(req.query);
    res.json(await solicitacaoSvoService.listar(filtros, usuarioAutenticado(req)));
  },
  async detalhar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    res.json(await solicitacaoSvoService.detalhar(id, usuarioAutenticado(req)));
  },
  async confirmar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    confirmarSolicitacaoSvoSchema.parse(req.body ?? {});
    const { criada, ...resultado } = await solicitacaoSvoService.confirmar(id, usuarioAutenticado(req));
    res.status(criada ? 201 : 200).json(resultado);
  },
};
