import type { RequestHandler } from 'express';
import { Router } from 'express';
import { PERFIS } from '../constants/perfis';
import { mapasController } from '../controllers/mapasController';
import { AppError } from '../errors/AppError';
import { autenticar } from '../middlewares/autenticar';
import { autorizar, exigirAssociacaoSvo } from '../middlewares/autorizar';
import { exigirRecursoFase3 } from '../middlewares/exigirRecursoFase3';
import { criarLimitador } from '../middlewares/limitarTentativasLogin';
import { MAXIMO_PARADAS_ADM } from '../validators/mapasSchemas';

export const LIMITE_MAPAS_POR_USUARIO_POR_MINUTO = 20;
const TAMANHO_MAXIMO_URL = 4096;
const permitirConsultaAdm = autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.SOLICITANTE, PERFIS.GESTOR_SVO);
const permitirRotaAdm = autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA);
const permitirSvo = autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO);
const habilitarAdm = exigirRecursoFase3('mapasInternos');
const habilitarSvo = exigirRecursoFase3('mapasSvo');
const habilitarParadasAdm = exigirRecursoFase3('multiplasParadas');

const autorizarMapas = (rota: boolean): RequestHandler => async (req, res, next) => {
  const operacao = req.query.operacao ?? 'ADM';
  if (operacao !== 'ADM' && operacao !== 'SVO') {
    throw new AppError('Operação de mapa inválida.', 400, 'MAPAS_PARAMETROS_INVALIDOS');
  }

  if (operacao === 'SVO') {
    permitirSvo(req, res, () => {});
    await exigirAssociacaoSvo(req, res, () => {});
    habilitarSvo(req, res, next);
    return;
  }

  (rota ? permitirRotaAdm : permitirConsultaAdm)(req, res, () => {});
  habilitarAdm(req, res, () => {
    if (rota && Array.isArray(req.query.pontos) && req.query.pontos.length > 2 &&
      req.query.pontos.length <= MAXIMO_PARADAS_ADM + 2) {
      habilitarParadasAdm(req, res, next);
      return;
    }
    next();
  });
};

export const mapasRoutes = Router();
mapasRoutes.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  if (Buffer.byteLength(req.originalUrl) > TAMANHO_MAXIMO_URL) {
    res.status(414).json({ erro: 'Consulta de mapa excede o limite de tamanho.', codigo: 'MAPAS_URL_LONGA' });
    return;
  }
  next();
});
mapasRoutes.use(autenticar);
mapasRoutes.use(criarLimitador({
  mensagem: 'Muitas consultas a mapas. Aguarde um minuto e tente novamente.',
  janelaMs: 60000, limite: LIMITE_MAPAS_POR_USUARIO_POR_MINUTO,
  chave: (req) => 'usuario:' + req.usuario!.id,
}));
mapasRoutes.get('/buscar', autorizarMapas(false), mapasController.buscar);
mapasRoutes.get('/reverso', autorizarMapas(false), mapasController.reverso);
mapasRoutes.get('/rota', autorizarMapas(true), mapasController.rota);
