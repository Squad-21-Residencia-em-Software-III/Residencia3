import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { errorHandler, rotaNaoEncontrada } from './middlewares/errorHandler';
import { routes } from './routes';

z.config(z.locales.pt());

export const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.use('/api', routes);

app.use(rotaNaoEncontrada);
app.use(errorHandler);
