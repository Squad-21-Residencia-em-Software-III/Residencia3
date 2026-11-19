import type { NextFunction, Request, Response } from 'express';
import { PERFIS, type Perfil } from '../constants/perfis';
import { UNIDADES } from '../constants/unidades';
import { AppError } from '../errors/AppError';
import { unidadeModel } from '../models/unidadeModel';
import { usuarioAutenticado } from './autenticar';

export function autorizar(...perfisPermitidos: Perfil[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!perfisPermitidos.includes(usuarioAutenticado(req).perfil)) {
      throw new AppError('Você não tem permissão para acessar este recurso', 403);
    }
    next();
  };
}

// Complementa o autorizar (docs/matriz-de-acesso.md): o perfil Gestor SVO só opera o SVO
// quando está associado à unidade SVO. Os demais perfis não são afetados.
export async function exigirAssociacaoSvo(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const usuario = usuarioAutenticado(req);
  if (usuario.perfil === PERFIS.GESTOR_SVO && !(await unidadeModel.estaAssociadoPorNome(UNIDADES.SVO, usuario.id))) {
    throw new AppError('Você não está associado à unidade SVO', 403);
  }
  next();
}
