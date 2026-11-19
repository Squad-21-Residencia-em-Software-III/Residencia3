import { db } from '../config/database';
import { env } from '../config/env';
import { processarRetencaoEvidencias } from '../services/retencaoEvidencias';

async function executar(): Promise<void> {
  const argumentos = process.argv.slice(2);
  if (argumentos.some((arg) => arg !== '--aplicar' && !/^--limite=\d+$/.test(arg))) {
    throw new Error('Argumentos esperados: --aplicar, --limite=<1 a 100>');
  }
  if (env.evidenciasStorage !== 'postgres') throw new Error('O expurgo exige EVIDENCIAS_STORAGE=postgres');
  const aplicar = argumentos.includes('--aplicar');
  const limite = Number(argumentos.find((arg) => arg.startsWith('--limite='))?.split('=')[1] ?? 25);
  const resultado = await processarRetencaoEvidencias(db, { aplicar, limite });
  console.info(JSON.stringify({ evento: 'retencao_odometro', aplicar, ...resultado }));
  if (resultado.falhas > 0) process.exitCode = 1;
}

executar().catch(() => {
  console.error('Falha ao executar a rotina de retenção de evidências. Confira a configuração e a conexão.');
  process.exitCode = 1;
}).finally(() => db.destroy());
