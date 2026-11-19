/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE solicitacoes_viagem
      DROP CONSTRAINT chk_solicitacoes_viagem_status,
      ADD CONSTRAINT chk_solicitacoes_viagem_status
        CHECK (status IN ('PENDENTE_APROVACAO', 'APROVADA', 'AGENDADA', 'CONCLUIDA', 'RECUSADA', 'CANCELADA', 'EXPIRADA'));

    CREATE INDEX idx_solicitacoes_viagem_expiracao
      ON solicitacoes_viagem (data_saida_desejada, id) WHERE status = 'APROVADA';
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  // A constraint anterior impede a reversão se o histórico já contém solicitações expiradas.
  await knex.raw(`
    DROP INDEX idx_solicitacoes_viagem_expiracao;
    ALTER TABLE solicitacoes_viagem
      DROP CONSTRAINT chk_solicitacoes_viagem_status,
      ADD CONSTRAINT chk_solicitacoes_viagem_status
        CHECK (status IN ('PENDENTE_APROVACAO', 'APROVADA', 'AGENDADA', 'CONCLUIDA', 'RECUSADA', 'CANCELADA'));
  `);
};
