const TABELA = 'evidencias_odometro_arquivos';

exports.up = async (knex) => {
  await knex.schema.createTable(TABELA, (tabela) => {
    tabela.integer('evidencia_id').primary()
      .references('id').inTable('evidencias_odometro').onDelete('RESTRICT');
    tabela.specificType('conteudo', 'bytea').notNullable();
    tabela.integer('tamanho_bytes').notNullable();
    tabela.check('tamanho_bytes BETWEEN 1 AND 524288 AND tamanho_bytes = octet_length(conteudo)');
  });

  const { rows: [{ schema_atual: schema }] } = await knex.raw('SELECT current_schema() AS schema_atual');
  const usuario = process.env.POSTGRES_APP_USER;
  if (schema === 'public' && usuario && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(usuario) &&
    await knex('pg_roles').where({ rolname: usuario }).first('rolname')) {
    await knex.raw('REVOKE ALL PRIVILEGES ON TABLE ??.?? FROM ??', [schema, TABELA, usuario]);
    await knex.raw('GRANT SELECT, INSERT, DELETE ON TABLE ??.?? TO ??', [schema, TABELA, usuario]);
  }
};

exports.down = async (knex) => {
  await knex.raw('LOCK TABLE ?? IN ACCESS EXCLUSIVE MODE', [TABELA]);
  if (await knex(TABELA).first('evidencia_id')) {
    throw new Error('Rollback bloqueado: existem fotos de odômetro armazenadas no PostgreSQL.');
  }
  await knex.schema.dropTable(TABELA);
};
