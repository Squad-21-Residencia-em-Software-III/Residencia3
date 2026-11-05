/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    -- 1. Adiciona data_hora_saida em ordens_svo e garante coerencia com conclusao
    ALTER TABLE ordens_svo
    ADD COLUMN data_hora_saida TIMESTAMP WITHOUT TIME ZONE;

    ALTER TABLE ordens_svo
    ADD CONSTRAINT chk_ordens_svo_datas
    CHECK (data_hora_conclusao IS NULL OR data_hora_saida IS NULL OR data_hora_conclusao >= data_hora_saida);

    -- 2. Adiciona motivo_recusa em solicitacoes_viagem
    ALTER TABLE solicitacoes_viagem
    ADD COLUMN motivo_recusa TEXT;

    -- 3. Atualiza constraint de status de solicitacoes_viagem para incluir AGENDADA e CONCLUIDA
    ALTER TABLE solicitacoes_viagem DROP CONSTRAINT IF EXISTS chk_solicitacoes_viagem_status;
    ALTER TABLE solicitacoes_viagem
    ADD CONSTRAINT chk_solicitacoes_viagem_status
    CHECK (status IN ('PENDENTE_APROVACAO', 'APROVADA', 'AGENDADA', 'CONCLUIDA', 'RECUSADA', 'CANCELADA'));
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    -- Reverte status de solicitacoes_viagem
    UPDATE solicitacoes_viagem SET status = 'APROVADA' WHERE status IN ('AGENDADA', 'CONCLUIDA');
    ALTER TABLE solicitacoes_viagem DROP CONSTRAINT IF EXISTS chk_solicitacoes_viagem_status;
    ALTER TABLE solicitacoes_viagem
    ADD CONSTRAINT chk_solicitacoes_viagem_status
    CHECK (status IN ('PENDENTE_APROVACAO', 'APROVADA', 'RECUSADA', 'CANCELADA'));

    -- Remove motivo_recusa de solicitacoes_viagem
    ALTER TABLE solicitacoes_viagem DROP COLUMN IF EXISTS motivo_recusa;

    -- Remove constraint e coluna data_hora_saida de ordens_svo
    ALTER TABLE ordens_svo DROP CONSTRAINT IF EXISTS chk_ordens_svo_datas;
    ALTER TABLE ordens_svo DROP COLUMN IF EXISTS data_hora_saida;
  `);
};