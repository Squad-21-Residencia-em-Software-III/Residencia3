import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import type { Usuario } from '../models/usuarioModel';
import { authService } from '../services/authService';

export async function autenticar(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // Formato exato "Bearer <token>"; o token é validado no authService e nunca registrado em log
  const partes = req.headers.authorization?.trim().split(' ') ?? [];
  const [esquema, token] = partes;
  if (partes.length !== 2 || esquema?.toLowerCase() !== 'bearer' || !token) {
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
