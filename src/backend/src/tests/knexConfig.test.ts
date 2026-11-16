import { describe, expect, it } from 'vitest';
import knexConfig = require('../../knexfile');

const { resolverSsl, resolverCredenciais, resolverPool, resolverTimeouts, criarConfigKnex } = knexConfig as typeof knexConfig & {
  resolverTimeouts: (env: NodeJS.ProcessEnv, argv?: string[]) => Record<string, number>;
  resolverSsl: (env: NodeJS.ProcessEnv) => false | { rejectUnauthorized: true; ca?: string };
  resolverCredenciais: (
    env: NodeJS.ProcessEnv,
    argv?: string[]
  ) => { user?: string; password?: string };
  resolverPool: (env: NodeJS.ProcessEnv) => {
    min: number;
    max: number;
    acquireTimeoutMillis: number;
    createTimeoutMillis: number;
    destroyTimeoutMillis: number;
    idleTimeoutMillis: number;
    reapIntervalMillis: number;
    createRetryIntervalMillis: number;
    propagateCreateError: boolean;
  };
  criarConfigKnex: (env: NodeJS.ProcessEnv, argv?: string[]) => typeof knexConfig;
};

describe('Configuração de segurança do PostgreSQL (knexfile)', () => {
  describe('Validação de certificado TLS (resolverSsl)', () => {
    it('deve habilitar TLS com rejectUnauthorized: true para conexões remotas', () => {
      const ssl = resolverSsl({
        POSTGRES_HOST: 'ep-exemplo.us-east-1.aws.neon.tech',
      });

      expect(ssl).toEqual({ rejectUnauthorized: true });
    });

    it('nunca deve usar rejectUnauthorized: false quando POSTGRES_SSL=true', () => {
      const ssl = resolverSsl({
        POSTGRES_HOST: 'localhost',
        POSTGRES_SSL: 'true',
      });

      expect(ssl).toEqual({ rejectUnauthorized: true });
    });

    it('deve permitir certificado CA customizado mantendo rejectUnauthorized: true', () => {
      const ssl = resolverSsl({
        POSTGRES_HOST: 'db.exemplo.interno',
        POSTGRES_SSL_CA: '-----BEGIN CERTIFICATE-----\\nMIIB...\\n-----END CERTIFICATE-----',
      });

      expect(ssl).toEqual({
        rejectUnauthorized: true,
        ca: '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----',
      });
    });

    it('deve desabilitar TLS por padrão apenas para conexões locais', () => {
      expect(resolverSsl({ POSTGRES_HOST: 'localhost' })).toBe(false);
      expect(resolverSsl({ POSTGRES_HOST: '127.0.0.1' })).toBe(false);
      expect(resolverSsl({ POSTGRES_HOST: 'db' })).toBe(false);
    });
  });

  describe('Separação entre conta da aplicação e conta de migrations', () => {
    const envSeparado: NodeJS.ProcessEnv = {
      POSTGRES_HOST: 'ep-exemplo.neon.tech',
      POSTGRES_PORT: '5432',
      POSTGRES_DB: 'neondb',
      POSTGRES_APP_USER: 'frotas_app',
      POSTGRES_APP_PASSWORD: 'senha_app_minimo_privilegio',
      POSTGRES_MIGRATION_USER: 'neondb_owner',
      POSTGRES_MIGRATION_PASSWORD: 'senha_migration_owner',
    };

    it('deve usar a conta de mínimo privilégio (POSTGRES_APP_USER) durante a execução da aplicação', () => {
      const credenciais = resolverCredenciais(
        { ...envSeparado, npm_lifecycle_event: 'start' },
        ['node', 'dist/server.js']
      );

      expect(credenciais).toEqual({
        user: 'frotas_app',
        password: 'senha_app_minimo_privilegio',
      });
    });

    it('deve usar a conta de migrations (POSTGRES_MIGRATION_USER) ao executar migrations ou seeds', () => {
      const credenciaisMigrate = resolverCredenciais(
        { ...envSeparado, npm_lifecycle_event: 'migrate' },
        ['node', 'knex', 'migrate:latest']
      );

      expect(credenciaisMigrate).toEqual({
        user: 'neondb_owner',
        password: 'senha_migration_owner',
      });

      const configExplicita = criarConfigKnex({
        ...envSeparado,
        DB_ROLE: 'migration',
      });

      expect(configExplicita.connection).toMatchObject({
        user: 'neondb_owner',
        password: 'senha_migration_owner',
        ssl: { rejectUnauthorized: true },
      });
    });
  });

  describe('Dimensionamento do pool de conexões e timeouts (resolverPool)', () => {
    it('deve aplicar limites explícitos e tempos de espera padrão no pool', () => {
      const pool = resolverPool({});

      expect(pool).toEqual({
        min: 2,
        max: 10,
        acquireTimeoutMillis: 10000,
        createTimeoutMillis: 10000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 200,
        propagateCreateError: false,
      });
    });

    it('deve respeitar variáveis de ambiente customizadas e garantir que max >= min', () => {
      const poolCustomizado = resolverPool({
        POSTGRES_POOL_MIN: '4',
        POSTGRES_POOL_MAX: '15',
        POSTGRES_POOL_ACQUIRE_TIMEOUT_MS: '8000',
        POSTGRES_POOL_CREATE_TIMEOUT_MS: '6000',
        POSTGRES_POOL_DESTROY_TIMEOUT_MS: '3000',
        POSTGRES_POOL_IDLE_TIMEOUT_MS: '20000',
      });

      expect(poolCustomizado).toMatchObject({
        min: 4,
        max: 15,
        acquireTimeoutMillis: 8000,
        createTimeoutMillis: 6000,
        destroyTimeoutMillis: 3000,
        idleTimeoutMillis: 20000,
      });

      const poolAjustado = resolverPool({
        POSTGRES_POOL_MIN: '8',
        POSTGRES_POOL_MAX: '3',
      });

      expect(poolAjustado.min).toBe(8);
      expect(poolAjustado.max).toBe(8);
    });
  });

  describe('Tempos máximos das operações no banco (resolverTimeouts)', () => {
    const app = ['node', 'dist/server.js'];

    it('limita consultas a 10s no servidor, 12s no driver e transações ociosas a 15s', () => {
      expect(resolverTimeouts({}, app)).toEqual({
        statement_timeout: 10000,
        query_timeout: 12000,
        idle_in_transaction_session_timeout: 15000,
      });
    });

    it('respeita os valores configurados', () => {
      expect(
        resolverTimeouts({ POSTGRES_STATEMENT_TIMEOUT_MS: '5000', POSTGRES_IDLE_TRANSACTION_TIMEOUT_MS: '8000' }, app)
      ).toEqual({ statement_timeout: 5000, query_timeout: 7000, idle_in_transaction_session_timeout: 8000 });
    });

    it('ignora valores inválidos e usa o padrão', () => {
      expect(resolverTimeouts({ POSTGRES_STATEMENT_TIMEOUT_MS: 'abc' }, app).statement_timeout).toBe(10000);
    });

    it('desativa os limites em migrations e seeds, que podem ser longas', () => {
      expect(resolverTimeouts({ DB_ROLE: 'migration' }, app)).toEqual({
        statement_timeout: 0,
        query_timeout: 0,
        idle_in_transaction_session_timeout: 0,
      });
    });

    it('aplica os tempos na conexão usada pela aplicação', () => {
      const config = criarConfigKnex({ DB_ROLE: 'app' }, app) as unknown as { connection: Record<string, unknown> };

      expect(config.connection).toMatchObject({ statement_timeout: 10000, query_timeout: 12000 });
    });
  });
});
