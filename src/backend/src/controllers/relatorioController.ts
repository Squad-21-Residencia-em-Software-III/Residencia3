import type { Request, Response } from 'express';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { relatorioService } from '../services/relatorioService';
import { exportarRelatorioQuerySchema, tipoRelatorioParamSchema } from '../validators/relatorioSchemas';

export const relatorioController = {
  async listar(req: Request, res: Response): Promise<void> {
    res.json(relatorioService.listarDisponiveis(usuarioAutenticado(req)));
  },

  async exportar(req: Request, res: Response): Promise<void> {
    const { tipo } = tipoRelatorioParamSchema.parse(req.params);
    const { formato, ...periodo } = exportarRelatorioQuerySchema.parse(req.query);

    const arquivo = await relatorioService.exportar(tipo, formato, periodo, usuarioAutenticado(req));

    res.setHeader('Content-Type', arquivo.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo.nomeArquivo}"`);
    // Permite que o frontend (outra origem) leia o nome do arquivo ao baixar via fetch
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Cache-Control', 'no-store');
    res.send(arquivo.conteudo);
  },
};
