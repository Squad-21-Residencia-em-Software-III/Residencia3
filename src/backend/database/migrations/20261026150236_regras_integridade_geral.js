/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    -- 1. MOTORISTAS
    UPDATE motoristas SET status = 'DISPONIVEL' WHERE status IS NULL;
    ALTER TABLE motoristas ALTER COLUMN status SET NOT NULL;
    
    ALTER TABLE motoristas
    ADD CONSTRAINT chk_motoristas_tipo
    CHECK (tipo_motorista IN ('FROTA', 'SVO'));

    ALTER TABLE motoristas
    ADD CONSTRAINT chk_motoristas_status
    CHECK (status IN ('DISPONIVEL', 'EM_VIAGEM', 'INATIVO', 'AFASTADO'));

    -- 2. ABASTECIMENTOS
    ALTER TABLE abastecimentos
    ADD CONSTRAINT chk_abastecimentos_quilometragem
    CHECK (quilometragem >= 0);

    ALTER TABLE abastecimentos
    ADD CONSTRAINT chk_abastecimentos_litros
    CHECK (litros > 0);

    ALTER TABLE abastecimentos
    ADD CONSTRAINT chk_abastecimentos_valor_total
    CHECK (valor_total > 0);

    -- 3. MULTAS
    ALTER TABLE multas
    ADD CONSTRAINT chk_multas_valor
    CHECK (valor > 0);

    ALTER TABLE multas
    ADD CONSTRAINT chk_multas_pontos
    CHECK (pontos >= 0);

    -- 4. SOLICITAÇÕES DE VIAGEM (Frota Administrativa)
    UPDATE solicitacoes_viagem SET status = 'PENDENTE_APROVACAO' WHERE status IS NULL;
    ALTER TABLE solicitacoes_viagem ALTER COLUMN status SET NOT NULL;

    ALTER TABLE solicitacoes_viagem
    ADD CONSTRAINT chk_solicitacoes_viagem_status
    CHECK (status IN ('PENDENTE_APROVACAO', 'APROVADA', 'RECUSADA', 'CANCELADA'));

    ALTER TABLE solicitacoes_viagem
    ADD CONSTRAINT chk_solicitacoes_viagem_datas
    CHECK (data_chegada_desejada IS NULL OR data_chegada_desejada >= data_saida_desejada);

    -- 5. VIAGENS DA FROTA (Execução)
    UPDATE viagens_frota SET status = 'AGENDADA' WHERE status IS NULL;
    ALTER TABLE viagens_frota ALTER COLUMN status SET NOT NULL;

    ALTER TABLE viagens_frota
    ADD CONSTRAINT chk_viagens_frota_status
    CHECK (status IN ('AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'));

    ALTER TABLE viagens_frota
    ADD CONSTRAINT chk_viagens_frota_km_inicial
    CHECK (km_inicial IS NULL OR km_inicial >= 0);

    ALTER TABLE viagens_frota
    ADD CONSTRAINT chk_viagens_frota_km_coerente
    CHECK (km_final IS NULL OR (km_inicial IS NOT NULL AND km_final >= km_inicial));

    -- 6. SOLICITAÇÕES SVO (Triagem)
    UPDATE solicitacoes_svo SET status = 'EM_TRIAGEM' WHERE status IS NULL;
    ALTER TABLE solicitacoes_svo ALTER COLUMN status SET NOT NULL;

    ALTER TABLE solicitacoes_svo
    ADD CONSTRAINT chk_solicitacoes_svo_status
    CHECK (status IN ('EM_TRIAGEM', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'));

    -- 7. ORDENS SVO (Execução em Campo)
    UPDATE ordens_svo SET status = 'ALOCADA' WHERE status IS NULL;
    ALTER TABLE ordens_svo ALTER COLUMN status SET NOT NULL;

    ALTER TABLE ordens_svo
    ADD CONSTRAINT chk_ordens_svo_status
    CHECK (status IN ('ALOCADA', 'EM_DESLOCAMENTO', 'CONCLUIDA', 'CANCELADA'));

    ALTER TABLE ordens_svo
    ADD CONSTRAINT chk_ordens_svo_capacidade
    CHECK (capacidade_utilizada > 0);

    ALTER TABLE ordens_svo
    ADD CONSTRAINT chk_ordens_svo_km_inicial
    CHECK (km_inicial IS NULL OR km_inicial >= 0);

    ALTER TABLE ordens_svo
    ADD CONSTRAINT chk_ordens_svo_km_coerente
    CHECK (km_final IS NULL OR (km_inicial IS NOT NULL AND km_final >= km_inicial));

    -- 8. ESCALAS SVO (Plantões)
    ALTER TABLE escalas_svo
    ADD CONSTRAINT chk_escalas_svo_datas
    CHECK (data_fim >= data_inicio);
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    -- Reverte Escalas SVO
    ALTER TABLE escalas_svo DROP CONSTRAINT IF EXISTS chk_escalas_svo_datas;

    -- Reverte Ordens SVO
    ALTER TABLE ordens_svo DROP CONSTRAINT IF EXISTS chk_ordens_svo_km_coerente;
    ALTER TABLE ordens_svo DROP CONSTRAINT IF EXISTS chk_ordens_svo_km_inicial;
    ALTER TABLE ordens_svo DROP CONSTRAINT IF EXISTS chk_ordens_svo_capacidade;
    ALTER TABLE ordens_svo DROP CONSTRAINT IF EXISTS chk_ordens_svo_status;
    ALTER TABLE ordens_svo ALTER COLUMN status DROP NOT NULL;

    -- Reverte Solicitações SVO
    ALTER TABLE solicitacoes_svo DROP CONSTRAINT IF EXISTS chk_solicitacoes_svo_status;
    ALTER TABLE solicitacoes_svo ALTER COLUMN status DROP NOT NULL;

    -- Reverte Viagens Frota
    ALTER TABLE viagens_frota DROP CONSTRAINT IF EXISTS chk_viagens_frota_km_coerente;
    ALTER TABLE viagens_frota DROP CONSTRAINT IF EXISTS chk_viagens_frota_km_inicial;
    ALTER TABLE viagens_frota DROP CONSTRAINT IF EXISTS chk_viagens_frota_status;
    ALTER TABLE viagens_frota ALTER COLUMN status DROP NOT NULL;

    -- Reverte Solicitações Viagem
    ALTER TABLE solicitacoes_viagem DROP CONSTRAINT IF EXISTS chk_solicitacoes_viagem_datas;
    ALTER TABLE solicitacoes_viagem DROP CONSTRAINT IF EXISTS chk_solicitacoes_viagem_status;
    ALTER TABLE solicitacoes_viagem ALTER COLUMN status DROP NOT NULL;

    -- Reverte Multas
    ALTER TABLE multas DROP CONSTRAINT IF EXISTS chk_multas_pontos;
    ALTER TABLE multas DROP CONSTRAINT IF EXISTS chk_multas_valor;

    -- Reverte Abastecimentos
    ALTER TABLE abastecimentos DROP CONSTRAINT IF EXISTS chk_abastecimentos_valor_total;
    ALTER TABLE abastecimentos DROP CONSTRAINT IF EXISTS chk_abastecimentos_litros;
    ALTER TABLE abastecimentos DROP CONSTRAINT IF EXISTS chk_abastecimentos_quilometragem;

    -- Reverte Motoristas
    ALTER TABLE motoristas DROP CONSTRAINT IF EXISTS chk_motoristas_status;
    ALTER TABLE motoristas DROP CONSTRAINT IF EXISTS chk_motoristas_tipo;
    ALTER TABLE motoristas ALTER COLUMN status DROP NOT NULL;
  `);
};