
import type { Request, Response } from 'express';
import { solicitacaoViagemService } from '../services/solicitacaoViagemService';
import {
  criarSolicitacaoViagemSchema,
  listarSolicitacoesViagemSchema,
  recusarSolicitacaoViagemSchema,
} from '../validators/solicitacaoViagemSchemas';
import { idParamSchema } from '../validators/comuns';
import { usuarioAutenticado } from '../middlewares/autenticar';

export const solicitacaoViagemController = {
  async criar(req: Request, res: Response): Promise<void> {
    // Valida os dados recebidos
    const dados = criarSolicitacaoViagemSchema.parse(req.body);

    // Identifica o usuário autenticado
    const solicitante = usuarioAutenticado(req);

    // Cadastra a solicitação
    const solicitacao = await solicitacaoViagemService.criar(
      dados,
      solicitante.id
    );

    // Retorna a solicitação cadastrada
    res.status(201)
      .location(`/api/solicitacoes-viagem/${solicitacao.id}`)
      .json(solicitacao);
  },

  async listar(req: Request, res: Response): Promise<void> {
    const { status } = listarSolicitacoesViagemSchema.parse(req.query);
    const analista = usuarioAutenticado(req);

    res.json(await solicitacaoViagemService.listar(analista, status));
  },

  async aprovar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const gestor = usuarioAutenticado(req);

    res.json(await solicitacaoViagemService.aprovar(id, gestor));
  },

  async recusar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    // O corpo é opcional: o motivo pode ser omitido
    const { motivo } = recusarSolicitacaoViagemSchema.parse(req.body ?? {});
    const gestor = usuarioAutenticado(req);

    res.json(await solicitacaoViagemService.recusar(id, gestor, motivo));
  },
};
