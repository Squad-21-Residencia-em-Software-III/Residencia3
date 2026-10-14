import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { usuarioService } from '../services/usuarioService';
import { idParamSchema } from '../validators/comuns';
import {
  atualizarUsuarioSchema,
  criarUsuarioSchema,
  listarUsuariosSchema,
  redefinirSenhaSchema,
} from '../validators/usuarioSchemas';

export const usuarioController = {
  listarPerfis(_req: Request, res: Response): void {
    res.json(usuarioService.listarPerfis());
  },

  async listar(req: Request, res: Response): Promise<void> {
    const filtros = listarUsuariosSchema.parse(req.query);
    res.json(await usuarioService.listar(filtros));
  },

  async buscarPorId(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    res.json(await usuarioService.buscarPorId(id));
  },

  async criar(req: Request, res: Response): Promise<void> {
    const dados = criarUsuarioSchema.parse(req.body);
    const usuario = await usuarioService.criar(dados, usuarioAutenticado(req).id);
    res.status(201).location(`/api/usuarios/${usuario.id}`).json(usuario);
  },

  async atualizar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const dados = atualizarUsuarioSchema.parse(req.body);
    res.json(await usuarioService.atualizar(id, dados, usuarioAutenticado(req).id));
  },

  async redefinirSenha(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { senha } = redefinirSenhaSchema.parse(req.body);
    await usuarioService.redefinirSenha(id, senha, usuarioAutenticado(req).id);
    res.status(204).send();
  },
};
