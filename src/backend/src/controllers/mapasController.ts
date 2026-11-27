import type { Request, Response } from 'express';
import { env } from '../config/env';
import { criarMapasService } from '../services/mapasService';
import {
  buscarMapaSchema, reversoMapaSchema, rotaMapaSchema, validarConsultaMapa,
} from '../validators/mapasSchemas';

const service = criarMapasService(env.mapas);

async function responderMapa<T>(
  res: Response, consultar: (contexto: { sinal: AbortSignal; prazoMs: number }) => Promise<T>,
): Promise<void> {
  if (res.headersSent || res.destroyed) return;
  const controle = new AbortController();
  const abortar = () => controle.abort();
  res.once('close', abortar);
  res.once('finish', abortar);
  const prazoGlobal = res.locals.prazoRequisicaoMs as number | undefined;
  const prazoMs = prazoGlobal === undefined ? env.mapas.orcamentoMs : Math.max(0, prazoGlobal - Date.now() - 500);
  try {
    const resultado = await consultar({ sinal: controle.signal, prazoMs });
    if (!controle.signal.aborted) res.json(resultado);
  } catch (erro) {
    if (!controle.signal.aborted) throw erro;
  } finally {
    res.off('close', abortar);
    res.off('finish', abortar);
  }
}

export const mapasController = {
  buscar: (req: Request, res: Response) =>
    responderMapa(res, (contexto) => service.buscar(validarConsultaMapa(buscarMapaSchema, req.query), contexto)),
  reverso: (req: Request, res: Response) =>
    responderMapa(res, (contexto) => service.reverso(validarConsultaMapa(reversoMapaSchema, req.query), contexto)),
  rota: (req: Request, res: Response) =>
    responderMapa(res, (contexto) => service.rota(validarConsultaMapa(rotaMapaSchema, req.query), contexto)),
};
