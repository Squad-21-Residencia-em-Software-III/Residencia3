/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('multas', (table) => {
    // Adiciona novas colunas
    table.string('status_pagamento').notNullable().defaultTo('PENDENTE'); // Ex: PENDENTE, PAGO, CANCELADO
    table.date('data_vencimento'); 
    table.string('id_infracao'); // Código do Detran
    table.string('orgao_autuador'); // Ex: Detran, PRF, SMTT

    // Altera o tipo da coluna existente
    table.timestamp('data_infracao').alter();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('multas', (table) => {
    table.dropColumn('status_pagamento');
    table.dropColumn('data_vencimento');
    table.dropColumn('id_infracao');
    table.dropColumn('orgao_autuador');
  });

  // Cast seguro de timestamp para date
  await knex.raw('ALTER TABLE multas ALTER COLUMN data_infracao TYPE date USING data_infracao::date;');
};