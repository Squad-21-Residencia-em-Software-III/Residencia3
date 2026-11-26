import { db } from './config/database';
import { env } from './config/env';
import { app } from './app';
import { configurarServidor } from './config/servidor';
import { criarEnviadorWebPush } from './services/enviadorWebPush';
import { definirEnviadorPush } from './services/filaPush';

async function iniciar() {
  if (env.evidenciasStorage !== 'desativado') {
    const tabelas = ['evidencias_odometro', 'deslocamentos_svo', 'deslocamentos_svo_ordens'];
    if (env.evidenciasStorage === 'postgres') tabelas.push('evidencias_odometro_arquivos');
    if (env.excecoesOdometroAtivas) tabelas.push('excecoes_odometro');
    const existentes = await Promise.all(tabelas.map((tabela) => db.schema.hasTable(tabela)));
    if (existentes.some((existe) => !existe)) throw new Error('Schema do odômetro incompleto');
  }

  // Liga a fila de push (SCRUM-229) e retoma o que ficou pendente. Sem VAPID, os avisos ficam só no sistema
  if (env.webPush) definirEnviadorPush(criarEnviadorWebPush(env.webPush));
  else console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', evento: 'PUSH_DESLIGADO' }));

  const servidor = app.listen(env.port, () => {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', evento: 'SERVIDOR_INICIADO', port: env.port }));
  });
  configurarServidor(servidor);
}

void iniciar().catch(async () => {
  console.error('Não foi possível iniciar a API. Confira conexão e migrations do odômetro.');
  process.exitCode = 1;
  await db.destroy();
});
