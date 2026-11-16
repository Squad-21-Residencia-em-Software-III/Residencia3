/**
 * SCRUM-176: Adiciona inicio_previsto e fim_previsto na tabela ordens_svo
 * para suportar o agendamento de coletas SVO por periodo (mantendo data_hora_chamado
 * separado como o instante de geracao do chamado).
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE ordens_svo
      ADD COLUMN IF NOT EXISTS inicio_previsto TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS fim_previsto TIMESTAMPTZ NULL;

    ALTER TABLE ordens_svo
      DROP CONSTRAINT IF EXISTS chk_ordens_svo_periodo_previsto;

    ALTER TABLE ordens_svo
      ADD CONSTRAINT chk_ordens_svo_periodo_previsto
      CHECK (
        (inicio_previsto IS NULL AND fim_previsto IS NULL)
        OR (inicio_previsto IS NOT NULL AND fim_previsto IS NOT NULL AND fim_previsto > inicio_previsto)
      );

    CREATE INDEX IF NOT EXISTS idx_ordens_svo_periodo_previsto
      ON ordens_svo (inicio_previsto, fim_previsto)
      WHERE status IN ('ALOCADA', 'EM_DESLOCAMENTO');
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_ordens_svo_periodo_previsto;

    ALTER TABLE ordens_svo
      DROP CONSTRAINT IF EXISTS chk_ordens_svo_periodo_previsto;

    ALTER TABLE ordens_svo
      DROP COLUMN IF EXISTS fim_previsto,
      DROP COLUMN IF EXISTS inicio_previsto;
  `);
};
