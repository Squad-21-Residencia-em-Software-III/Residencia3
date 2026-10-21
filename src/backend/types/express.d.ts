import type { Usuario } from '../models/usuarioModel';

declare global {
  namespace Express {
    interface Request {
      usuario?: Usuario;
    }
  }
}

export {};
