/**
 * Migration de indices compostos e parciais voltados para as consultas criticas
 * de listagem, paginacao, dashboard e verificacao de disponibilidade.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async (knex) => {
  await knex.raw(`
    -- 1. Auditorias: paginacao ordenada por data_hora DESC, id DESC sem Sort em memoria
    CREATE INDEX IF NOT EXISTS idx_auditorias_data_hora_id
      ON auditorias (data_hora DESC, id DESC);

    -- 2. Solicitacoes de viagem: listagem por status/periodo e historico do solicitante
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_viagem_status_saida_id
      ON solicitacoes_viagem (status, data_saida_desejada ASC, id ASC);

    CREATE INDEX IF NOT EXISTS idx_solicitacoes_viagem_solicitante_saida_id
      ON solicitacoes_viagem (solicitante_id, data_saida_desejada DESC, id DESC);

    -- 3. Viagens da frota: LATERAL join de viagem vigente e conflito de disponibilidade
    CREATE INDEX IF NOT EXISTS idx_viagens_frota_solicitacao_ativa_id
      ON viagens_frota (solicitacao_id, id DESC)
      WHERE status <> 'CANCELADA';

    CREATE INDEX IF NOT EXISTS idx_viagens_frota_status_veiculo
      ON viagens_frota (status, veiculo_id);

    CREATE INDEX IF NOT EXISTS idx_viagens_frota_status_motorista
      ON viagens_frota (status, motorista_id);

    -- 4. Operacao SVO: ocupacao de veiculos (covering index parcial) e fila de triagem
    CREATE INDEX IF NOT EXISTS idx_ordens_svo_veiculo_status_ativo
      ON ordens_svo (veiculo_id, status)
      INCLUDE (capacidade_utilizada)
      WHERE status IN ('ALOCADA', 'EM_DESLOCAMENTO');

    CREATE INDEX IF NOT EXISTS idx_solicitacoes_svo_status_id
      ON solicitacoes_svo (status, id DESC);

    -- 5. Veiculos: filtro combinado por tipo_frota e status (dashboard, disponibilidade e SVO)
    CREATE INDEX IF NOT EXISTS idx_veiculos_frota_status
      ON veiculos (tipo_frota, status);

    -- 6. Historicos operacionais ordenados por data decrescente
    CREATE INDEX IF NOT EXISTS idx_manutencoes_veiculo_data_id
      ON manutencoes (veiculo_id, data_manutencao DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_abastecimentos_veiculo_data_id
      ON abastecimentos (veiculo_id, data_abastecimento DESC, id DESC);

    CREATE INDEX IF NOT EXISTS idx_multas_data_infracao_id
      ON multas (data_infracao DESC, id DESC);
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_multas_data_infracao_id;
    DROP INDEX IF EXISTS idx_abastecimentos_veiculo_data_id;
    DROP INDEX IF EXISTS idx_manutencoes_veiculo_data_id;
    DROP INDEX IF EXISTS idx_veiculos_frota_status;
    DROP INDEX IF EXISTS idx_solicitacoes_svo_status_id;
    DROP INDEX IF EXISTS idx_ordens_svo_veiculo_status_ativo;
    DROP INDEX IF EXISTS idx_viagens_frota_status_motorista;
    DROP INDEX IF EXISTS idx_viagens_frota_status_veiculo;
    DROP INDEX IF EXISTS idx_viagens_frota_solicitacao_ativa_id;
    DROP INDEX IF EXISTS idx_solicitacoes_viagem_solicitante_saida_id;
    DROP INDEX IF EXISTS idx_solicitacoes_viagem_status_saida_id;
    DROP INDEX IF EXISTS idx_auditorias_data_hora_id;
  `);
};
