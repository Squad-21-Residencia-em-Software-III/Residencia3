/** @param {import('knex').Knex} knex */
exports.up = (knex) =>
  knex.raw(`
    UPDATE usuarios SET ativo = true WHERE ativo IS NULL;
    ALTER TABLE usuarios ALTER COLUMN ativo SET NOT NULL;

    ALTER TABLE usuarios
    ADD CONSTRAINT chk_usuarios_tipo_usuario
    CHECK (tipo_usuario = CASE WHEN perfil IN ('MOTORISTA_FROTA', 'MOTORISTA_SVO') THEN 'MOTORISTA' ELSE perfil END);

    CREATE UNIQUE INDEX uq_usuarios_email_lower ON usuarios (lower(email));
  `);

/** @param {import('knex').Knex} knex */
exports.down = (knex) =>
  knex.raw(`
    DROP INDEX IF EXISTS uq_usuarios_email_lower;
    ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_usuarios_tipo_usuario;
    ALTER TABLE usuarios ALTER COLUMN ativo DROP NOT NULL;
  `);
