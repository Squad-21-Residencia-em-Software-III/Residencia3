/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE multas
    ADD CONSTRAINT chk_multas_status_pagamento
    CHECK (status_pagamento IN ('PENDENTE', 'PAGO', 'CANCELADO'));
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    ALTER TABLE multas DROP CONSTRAINT IF EXISTS chk_multas_status_pagamento;
  `);
};