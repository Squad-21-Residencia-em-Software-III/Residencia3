import { db } from '../config/database';
import { acompanhamentoExternoSvoModel } from '../models/acompanhamentoExternoSvoModel';

async function executar(): Promise<void> {
  try {
    const limite = Number(process.argv[2] ?? 100);
    const descartados = await acompanhamentoExternoSvoModel.descartarRecuperacoesExpiradas(limite, db);
    console.info(JSON.stringify({ evento: 'descarte_comprovantes_expirados_svo', descartados }));
  } finally {
    await db.destroy();
  }
}

void executar().catch(() => {
  console.error('Falha no descarte de comprovantes expirados do portal SVO.');
  process.exitCode = 1;
});
