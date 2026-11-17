import { env } from './config/env';
import { app } from './app';
import { configurarServidor } from './config/servidor';

const servidor = app.listen(env.port, () => {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', evento: 'SERVIDOR_INICIADO', port: env.port }));
});

configurarServidor(servidor);
