import cookieParser from 'cookie-parser';
import express, { type RequestHandler } from 'express';
import { z } from 'zod';
import { env } from './config/env';
import { cabecalhosDeSeguranca, corsPorAmbiente } from './config/segurancaHttp';
import { errorHandler, rotaNaoEncontrada } from './middlewares/errorHandler';
import { exigirRecursoFase3 } from './middlewares/exigirRecursoFase3';
import { protegerPortalSvo, verificarHoneypotPortalSvo } from './middlewares/protegerPortalSvo';
import { identificarCliente } from './middlewares/identificarCliente';
import { logRequisicao } from './middlewares/logRequisicao';
import { limitarConcorrencia } from './middlewares/limitarConcorrencia';
import { limitarConsultasPesadas, limitarPorTipoDeOperacao } from './middlewares/limitarTentativasLogin';
import { limitarTempoRequisicao } from './middlewares/limitarTempoRequisicao';
import { ehEnvioDeFotoOdometro } from './routes/evidenciaOdometroRoutes';
import { routes } from './routes';
import { acordarFilaPushDeCarona } from './services/filaPush';

z.config(z.locales.pt());

export const app = express();

app.disable('x-powered-by');
// Somente os proxies do caminho direto, declarados em TRUST_PROXY: define req.ip e req.protocol
app.set('trust proxy', env.trustProxy);
// IP real do cliente nos dois caminhos (direto e via Vercel), usado pelos limites de requisição
app.use(identificarCliente);
app.use(logRequisicao);
// Antes das rotas, para valer também nas respostas de erro e no 404
app.use(cabecalhosDeSeguranca());
app.use(corsPorAmbiente());
// Proteção contra excesso (docs/limites-e-timeouts.md): concorrência e tempo limite por requisição
app.use(limitarConcorrencia);
// O envio da foto do odômetro tem tempo próprio, maior (ver evidenciaOdometroRoutes)
app.use((req, res, next) => (ehEnvioDeFotoOdometro(req) ? next() : limitarTempoRequisicao(req, res, next)));
app.use(cookieParser());
const criacaoExternaSvo = '/api/solicitacoes-svo/externas';
const semCachePortalSvo: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
};
app.post(criacaoExternaSvo, semCachePortalSvo, exigirRecursoFase3('portalSvo'), protegerPortalSvo('cadastrar'));
// SCRUM-266 mantém a própria validação uniforme e a cota por IP de falhas.
const acompanharSvo = criacaoExternaSvo + '/acompanhamento';
const protegerAcompanhamentoSvo = [
  semCachePortalSvo, exigirRecursoFase3('acompanhamentoExterno'), protegerPortalSvo('acompanhar'),
];
app.post(acompanharSvo, ...protegerAcompanhamentoSvo);
app.get(acompanharSvo + '/:protocolo', ...protegerAcompanhamentoSvo);
app.use(express.json({ limit: '100kb' }));
app.post(criacaoExternaSvo, verificarHoneypotPortalSvo);

// Limites por tipo de operação: leitura e escrita por minuto, e consultas pesadas com limite menor
app.use('/api', limitarPorTipoDeOperacao);
app.use(['/api/dashboard', '/api/auditorias'], limitarConsultasPesadas);
app.use('/api', (_req, _res, next) => {
  acordarFilaPushDeCarona();
  next();
});
app.use('/api', routes);

app.use(rotaNaoEncontrada);
app.use(errorHandler);
