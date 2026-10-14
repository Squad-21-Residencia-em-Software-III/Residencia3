const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); 

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: 'localhost',
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: 5432,
});

pool.on('connect', () => {
  console.log('Conectado ao banco de dados PostgreSQL com sucesso!');
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};