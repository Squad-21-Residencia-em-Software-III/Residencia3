import type { Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { usuarioAutenticado } from '../middlewares/autenticar';
import { excecaoOdometroService } from '../services/excecaoOdometroService';
import { configuracaoOdometro, evidenciaOdometroService } from '../services/evidenciaOdometroService';
import { idParamSchema } from '../validators/comuns';
import {
  arquivoEvidenciaSchema,
  consultarEvidenciasSchema,
  decidirExcecaoSchema,
  listarExcecoesSchema,
  solicitarExcecaoSchema,
  enviarEvidenciaSchema,
} from '../validators/evidenciaOdometroSchemas';

export const evidenciaOdometroController = {
  configuracao(_req: Request, res: Response): void {
    res.set('Cache-Control', 'no-store').json(configuracaoOdometro());
  },

  async listarExcecoes(req: Request, res: Response): Promise<void> {
    const { tipo_operacao, pagina } = listarExcecoesSchema.parse(req.query);
    res.set('Cache-Control', 'no-store').json(
      await excecaoOdometroService.listarPendentes(tipo_operacao, pagina, usuarioAutenticado(req))
    );
  },

  async solicitarExcecao(req: Request, res: Response): Promise<void> {
    const pedido = solicitarExcecaoSchema.parse(req.body);
    res.status(201).json(await excecaoOdometroService.solicitar(pedido, usuarioAutenticado(req)));
  },

  async decidirExcecao(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { tipo_operacao, decisao, justificativa } = decidirExcecaoSchema.parse(req.body);
    res.json(await excecaoOdometroService.decidir(id, tipo_operacao, decisao, justificativa, usuarioAutenticado(req)));
  },

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
    res.set('Cache-Control', 'no-store').json(await evidenciaOdometroService.consultar(tipo_operacao, viagem_id, usuarioAutenticado(req)));
  },

  async arquivo(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { download } = arquivoEvidenciaSchema.parse(req.query);
    const baixar = download === '1';
    const foto = await evidenciaOdometroService.arquivo(id, usuarioAutenticado(req), baixar);
    if (res.headersSent || res.destroyed) return;
    // Imagem de prova: nunca em cache (nem do navegador nem de proxy) e só pelo proxy autenticado
    res
      .set('Cache-Control', 'no-store')
      .set('CDN-Cache-Control', 'no-store')
      .set('Vercel-CDN-Cache-Control', 'no-store')
      .set('X-Content-Type-Options', 'nosniff')
      .set('Content-Type', foto.mimeType)
      .set('Content-Length', String(foto.conteudo.length))
      .set('Content-Disposition', `${baixar ? 'attachment' : 'inline'}; filename="${foto.nomeArquivo}"`)
      .end(foto.conteudo);
  },
};
