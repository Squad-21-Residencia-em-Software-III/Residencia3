/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE ordens_svo
      DROP CONSTRAINT chk_ordens_svo_status;

    ALTER TABLE ordens_svo
      ADD CONSTRAINT chk_ordens_svo_status
      CHECK (status IN (
        'AGUARDANDO_ALOCACAO',
        'ALOCADA',
        'EM_DESLOCAMENTO',
        'NO_LOCAL',
        'CONCLUIDA',
        'CANCELADA'
      ));

    ALTER TABLE ordens_svo
      DROP CONSTRAINT chk_ordens_svo_alocacao;

    ALTER TABLE ordens_svo
      ADD CONSTRAINT chk_ordens_svo_alocacao
      CHECK (
        status NOT IN ('ALOCADA', 'EM_DESLOCAMENTO', 'NO_LOCAL')
        OR (veiculo_id IS NOT NULL AND motorista_id IS NOT NULL)
      );

    DROP INDEX IF EXISTS uq_ordens_svo_solicitacao_ativa;

    CREATE UNIQUE INDEX uq_ordens_svo_solicitacao_ativa
      ON ordens_svo (solicitacao_id)
      WHERE status IN (
        'AGUARDANDO_ALOCACAO',
        'ALOCADA',
        'EM_DESLOCAMENTO',
        'NO_LOCAL'
      );
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM ordens_svo WHERE status = 'NO_LOCAL'
      ) THEN
        RAISE EXCEPTION
          'Existem ordens NO_LOCAL. Resolva-as antes do rollback da BL31';
      END IF;
    END
    $$;

    DROP INDEX IF EXISTS uq_ordens_svo_solicitacao_ativa;

    CREATE UNIQUE INDEX uq_ordens_svo_solicitacao_ativa
      ON ordens_svo (solicitacao_id)
      WHERE status IN (
        'AGUARDANDO_ALOCACAO',
        'ALOCADA',
        'EM_DESLOCAMENTO'
      );

    ALTER TABLE ordens_svo
      DROP CONSTRAINT chk_ordens_svo_alocacao;

    ALTER TABLE ordens_svo
      ADD CONSTRAINT chk_ordens_svo_alocacao
      CHECK (
        status NOT IN ('ALOCADA', 'EM_DESLOCAMENTO')
        OR (veiculo_id IS NOT NULL AND motorista_id IS NOT NULL)
      );

    ALTER TABLE ordens_svo
      DROP CONSTRAINT chk_ordens_svo_status;

    ALTER TABLE ordens_svo
      ADD CONSTRAINT chk_ordens_svo_status
      CHECK (status IN (
        'AGUARDANDO_ALOCACAO',
        'ALOCADA',
        'EM_DESLOCAMENTO',
        'CONCLUIDA',
        'CANCELADA'
      ));
  `);
};