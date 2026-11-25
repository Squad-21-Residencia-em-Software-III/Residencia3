import knex, { type Knex } from 'knex';
import { afterAll, beforeAll } from 'vitest';

/**
 * Para suítes PostgreSQL que mexem no banco inteiro (fila de push, rotina de expiração): uma por vez, mesmo
 * com o vitest rodando os arquivos em paralelo. Chamar dentro do `describe`.
 */
export function usarBancoComExclusividade(): void {
  let conexao: Knex;
  let trava: Knex.Transaction;
  beforeAll(async () => {
    conexao = knex({
      client: 'pg',
      pool: { min: 0, max: 1 },
      connection: {
        host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT), database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
      },
    });
    trava = await conexao.transaction();
    await trava.raw('SELECT pg_advisory_xact_lock(230)');
  }, 60_000);
  afterAll(async () => {
    await trava.rollback();
    await conexao.destroy();
  });
}
