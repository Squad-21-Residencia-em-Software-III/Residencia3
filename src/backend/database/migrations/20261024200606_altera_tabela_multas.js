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
exports.down = function(knex) {
  return knex.schema.alterTable('multas', (table) => {
    // Remove as colunas em caso de rollback
    table.dropColumn('status_pagamento');
    table.dropColumn('data_vencimento');
    table.dropColumn('id_infracao');
    table.dropColumn('orgao_autuador');

    // Reverte a coluna para date
    table.date('data_infracao').alter();
  });
};