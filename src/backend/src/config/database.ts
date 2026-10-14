import knex from 'knex';
import knexConfig = require('../../knexfile');

export const db = knex(knexConfig);
