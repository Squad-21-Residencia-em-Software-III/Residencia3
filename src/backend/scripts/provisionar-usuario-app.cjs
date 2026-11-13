const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');

async function provisionarUsuarioAplicacao() {
  const appUser = process.env.POSTGRES_APP_USER;
  const appPassword = process.env.POSTGRES_APP_PASSWORD;
  const dbName = process.env.POSTGRES_DB;

  if (!appUser || !appPassword || !dbName) {
    console.error(
      'Defina POSTGRES_DB, POSTGRES_APP_USER e POSTGRES_APP_PASSWORD no arquivo .env antes de executar este script.'
    );
    process.exit(1);
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser)) {
    console.error('POSTGRES_APP_USER deve conter apenas letras, numeros e underscore.');
    process.exit(1);
  }

  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });

  const db = knex(configMigration);

  try {
    await db.transaction(async (trx) => {
      const roleExistente = await trx('pg_roles').where({ rolname: appUser }).first('rolname');

      const { rows: sqlRole } = await trx.raw(
        roleExistente
          ? `SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', ?::text, ?::text) AS cmd`
          : `SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', ?::text, ?::text) AS cmd`,
        [appUser, appPassword]
      );
      await trx.raw(sqlRole[0].cmd);

      // Remove permissao de criar objetos no schema public para usuarios comuns
      await trx.raw('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await trx.raw('REVOKE ALL ON SCHEMA public FROM ??', [appUser]);

      // Concede apenas conexao no banco e uso do schema public (sem CREATE)
      await trx.raw('GRANT CONNECT ON DATABASE ?? TO ??', [dbName, appUser]);
      await trx.raw('GRANT USAGE ON SCHEMA public TO ??', [appUser]);

      // Revoga privilegios anteriores (como TRUNCATE/REFERENCES/TRIGGER) e concede apenas DML basico
      await trx.raw('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ??', [appUser]);
      await trx.raw('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ??', [
        appUser,
      ]);

      // A aplicacao nao deve ler nem alterar as tabelas internas de controle de migrations
      await trx.raw(
        `DO $$
        BEGIN
          IF to_regclass('public.knex_migrations') IS NOT NULL THEN
            EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.knex_migrations FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.knex_migrations_lock') IS NOT NULL THEN
            EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.knex_migrations_lock FROM %I', '${appUser}');
          END IF;
        END $$;`
      );

      // Concede uso e leitura de sequences para colunas SERIAL / auto-incremento
      await trx.raw('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ??', [appUser]);
      await trx.raw('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ??', [appUser]);

      // Garante que tabelas e sequences criadas em futuras migrations recebam os mesmos privilegios minimos
      await trx.raw(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ??',
        [appUser]
      );
      await trx.raw(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ??',
        [appUser]
      );
      await trx.raw(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ??',
        [appUser]
      );
      await trx.raw(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ??',
        [appUser]
      );
    });

    console.log(
      `Role de minimo privilegio "${appUser}" configurada com sucesso no banco "${dbName}".`
    );
  } finally {
    await db.destroy();
  }
}

provisionarUsuarioAplicacao().catch((erro) => {
  console.error('Falha ao provisionar role da aplicacao:', erro.message);
  process.exit(1);
});
