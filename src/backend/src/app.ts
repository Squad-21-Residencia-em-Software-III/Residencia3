import cookieParser from 'cookie-parser';
import express from 'express';
import { z } from 'zod';
import { env } from './config/env';
import { cabecalhosDeSeguranca, corsPorAmbiente } from './config/segurancaHttp';
import { errorHandler, rotaNaoEncontrada } from './middlewares/errorHandler';
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
// Rotas públicas do portal SVO: nunca em cache, inclusive nos erros antecipados (JSON inválido, 413, 429, 503, 404)
app.use(['/api/solicitacoes-svo/externas', '/api/portal-svo/mapas'], (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});
// Proteção contra excesso (docs/limites-e-timeouts.md): concorrência e tempo limite por requisição
app.use(limitarConcorrencia);
// O envio da foto do odômetro tem tempo próprio, maior (ver evidenciaOdometroRoutes)
app.use((req, res, next) => (ehEnvioDeFotoOdometro(req) ? next() : limitarTempoRequisicao(req, res, next)));
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));

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
