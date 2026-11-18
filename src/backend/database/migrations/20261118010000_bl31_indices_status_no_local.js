// BL31: o status NO_LOCAL também ocupa veículo, motorista e equipe.
// Recria os índices parciais que só consideravam ALOCADA e EM_DESLOCAMENTO.

/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_ordens_svo_veiculo_status_ativo;
    CREATE INDEX idx_ordens_svo_veiculo_status_ativo
      ON ordens_svo (veiculo_id, status)
      INCLUDE (capacidade_utilizada)
      WHERE status IN ('ALOCADA', 'EM_DESLOCAMENTO', 'NO_LOCAL');

    DROP INDEX IF EXISTS idx_ordens_svo_periodo_previsto;
    CREATE INDEX idx_ordens_svo_periodo_previsto
      ON ordens_svo (inicio_previsto, fim_previsto)
      WHERE status IN ('ALOCADA', 'EM_DESLOCAMENTO', 'NO_LOCAL');
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_ordens_svo_veiculo_status_ativo;
    CREATE INDEX idx_ordens_svo_veiculo_status_ativo
      ON ordens_svo (veiculo_id, status)
      INCLUDE (capacidade_utilizada)
      WHERE status IN ('ALOCADA', 'EM_DESLOCAMENTO');

    DROP INDEX IF EXISTS idx_ordens_svo_periodo_previsto;
    CREATE INDEX idx_ordens_svo_periodo_previsto
      ON ordens_svo (inicio_previsto, fim_previsto)
      WHERE status IN ('ALOCADA', 'EM_DESLOCAMENTO');
  `);
};
