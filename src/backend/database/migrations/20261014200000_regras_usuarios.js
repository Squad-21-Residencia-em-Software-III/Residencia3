/** @param {import('knex').Knex} knex */
exports.up = (knex) =>
  knex.raw(`
    ALTER TABLE usuarios
    ADD CONSTRAINT chk_usuarios_perfil
    CHECK (perfil IN ('ADMINISTRADOR', 'SOLICITANTE', 'GESTOR_FROTA', 'GESTOR_SVO', 'MOTORISTA_FROTA', 'MOTORISTA_SVO'));
  `);

/** @param {import('knex').Knex} knex */
exports.down = (knex) => knex.raw('ALTER TABLE usuarios DROP CONSTRAINT chk_usuarios_perfil;');
