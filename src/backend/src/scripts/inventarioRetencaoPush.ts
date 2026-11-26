import { inventariarRetencaoPush, lerPrazosSimulados } from '../services/inventarioRetencaoPush';

async function executar(): Promise<void> {
  const prazos = lerPrazosSimulados(process.argv.slice(2));
  const { db } = await import('../config/database.js');
  try {
    const inventario = await inventariarRetencaoPush(db, prazos);
    console.info(JSON.stringify({ evento: 'inventario_retencao_push', ...inventario }));
  } finally {
    await db.destroy();
  }
}

void executar().catch(() => {
  console.error('Falha no inventário de retenção Push. Confira os prazos em dias, as permissões e a conexão de leitura.');
  process.exitCode = 1;
});
