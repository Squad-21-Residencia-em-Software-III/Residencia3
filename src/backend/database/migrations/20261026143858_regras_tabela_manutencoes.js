/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    -- 1. Sanitiza os dados existentes antes de aplicar as travas
    UPDATE manutencoes SET tipo_manutencao = UPPER(tipo_manutencao);
    UPDATE manutencoes SET status = 'AGENDADA' WHERE status IS NULL;

    -- 2. Torna o status obrigatório no banco
    ALTER TABLE manutencoes ALTER COLUMN status SET NOT NULL;

    -- 3. Adiciona as regras de negócio solicitadas
    ALTER TABLE manutencoes
    ADD CONSTRAINT chk_manutencoes_tipo 
    CHECK (tipo_manutencao IN ('PREVENTIVA', 'CORRETIVA'));

    ALTER TABLE manutencoes
    ADD CONSTRAINT chk_manutencoes_status 
    CHECK (status IN ('AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA'));

    ALTER TABLE manutencoes
    ADD CONSTRAINT chk_manutencoes_custo 
    CHECK (custo >= 0);
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    ALTER TABLE manutencoes DROP CONSTRAINT IF EXISTS chk_manutencoes_tipo;
    ALTER TABLE manutencoes DROP CONSTRAINT IF EXISTS chk_manutencoes_status;
    ALTER TABLE manutencoes DROP CONSTRAINT IF EXISTS chk_manutencoes_custo;

    ALTER TABLE manutencoes ALTER COLUMN status DROP NOT NULL;
  `);
};