import type { Request, Response } from 'express';
import { solicitacaoViagemService } from '../services/solicitacaoViagemService';
import {
  criarSolicitacaoViagemSchema,
  listarSolicitacoesViagemSchema,
  recusarSolicitacaoViagemSchema,
} from '../validators/solicitacaoViagemSchemas';
import { idParamSchema } from '../validators/comuns';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { PERFIS } from '../constants/perfis';

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
    const filtros = listarSolicitacoesViagemSchema.parse(req.query);
    const analista = usuarioAutenticado(req);

    res.json(await solicitacaoViagemService.listar(analista, filtros));
  },

  async listarMinhas(req: Request, res: Response): Promise<void> {
    const filtros = listarSolicitacoesViagemSchema.parse(req.query);
    const solicitante = usuarioAutenticado(req);

    const resultado = await solicitacaoViagemService.listarMinhas(solicitante.id, filtros);
    if (solicitante.perfil === PERFIS.GESTOR_SVO) {
      // A consulta própria não autoriza a divulgação de dados pessoais do motorista.
      res.json({
        ...resultado,
        dados: resultado.dados.map((s) => ({
          id: s.id,
          solicitante_id: s.solicitante_id,
          unidade_id: s.unidade_id,
          unidade_nome: s.unidade_nome,
          origem: s.origem,
          destino: s.destino,
          finalidade: s.finalidade,
          data_saida_desejada: s.data_saida_desejada,
          data_chegada_desejada: s.data_chegada_desejada,
          status: s.status,
          motivo_recusa: s.motivo_recusa,
          viagem_id: s.viagem_id,
          viagem_status: s.viagem_status,
          veiculo_placa: s.veiculo_placa,
          veiculo_modelo: s.veiculo_modelo,
        })),
      });
      return;
    }
    res.json(resultado);
  },

  async aprovar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const gestor = usuarioAutenticado(req);

    res.json(await solicitacaoViagemService.aprovar(id, gestor));
  },

  async recusar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { motivo } = recusarSolicitacaoViagemSchema.parse(req.body ?? {});
    const gestor = usuarioAutenticado(req);

    res.json(await solicitacaoViagemService.recusar(id, gestor, motivo));
  },
};
