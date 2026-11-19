import { Router } from 'express';
import { env } from '../config/env';
import { segredoConfere } from '../middlewares/identificarCliente';

export const diagnosticoRoutes = Router();

diagnosticoRoutes.get('/ip', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!env.diagnosticoProxyToken) {
    next();
    return;
  }
  if (!segredoConfere(req.headers['x-diagnostico-token'], env.diagnosticoProxyToken)) {
    res.status(401).json({ erro: 'Token de diagnóstico inválido' });
    return;
  }

  res.json({
    clienteIdentificado: req.ip ?? null,
    caminho: res.locals.caminhoDeAcesso,
  });
});
