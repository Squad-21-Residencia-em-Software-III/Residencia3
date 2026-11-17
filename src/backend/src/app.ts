import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import express from 'express';
import { z } from 'zod';
import { env } from './config/env';
import { cabecalhosDeSeguranca, corsPorAmbiente } from './config/segurancaHttp';
import { errorHandler, rotaNaoEncontrada } from './middlewares/errorHandler';
import { limitarConcorrencia } from './middlewares/limitarConcorrencia';
import { limitarConsultasPesadas, limitarPorTipoDeOperacao } from './middlewares/limitarTentativasLogin';
import { limitarTempoRequisicao } from './middlewares/limitarTempoRequisicao';
import { routes } from './routes';

z.config(z.locales.pt());

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.trustProxy);

// Identificação única da requisição (X-Request-ID) e log padronizado
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  const inicio = Date.now();
  res.on('finish', () => {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        level: 'INFO',
        method: req.method,
        path: req.baseUrl + req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - inicio,
      })
    );
  });

  next();
});

app.use(cabecalhosDeSeguranca());
app.use(corsPorAmbiente());
app.use(limitarConcorrencia);
app.use(limitarTempoRequisicao);
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));

app.use('/api', limitarPorTipoDeOperacao);
app.use(['/api/dashboard', '/api/auditorias'], limitarConsultasPesadas);
app.use('/api', routes);

app.use(rotaNaoEncontrada);
app.use(errorHandler);