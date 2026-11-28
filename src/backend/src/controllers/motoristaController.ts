import type { Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { motoristaService } from '../services/motoristaService';
import { atualizarMotoristaSchema, criarMotoristaSchema, listarMotoristasSchema } from '../validators/motoristaSchemas';

const MAIOR_ID = 2_147_483_647;

function idDaRota(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0 || id > MAIOR_ID) {
    throw new AppError('ID do motorista inválido', 400);
  }
  return id;
}

export const motoristaController = {
  async listar(req: Request, res: Response): Promise<void> {
    const filtros = listarMotoristasSchema.parse(req.query);
    res.json(await motoristaService.listar(filtros));
  },

  async me(req: Request, res: Response): Promise<void> {
    const usuario = usuarioAutenticado(req);
    const motorista = await motoristaService.buscarPorUsuarioId(usuario.id);
    if (!motorista) {
      throw new AppError('Registro de motorista não encontrado para o usuário logado', 404);
    }
    res.json(motorista);
  },

  async listarUsuariosElegiveis(req: Request, res: Response): Promise<void> {
    res.json(await motoristaService.listarUsuariosElegiveis(usuarioAutenticado(req)));
  },

  async buscar(req: Request, res: Response): Promise<void> {
    const id = idDaRota(req);
    res.set('Cache-Control', 'no-store');
    res.json(await motoristaService.buscarDetalhe(id, usuarioAutenticado(req)));
  },

  async criar(req: Request, res: Response): Promise<void> {
    const dados = criarMotoristaSchema.parse(req.body);
    const motorista = await motoristaService.criar(dados, usuarioAutenticado(req));
    res.status(201).location(`/api/motoristas/${motorista.id}`).set('Cache-Control', 'no-store').json(motorista);
  },

  async atualizar(req: Request, res: Response): Promise<void> {
    const id = idDaRota(req);
    const dados = atualizarMotoristaSchema.parse(req.body);
    res.set('Cache-Control', 'no-store');
    res.json(await motoristaService.atualizar(id, dados, usuarioAutenticado(req)));
  },
};
