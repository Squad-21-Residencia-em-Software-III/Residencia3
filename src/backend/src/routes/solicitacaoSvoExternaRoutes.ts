import { Router, type RequestHandler } from 'express';
import { solicitacaoSvoExternaController } from '../controllers/solicitacaoSvoExternaController';
import { AppError } from '../errors/AppError';
import { exigirRecursoAtivo } from '../middlewares/exigirRecursoAtivo';

// Nada trafega na URL: dado pessoal ou credencial em query string vai parar em log, proxy e histórico
const rejeitarQueryString: RequestHandler = (req, _res, next) => {
  if (Object.keys(req.query).length > 0) {
    throw new AppError('Esta rota não aceita parâmetros na URL.', 400, 'PARAMETROS_NA_URL_NAO_PERMITIDOS');
  }
  next();
};

export const solicitacaoSvoExternaRoutes = Router();

// Rota pública do portal (SCRUM-264). Montada em routes/index.ts ANTES de /solicitacoes-svo, para não
// passar pelos guards do roteador interno e sem afrouxá-los. A flag vale só para esta rota:
// as demais rotas de /externas (ex.: acompanhamento da SCRUM-266) têm flag própria.
// O Cache-Control: no-store vem do app (app.ts), para valer também nos erros antecipados.
// Integração futura (SCRUM-271): protegerPortalSvo('cadastrar') e verificarHoneypotPortalSvo entram nesta
// cadeia, depois da flag e antes do controller (o honeypot website_hp sai do corpo antes do strictObject).
solicitacaoSvoExternaRoutes.post('/', exigirRecursoAtivo('portalSvo'), rejeitarQueryString, solicitacaoSvoExternaController.criar);
