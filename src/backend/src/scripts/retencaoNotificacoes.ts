import { db } from '../config/database';
import {
  executarRetencaoNotificacoes,
  lerArgumentosRetencaoNotificacoes,
} from '../services/retencaoNotificacoes';

async function executar(): Promise<void> {
  const { aplicar, limite, lotes } = lerArgumentosRetencaoNotificacoes(process.argv.slice(2));
  const { lotes: resultados, falhou } = await executarRetencaoNotificacoes(db, { aplicar, limite, lotes });
  // Registra apenas contagens: nunca conteúdo, usuário ou identificador de notificação.
  for (const resultado of resultados) {
    console.info(JSON.stringify({ evento: 'retencao_notificacoes', aplicar, ...resultado }));
  }
  if (falhou) process.exitCode = 1;
}

executar().finally(() => db.destroy()).catch(() => {
  console.error('Falha ao executar a rotina de retenção de notificações. Confira argumentos, configuração e conexão.');
  process.exitCode = 1;
});
