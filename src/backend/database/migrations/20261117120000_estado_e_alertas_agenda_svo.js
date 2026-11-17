/** SCRUM-183. Revisar com a frente DB antes de aplicar em qualquer ambiente. */
exports.up = async function up(knex) {
  await knex.schema.alterTable('ordens_svo', (table) => {
    table.timestamp('liberada_em', { useTz: true }).nullable();
  });
  await knex.schema.createTable('alertas_atraso_svo', (table) => {
    table.increments('id');
    table.integer('ordem_em_atraso_id').notNullable().references('id').inTable('ordens_svo').onDelete('RESTRICT');
    table.integer('ordem_afetada_id').notNullable().references('id').inTable('ordens_svo').onDelete('RESTRICT');
    table.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('resolvido_em', { useTz: true }).nullable();
    table.unique(['ordem_em_atraso_id', 'ordem_afetada_id']);
    table.check('ordem_em_atraso_id <> ordem_afetada_id');
  });
  await knex.raw('CREATE INDEX idx_alertas_atraso_svo_abertos ON alertas_atraso_svo (ordem_afetada_id) WHERE resolvido_em IS NULL');
};

exports.down = async function down(knex) {
  // Não remover histórico de alertas silenciosamente em rollback.
  const [{ total }] = await knex('alertas_atraso_svo').count({ total: '*' });
  if (Number(total) > 0) throw new Error('Rollback bloqueado: há histórico de alertas SVO');
  const [{ liberadas }] = await knex('ordens_svo').whereNotNull('liberada_em').count({ liberadas: '*' });
  if (Number(liberadas) > 0) throw new Error('Rollback bloqueado: há registros de liberação SVO');
  await knex.schema.dropTable('alertas_atraso_svo');
  await knex.schema.alterTable('ordens_svo', (table) => table.dropColumn('liberada_em'));
};
