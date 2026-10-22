/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    UPDATE veiculos SET status = 'DISPONIVEL' WHERE status IS NULL;

    ALTER TABLE veiculos ALTER COLUMN status SET NOT NULL;

    ALTER TABLE veiculos
    ADD CONSTRAINT chk_veiculos_status
    CHECK (status IN ('DISPONIVEL', 'EM_USO', 'MANUTENCAO'));
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    ALTER TABLE veiculos DROP CONSTRAINT IF EXISTS chk_veiculos_status;
    ALTER TABLE veiculos ALTER COLUMN status DROP NOT NULL;
  `);
};