import { describe, expect, it } from 'vitest';
import knexConfig = require('../../knexfile');

const { resolverSsl, resolverCredenciais, criarConfigKnex } = knexConfig as typeof knexConfig & {
  resolverSsl: (env: NodeJS.ProcessEnv) => false | { rejectUnauthorized: true; ca?: string };
  resolverCredenciais: (
    env: NodeJS.ProcessEnv,
    argv?: string[]
  ) => { user?: string; password?: string };
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
});
