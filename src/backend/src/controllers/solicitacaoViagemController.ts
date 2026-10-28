
import type { Request, Response } from 'express';
import { solicitacaoViagemService } from '../services/solicitacaoViagemService';
import { criarSolicitacaoViagemSchema } from '../validators/solicitacaoViagemSchemas';
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
};
