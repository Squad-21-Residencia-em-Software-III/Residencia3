/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS versao_sessao INTEGER NOT NULL DEFAULT 1;

    ALTER TABLE usuarios
      DROP CONSTRAINT IF EXISTS chk_usuarios_versao_sessao;

    ALTER TABLE usuarios
      ADD CONSTRAINT chk_usuarios_versao_sessao
      CHECK (versao_sessao >= 1);
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    ALTER TABLE usuarios
      DROP CONSTRAINT IF EXISTS chk_usuarios_versao_sessao;

    ALTER TABLE usuarios
      DROP COLUMN IF EXISTS versao_sessao;
  `);
};