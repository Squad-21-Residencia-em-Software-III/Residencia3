/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    -- 1. Adiciona coluna km_atual na tabela veiculos
    ALTER TABLE veiculos
    ADD COLUMN km_atual INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE veiculos
    ADD CONSTRAINT chk_veiculos_km_atual
    CHECK (km_atual >= 0);

    -- 2. Atualiza constraint de status dos veiculos para incluir RESERVADO
    ALTER TABLE veiculos DROP CONSTRAINT IF EXISTS chk_veiculos_status;
    ALTER TABLE veiculos
    ADD CONSTRAINT chk_veiculos_status
    CHECK (status IN ('DISPONIVEL', 'EM_USO', 'MANUTENCAO', 'RESERVADO'));

    -- 3. Atualiza constraint de status dos motoristas para incluir DESIGNADO
    ALTER TABLE motoristas DROP CONSTRAINT IF EXISTS chk_motoristas_status;
    ALTER TABLE motoristas
    ADD CONSTRAINT chk_motoristas_status
    CHECK (status IN ('DISPONIVEL', 'EM_VIAGEM', 'INATIVO', 'AFASTADO', 'DESIGNADO'));
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    -- Reverte motoristas
    ALTER TABLE motoristas DROP CONSTRAINT IF EXISTS chk_motoristas_status;
    ALTER TABLE motoristas
    ADD CONSTRAINT chk_motoristas_status
    CHECK (status IN ('DISPONIVEL', 'EM_VIAGEM', 'INATIVO', 'AFASTADO'));

    -- Reverte veiculos status
    ALTER TABLE veiculos DROP CONSTRAINT IF EXISTS chk_veiculos_status;
    ALTER TABLE veiculos
    ADD CONSTRAINT chk_veiculos_status
    CHECK (status IN ('DISPONIVEL', 'EM_USO', 'MANUTENCAO'));

    -- Remove km_atual
    ALTER TABLE veiculos DROP CONSTRAINT IF EXISTS chk_veiculos_km_atual;
    ALTER TABLE veiculos DROP COLUMN IF EXISTS km_atual;
  `);
};