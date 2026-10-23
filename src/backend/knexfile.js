const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/** @type {import('knex').Knex.Config} */
module.exports = {
  client: 'pg',
  connection: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    ssl:
      process.env.POSTGRES_SSL === 'true' ||
      (process.env.POSTGRES_HOST &&
        process.env.POSTGRES_HOST !== 'localhost' &&
        process.env.POSTGRES_HOST !== '127.0.0.1')
        ? { rejectUnauthorized: false }
        : false,
  },
  migrations: {
    directory: path.resolve(__dirname, 'database/migrations'),
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: path.resolve(__dirname, 'database/seeds'),
  },
};