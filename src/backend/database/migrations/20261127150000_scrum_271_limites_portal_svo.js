exports.up = async (knex) => {
  await knex.schema.createTable('limites_portal_svo', (table) => {
    table.bigInteger('expira_em').notNullable();
    table.string('escopo', 96).notNullable();
    table.integer('total').notNullable();
    table.check('total > 0');
    table.primary(['expira_em', 'escopo']);
  });
  const appUser = process.env.POSTGRES_APP_USER;
  await knex.raw('REVOKE ALL ON TABLE limites_portal_svo FROM PUBLIC');
  if (appUser) {
    await knex.raw('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE limites_portal_svo TO ??', [appUser]);
  }
};

exports.down = (knex) => knex.schema.dropTable('limites_portal_svo');
