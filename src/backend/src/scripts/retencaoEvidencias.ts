import { db } from '../config/database';
import { env } from '../config/env';
import { processarRetencaoEvidencias } from '../services/retencaoEvidencias';

async function executar(): Promise<void> {
  const argumentos = process.argv.slice(2);
  if (argumentos.some((arg) => arg !== '--aplicar' && !/^--(limite|lotes)=\d+$/.test(arg))) {
    throw new Error('Argumentos esperados: --aplicar, --limite=<1 a 100>, --lotes=<1 a 20>');
  }
  if (env.evidenciasStorage !== 'postgres') throw new Error('O expurgo exige EVIDENCIAS_STORAGE=postgres');
  const aplicar = argumentos.includes('--aplicar');
  const limite = Number(argumentos.find((arg) => arg.startsWith('--limite='))?.split('=')[1] ?? 25);
  const lotes = Number(argumentos.find((arg) => arg.startsWith('--lotes='))?.split('=')[1] ?? 1);
  if (lotes < 1 || lotes > 20 || (!aplicar && lotes > 1)) {
    throw new Error('--lotes deve estar entre 1 e 20 e exige --aplicar para múltiplos lotes.');
  }
  for (let lote = 1; lote <= lotes; lote++) {
    const resultado = await processarRetencaoEvidencias(db, { aplicar, limite });
    console.info(JSON.stringify({ evento: 'retencao_odometro', aplicar, lote, ...resultado }));
    if (resultado.falhas > 0) {
      process.exitCode = 1;
      break;
    }
    if (resultado.removidas === 0 || resultado.candidatos < limite) break;
  }
}

executar().finally(() => db.destroy()).catch(() => {
  console.error('Falha ao executar a rotina de retenção de evidências. Confira argumentos, configuração e conexão.');
  process.exitCode = 1;
});
