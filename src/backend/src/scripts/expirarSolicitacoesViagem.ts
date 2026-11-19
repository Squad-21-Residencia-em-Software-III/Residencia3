import { db } from '../config/database';
import { solicitacaoViagemService } from '../services/solicitacaoViagemService';

async function executar(): Promise<void> {
  if (process.argv.length !== 2) throw new Error('A rotina não aceita argumentos.');
  const constraint = await db('pg_constraint')
    .where({ conname: 'chk_solicitacoes_viagem_status', convalidated: true })
    .whereRaw("conrelid = 'solicitacoes_viagem'::regclass")
    .whereRaw('position(quote_literal(?::text) in pg_get_constraintdef(oid)) > 0', ['EXPIRADA'])
    .first('oid');
  if (!constraint) {
    console.error('Migration de expiração administrativa ausente ou constraint ainda não validada.');
    process.exitCode = 1;
    return;
  }

  const expiradas = await solicitacaoViagemService.expirarAprovadas();
  console.info(JSON.stringify({ evento: 'expiracao_solicitacoes_viagem', expiradas }));
}

executar()
  .finally(() => db.destroy())
  .catch(() => {
    console.error('Falha na expiração administrativa. Confira a configuração, a conexão e as permissões.');
    process.exitCode = 1;
  });
