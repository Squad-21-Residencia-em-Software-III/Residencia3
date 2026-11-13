const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', 'db']);

/**
 * Resolve a configuração de TLS/SSL do PostgreSQL.
 * Conexões remotas ou com POSTGRES_SSL=true exigem validação estrita do certificado (rejectUnauthorized: true).
 */
function resolverSsl(env = process.env) {
  const host = (env.POSTGRES_HOST || 'localhost').trim().toLowerCase();
  const sslExplicito = env.POSTGRES_SSL?.trim().toLowerCase();

  if (sslExplicito === 'false') {
    return false;
  }

  const usarSsl = sslExplicito === 'true' || !HOSTS_LOCAIS.has(host);
  if (!usarSsl) {
    return false;
  }

  /** @type {{ rejectUnauthorized: true, ca?: string }} */
  const sslConfig = {
    rejectUnauthorized: true,
  };

  if (env.POSTGRES_SSL_CA) {
    sslConfig.ca = env.POSTGRES_SSL_CA.replace(/\\n/g, '\n');
  } else if (env.POSTGRES_SSL_CA_PATH) {
    sslConfig.ca = fs.readFileSync(path.resolve(env.POSTGRES_SSL_CA_PATH), 'utf8');
  }

  return sslConfig;
}

/**
 * Identifica se o processo atual é uma execução de migration/seed (CLI administrativa)
 * ou a execução normal da aplicação (mínimo privilégio).
 */
function ehContextoMigration(env = process.env, argv = process.argv) {
  if (env.DB_ROLE === 'migration') return true;
  if (env.DB_ROLE === 'app') return false;

  const eventoNpm = env.npm_lifecycle_event || '';
  if (eventoNpm.startsWith('migrate') || eventoNpm.startsWith('seed')) {
    return true;
  }

  return argv.some((arg) => /migrate|seed/i.test(arg));
}

/**
 * Seleciona as credenciais adequadas conforme o papel (migration vs aplicação).
 */
function resolverCredenciais(env = process.env, argv = process.argv) {
  if (ehContextoMigration(env, argv)) {
    return {
      user: env.POSTGRES_MIGRATION_USER || env.POSTGRES_USER,
      password: env.POSTGRES_MIGRATION_PASSWORD || env.POSTGRES_PASSWORD,
    };
  }

  return {
    user: env.POSTGRES_APP_USER || env.POSTGRES_USER,
    password: env.POSTGRES_APP_PASSWORD || env.POSTGRES_PASSWORD,
  };
}

/**
 * Resolve o dimensionamento explicito do pool de conexoes e os tempos maximos
 * de espera para aquisicao, criacao, ociosidade e liberacao (Tarn.js / Knex).
 */
function resolverPool(env = process.env) {
  const minInformado = Number(env.POSTGRES_POOL_MIN);
  const maxInformado = Number(env.POSTGRES_POOL_MAX);

  const min = Number.isInteger(minInformado) && minInformado >= 0 ? minInformado : 2;
  const maxBase = Number.isInteger(maxInformado) && maxInformado > 0 ? maxInformado : 10;
  const max = Math.max(min, maxBase);

  return {
    min,
    max,
    acquireTimeoutMillis: Number(env.POSTGRES_POOL_ACQUIRE_TIMEOUT_MS) || 10000,
    createTimeoutMillis: Number(env.POSTGRES_POOL_CREATE_TIMEOUT_MS) || 10000,
    destroyTimeoutMillis: Number(env.POSTGRES_POOL_DESTROY_TIMEOUT_MS) || 5000,
    idleTimeoutMillis: Number(env.POSTGRES_POOL_IDLE_TIMEOUT_MS) || 30000,
    reapIntervalMillis: Number(env.POSTGRES_POOL_REAP_INTERVAL_MS) || 1000,
    createRetryIntervalMillis: Number(env.POSTGRES_POOL_CREATE_RETRY_INTERVAL_MS) || 200,
    propagateCreateError: false,
  };
}

/**
 * Monta a configuração completa do Knex a partir do ambiente informado.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string[]} [argv]
 * @returns {import('knex').Knex.Config}
 */
function criarConfigKnex(env = process.env, argv = process.argv) {
  const credenciais = resolverCredenciais(env, argv);
  const pool = resolverPool(env);

  return {
    client: 'pg',
    connection: {
      host: env.POSTGRES_HOST || 'localhost',
      port: Number(env.POSTGRES_PORT) || 5432,
      user: credenciais.user,
      password: credenciais.password,
      database: env.POSTGRES_DB,
      ssl: resolverSsl(env),
      connectionTimeoutMillis: pool.createTimeoutMillis,
    },
    pool,
    migrations: {
      directory: path.resolve(__dirname, 'database/migrations'),
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: path.resolve(__dirname, 'database/seeds'),
    },
  };
}

const config = criarConfigKnex();

Object.defineProperties(config, {
  resolverSsl: { value: resolverSsl, enumerable: false },
  ehContextoMigration: { value: ehContextoMigration, enumerable: false },
  resolverCredenciais: { value: resolverCredenciais, enumerable: false },
  resolverPool: { value: resolverPool, enumerable: false },
  criarConfigKnex: { value: criarConfigKnex, enumerable: false },
});

module.exports = config;