import { env } from './config/env';
import { app } from './app';
import { configurarServidor } from './config/servidor';

const servidor = app.listen(env.port, () => {
  console.log(`Servidor rodando na porta ${env.port}`);
});

configurarServidor(servidor);
