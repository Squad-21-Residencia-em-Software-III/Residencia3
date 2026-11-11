/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    -- 1. Novas colunas para controle de fila/SLA, triagem (RF20) e justificativa de recusa/IML
    ALTER TABLE solicitacoes_svo
      ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS observacoes TEXT,
      ADD COLUMN IF NOT EXISTS motivo_recusa TEXT;

    -- 2. Tornar material_sensivel e registrante_id obrigatorios (NOT NULL)
    UPDATE solicitacoes_svo SET material_sensivel = false WHERE material_sensivel IS NULL;
    ALTER TABLE solicitacoes_svo
      ALTER COLUMN material_sensivel SET DEFAULT false,
      ALTER COLUMN material_sensivel SET NOT NULL;

    UPDATE solicitacoes_svo
      SET registrante_id = (SELECT id FROM usuarios ORDER BY id LIMIT 1)
      WHERE registrante_id IS NULL;
    ALTER TABLE solicitacoes_svo
      ALTER COLUMN registrante_id SET NOT NULL;

    -- 3. Expandir os status permitidos na triagem (incluindo CONFIRMADA e RECUSADA)
    ALTER TABLE solicitacoes_svo DROP CONSTRAINT IF EXISTS chk_solicitacoes_svo_status;
    ALTER TABLE solicitacoes_svo
      ADD CONSTRAINT chk_solicitacoes_svo_status
      CHECK (status IN ('EM_TRIAGEM', 'CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'RECUSADA', 'CANCELADA'));
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    -- 1. Reverter os status para o conjunto original
    UPDATE solicitacoes_svo SET status = 'EM_ANDAMENTO' WHERE status = 'CONFIRMADA';
    UPDATE solicitacoes_svo SET status = 'CANCELADA' WHERE status = 'RECUSADA';

    ALTER TABLE solicitacoes_svo DROP CONSTRAINT IF EXISTS chk_solicitacoes_svo_status;
    ALTER TABLE solicitacoes_svo
      ADD CONSTRAINT chk_solicitacoes_svo_status
      CHECK (status IN ('EM_TRIAGEM', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'));

    -- 2. Reverter obrigatoriedade de registrante_id e material_sensivel
    ALTER TABLE solicitacoes_svo ALTER COLUMN registrante_id DROP NOT NULL;
    ALTER TABLE solicitacoes_svo ALTER COLUMN material_sensivel DROP NOT NULL;

    -- 3. Remover colunas adicionadas
    ALTER TABLE solicitacoes_svo
      DROP COLUMN IF EXISTS motivo_recusa,
      DROP COLUMN IF EXISTS observacoes,
      DROP COLUMN IF EXISTS criado_em;
  `);
};