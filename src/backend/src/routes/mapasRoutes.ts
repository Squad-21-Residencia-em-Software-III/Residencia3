import type { RequestHandler } from 'express';
import { Router } from 'express';
import { PERFIS, PERFIS_SOLICITANTES } from '../constants/perfis';
import { mapasController } from '../controllers/mapasController';
import { AppError } from '../errors/AppError';
import { autenticar } from '../middlewares/autenticar';
import { autorizar, exigirAssociacaoSvo } from '../middlewares/autorizar';
import { exigirRecursoFase3 } from '../middlewares/exigirRecursoFase3';
import { criarLimitador } from '../middlewares/limitarTentativasLogin';
import { MAXIMO_PARADAS_ADM } from '../validators/mapasSchemas';

export const LIMITE_MAPAS_POR_USUARIO_POR_MINUTO = 20;
const TAMANHO_MAXIMO_URL = 4096;
const permitirAdm = autorizar(...PERFIS_SOLICITANTES);
const permitirSvo = autorizar(PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO);
const habilitarAdm = exigirRecursoFase3('mapasInternos');
const habilitarSvo = exigirRecursoFase3('mapasSvo');
const habilitarParadasAdm = exigirRecursoFase3('multiplasParadas');

const selecionarSvo: RequestHandler = (req, _res, next) => {
  const operacao = req.query.operacao ?? 'ADM';
  if (operacao !== 'ADM' && operacao !== 'SVO') {
    throw new AppError('Operação de mapa inválida.', 400, 'MAPAS_PARAMETROS_INVALIDOS');
  }
  if (operacao === 'ADM') {
    next('route');
    return;
  }
  next();
};

const selecionarRotaComParadas: RequestHandler = (req, _res, next) => {
  const { pontos } = req.query;
  if (Array.isArray(pontos) && pontos.length > 2 && pontos.length <= MAXIMO_PARADAS_ADM + 2) {
    next();
    return;
  }
  next('route');
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
for (const caminho of ['buscar', 'reverso', 'rota'] as const) {
  const handler = mapasController[caminho];
  mapasRoutes.get('/' + caminho, selecionarSvo, permitirSvo, exigirAssociacaoSvo, habilitarSvo, handler);
  if (caminho === 'rota') {
    mapasRoutes.get('/rota', selecionarRotaComParadas, permitirAdm, habilitarAdm, habilitarParadasAdm, handler);
  }
  mapasRoutes.get('/' + caminho, permitirAdm, habilitarAdm, handler);
}
