/**
 * SCRUM-175: Adiciona coluna lotacao_cabine na tabela veiculos para separar
 * a capacidade da cabine (pessoas, incluindo motorista) da capacidade de corpos
 * (capacidade_maxima) nos veiculos do SVO.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE veiculos
      ADD COLUMN IF NOT EXISTS lotacao_cabine INTEGER NULL;

    ALTER TABLE veiculos
      DROP CONSTRAINT IF EXISTS chk_veiculos_lotacao_cabine;

    ALTER TABLE veiculos
      ADD CONSTRAINT chk_veiculos_lotacao_cabine
      CHECK (lotacao_cabine IS NULL OR lotacao_cabine >= 1);
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    ALTER TABLE veiculos
      DROP CONSTRAINT IF EXISTS chk_veiculos_lotacao_cabine;

    ALTER TABLE veiculos
      DROP COLUMN IF EXISTS lotacao_cabine;
  `);
};
