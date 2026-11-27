import { Router, type RequestHandler } from 'express';
import { solicitacaoSvoExternaController } from '../controllers/solicitacaoSvoExternaController';
import { exigirRecursoAtivo } from '../middlewares/exigirRecursoAtivo';

const semCache: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
};

export const solicitacaoSvoExternaRoutes = Router();

// Rota pública do portal (SCRUM-264). Montada em routes/index.ts ANTES de /solicitacoes-svo, para não
// passar pelos guards do roteador interno e sem afrouxá-los. A flag vale só para esta rota:
// as demais rotas de /externas (ex.: acompanhamento da SCRUM-266) têm flag própria.
solicitacaoSvoExternaRoutes.post('/', semCache, exigirRecursoAtivo('portalSvo'), solicitacaoSvoExternaController.criar);
