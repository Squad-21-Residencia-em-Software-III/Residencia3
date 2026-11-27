import { Router } from 'express';
import { env } from '../config/env';
import { mapasController } from '../controllers/mapasController';
import { protegerPortalSvo } from '../middlewares/protegerPortalSvo';

export const portalSvoMapasRoutes = Router();
const limitarGeocodificacao = protegerPortalSvo('geocodificar');

portalSvoMapasRoutes.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  if (!env.fase3.flags.portalSvo || !env.fase3.flags.mapasSvo) {
    res.status(404).json({ erro: 'Rota não encontrada', codigo: 'RECURSO_DESATIVADO' });
    return;
  }
  next();
});

portalSvoMapasRoutes.use((req, res, next) => {
  if (Buffer.byteLength(req.originalUrl) > 512) {
    res.status(414).json({ erro: 'Consulta de mapa excede o limite de tamanho.', codigo: 'MAPAS_URL_LONGA' });
    return;
  }
  next();
});

portalSvoMapasRoutes.get('/buscar', limitarGeocodificacao, mapasController.buscarCepPublico);
portalSvoMapasRoutes.get('/reverso', limitarGeocodificacao, mapasController.reversoPublico);
