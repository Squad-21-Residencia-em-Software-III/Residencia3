// BL27: confirmação da solicitação SVO e ordem de coleta aguardando alocação.
// Os status CONFIRMADA e RECUSADA das solicitações já foram criados em
// 20261111140211_ajustes_solicitacoes_svo.js, por isso não são alterados aqui.

/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE solicitacoes_svo
      ADD COLUMN confirmado_por INTEGER REFERENCES usuarios(id) ON DELETE RESTRICT,
      ADD COLUMN confirmado_em TIMESTAMPTZ;

    ALTER TABLE ordens_svo DROP CONSTRAINT chk_ordens_svo_status;
    ALTER TABLE ordens_svo ADD CONSTRAINT chk_ordens_svo_status
      CHECK (status IN ('AGUARDANDO_ALOCACAO', 'ALOCADA', 'EM_DESLOCAMENTO', 'CONCLUIDA', 'CANCELADA'));
    ALTER TABLE ordens_svo ALTER COLUMN status SET DEFAULT 'AGUARDANDO_ALOCACAO';

    -- Ordens anteriores já foram alocadas. Preserva seus dados sem inventar
    -- autor/data de confirmação para operações realizadas antes da BL27.
    UPDATE solicitacoes_svo s SET status = 'EM_ANDAMENTO'
      WHERE s.status = 'EM_TRIAGEM' AND EXISTS (
        SELECT 1 FROM ordens_svo o WHERE o.solicitacao_id = s.id
          AND o.status IN ('ALOCADA', 'EM_DESLOCAMENTO')
      );

    CREATE UNIQUE INDEX uq_ordens_svo_solicitacao_ativa ON ordens_svo (solicitacao_id)
      WHERE status IN ('AGUARDANDO_ALOCACAO', 'ALOCADA', 'EM_DESLOCAMENTO');
    ALTER TABLE ordens_svo ADD CONSTRAINT chk_ordens_svo_alocacao
      CHECK (status NOT IN ('ALOCADA', 'EM_DESLOCAMENTO') OR
        (veiculo_id IS NOT NULL AND motorista_id IS NOT NULL));
    ALTER TABLE ordens_svo ADD CONSTRAINT chk_ordens_svo_aguardando_sem_recursos
      CHECK (status <> 'AGUARDANDO_ALOCACAO' OR
        (veiculo_id IS NULL AND motorista_id IS NULL AND equipe_id IS NULL));
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  // Não apaga ordens silenciosamente no rollback.
  // A constraint de status das solicitações (com CONFIRMADA e RECUSADA) é mantida.
  await knex.raw(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM ordens_svo WHERE status = 'AGUARDANDO_ALOCACAO') THEN
        RAISE EXCEPTION 'Resolva as ordens aguardando alocação antes do rollback BL27';
      END IF;
    END $$;
    ALTER TABLE ordens_svo DROP CONSTRAINT chk_ordens_svo_aguardando_sem_recursos;
    ALTER TABLE ordens_svo DROP CONSTRAINT chk_ordens_svo_alocacao;
    DROP INDEX uq_ordens_svo_solicitacao_ativa;
    ALTER TABLE ordens_svo DROP CONSTRAINT chk_ordens_svo_status;
    ALTER TABLE ordens_svo ADD CONSTRAINT chk_ordens_svo_status
      CHECK (status IN ('ALOCADA', 'EM_DESLOCAMENTO', 'CONCLUIDA', 'CANCELADA'));
    ALTER TABLE ordens_svo ALTER COLUMN status SET DEFAULT 'ALOCADA';
    ALTER TABLE solicitacoes_svo DROP COLUMN confirmado_por, DROP COLUMN confirmado_em;
  `);
};
