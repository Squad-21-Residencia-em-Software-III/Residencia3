import { env } from './config/env';
import { app } from './app';

app.listen(env.port, () => {
  console.log(`Servidor rodando na porta ${env.port}`);
});
