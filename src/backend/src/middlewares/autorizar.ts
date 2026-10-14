import type { NextFunction, Request, Response } from 'express';
import type { Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { usuarioAutenticado } from './autenticar';

export function autorizar(...perfisPermitidos: Perfil[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!perfisPermitidos.includes(usuarioAutenticado(req).perfil)) {
      throw new AppError('Você não tem permissão para acessar este recurso', 403);
    }
    next();
  };
}
