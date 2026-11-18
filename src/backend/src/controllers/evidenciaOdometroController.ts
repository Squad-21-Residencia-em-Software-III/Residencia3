import type { Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { evidenciaOdometroService } from '../services/evidenciaOdometroService';
import { idParamSchema } from '../validators/comuns';
import {
  arquivoEvidenciaSchema,
  consultarEvidenciasSchema,
  enviarEvidenciaSchema,
} from '../validators/evidenciaOdometroSchemas';

export const evidenciaOdometroController = {
  async enviar(req: Request, res: Response): Promise<void> {
    const dados = enviarEvidenciaSchema.parse(req.body ?? {});
    if (!req.file) {
      throw new AppError('Envie a foto do odômetro no campo "arquivo"', 400);
    }
    const evidencia = await evidenciaOdometroService.enviar(dados, req.file.buffer, usuarioAutenticado(req));
    res.status(201).json(evidencia);
  },

  async consultar(req: Request, res: Response): Promise<void> {
    const { tipo_operacao, viagem_id } = consultarEvidenciasSchema.parse(req.query);
    res.json(await evidenciaOdometroService.consultar(tipo_operacao, viagem_id, usuarioAutenticado(req)));
  },

  async arquivo(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { download } = arquivoEvidenciaSchema.parse(req.query);
    const baixar = download === '1';
    const foto = await evidenciaOdometroService.arquivo(id, usuarioAutenticado(req), baixar);
    // Imagem de prova: nunca em cache (nem do navegador nem de proxy) e só pelo proxy autenticado
    res
      .set('Cache-Control', 'no-store')
      .set('Content-Type', foto.mimeType)
      .set('Content-Length', String(foto.conteudo.length))
      .set('Content-Disposition', `${baixar ? 'attachment' : 'inline'}; filename="${foto.nomeArquivo}"`)
      .send(foto.conteudo);
  },
};
