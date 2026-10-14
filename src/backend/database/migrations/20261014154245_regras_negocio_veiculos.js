/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.raw(`
    ALTER TABLE veiculos
    ADD CONSTRAINT chk_tipo_frota 
    CHECK (tipo_frota IN ('ADMINISTRATIVA', 'SVO'));

    ALTER TABLE veiculos
    ADD CONSTRAINT chk_capacidade_positiva 
    CHECK (capacidade_maxima >= 0);
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.raw(`
    ALTER TABLE veiculos DROP CONSTRAINT chk_tipo_frota;
    ALTER TABLE veiculos DROP CONSTRAINT chk_capacidade_positiva;
  `);
};