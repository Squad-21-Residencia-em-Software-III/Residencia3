import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import type { Usuario } from '../models/usuarioModel';
import { authService } from '../services/authService';

export async function autenticar(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const [esquema, token] = req.headers.authorization?.split(' ') ?? [];
  if (esquema !== 'Bearer' || !token) {
    throw new AppError('Token de autenticação não informado', 401);
  }

  req.usuario = await authService.usuarioDoToken(token);
  next();
}

export function usuarioAutenticado(req: Request): Usuario {
  if (!req.usuario) {
    throw new AppError('Usuário não autenticado', 401);
  }
  return req.usuario;
}
