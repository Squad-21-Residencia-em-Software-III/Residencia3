import { Router } from 'express';
import { exigirRecursoAtivo } from '../middlewares/exigirRecursoAtivo';
import { mapasController } from '../controllers/mapasController';
import { protegerTrabalhoPortalSvo } from '../middlewares/protegerPortalSvo';

export const portalSvoMapasRoutes = Router();
portalSvoMapasRoutes.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});
portalSvoMapasRoutes.use(exigirRecursoAtivo('portalSvo'), exigirRecursoAtivo('mapasSvo'));

portalSvoMapasRoutes.use((req, res, next) => {
  if (Buffer.byteLength(req.originalUrl) > 512) {
    res.status(414).json({ erro: 'Consulta de mapa excede o limite de tamanho.', codigo: 'MAPAS_URL_LONGA' });
    return;
  }
  next();
});

portalSvoMapasRoutes.get('/buscar', protegerTrabalhoPortalSvo('geocodificar', mapasController.buscarCepPublico));
portalSvoMapasRoutes.get('/reverso', protegerTrabalhoPortalSvo('geocodificar', mapasController.reversoPublico));
