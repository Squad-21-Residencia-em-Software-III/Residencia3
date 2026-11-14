import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { env } from './config/env';
import { errorHandler, rotaNaoEncontrada } from './middlewares/errorHandler';
import { routes } from './routes';

z.config(z.locales.pt());

export const app = express();

app.disable('x-powered-by');
// Proxies reversos confiáveis à frente da API: define req.ip (rate limit) e req.protocol
app.set('trust proxy', env.trustProxy);
// Somente as origens listadas em CORS_ORIGIN, nunca "*", pois as rotas de sessão usam cookie
app.use(cors({ origin: env.corsOrigens, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));

app.use('/api', routes);

app.use(rotaNaoEncontrada);
app.use(errorHandler);
