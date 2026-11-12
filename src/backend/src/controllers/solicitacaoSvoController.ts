import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { solicitacaoSvoService } from '../services/solicitacaoSvoService';
import { idParamSchema } from '../validators/comuns';
import {
  criarSolicitacaoSvoSchema,
  listarSolicitacoesSvoQuerySchema,
} from '../validators/solicitacaoSvoSchemas';

export const solicitacaoSvoController = {
  async registrar(req: Request, res: Response): Promise<void> {
    const dados = criarSolicitacaoSvoSchema.parse(req.body ?? {});
    const registrante = usuarioAutenticado(req);

    const solicitacao = await solicitacaoSvoService.registrar(dados, registrante.id);

    res.status(201).location(`/api/solicitacoes-svo/${solicitacao.id}`).json(solicitacao);
  },

  async listar(req: Request, res: Response): Promise<void> {
    const filtros = listarSolicitacoesSvoQuerySchema.parse(req.query);
    res.json(await solicitacaoSvoService.listar(filtros));
  },

  async buscarPorId(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    res.json(await solicitacaoSvoService.buscarPorId(id));
  },
};
