import type { Request, Response } from 'express';
import { documentoService } from '../services/documentoService';

export const documentoController = {
  async listarVencimentos(_req: Request, res: Response): Promise<void> {
    const documentos = await documentoService.listarVencimentos();

    res.json(documentos);
  },
};