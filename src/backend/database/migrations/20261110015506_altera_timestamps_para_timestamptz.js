/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    -- 1. auditorias
    ALTER TABLE auditorias
      ALTER COLUMN data_hora TYPE TIMESTAMPTZ USING data_hora AT TIME ZONE 'UTC',
      ALTER COLUMN data_hora SET DEFAULT now();

    -- 2. solicitacoes_viagem
    ALTER TABLE solicitacoes_viagem
      ALTER COLUMN data_saida_desejada TYPE TIMESTAMPTZ USING data_saida_desejada AT TIME ZONE 'UTC',
      ALTER COLUMN data_chegada_desejada TYPE TIMESTAMPTZ USING data_chegada_desejada AT TIME ZONE 'UTC';

    -- 3. escalas_svo
    ALTER TABLE escalas_svo
      ALTER COLUMN data_inicio TYPE TIMESTAMPTZ USING data_inicio AT TIME ZONE 'UTC',
      ALTER COLUMN data_fim TYPE TIMESTAMPTZ USING data_fim AT TIME ZONE 'UTC';

    -- 4. viagens_frota
    ALTER TABLE viagens_frota
      ALTER COLUMN data_hora_efetiva_saida TYPE TIMESTAMPTZ USING data_hora_efetiva_saida AT TIME ZONE 'UTC',
      ALTER COLUMN data_hora_efetiva_chegada TYPE TIMESTAMPTZ USING data_hora_efetiva_chegada AT TIME ZONE 'UTC';

    -- 5. ordens_svo
    ALTER TABLE ordens_svo
      ALTER COLUMN data_hora_chamado TYPE TIMESTAMPTZ USING data_hora_chamado AT TIME ZONE 'UTC',
      ALTER COLUMN data_hora_chamado SET DEFAULT now(),
      ALTER COLUMN data_hora_saida TYPE TIMESTAMPTZ USING data_hora_saida AT TIME ZONE 'UTC',
      ALTER COLUMN data_hora_conclusao TYPE TIMESTAMPTZ USING data_hora_conclusao AT TIME ZONE 'UTC';
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    -- 1. ordens_svo
    ALTER TABLE ordens_svo
      ALTER COLUMN data_hora_chamado TYPE TIMESTAMP WITHOUT TIME ZONE USING data_hora_chamado AT TIME ZONE 'UTC',
      ALTER COLUMN data_hora_chamado SET DEFAULT now(),
      ALTER COLUMN data_hora_saida TYPE TIMESTAMP WITHOUT TIME ZONE USING data_hora_saida AT TIME ZONE 'UTC',
      ALTER COLUMN data_hora_conclusao TYPE TIMESTAMP WITHOUT TIME ZONE USING data_hora_conclusao AT TIME ZONE 'UTC';

    -- 2. viagens_frota
    ALTER TABLE viagens_frota
      ALTER COLUMN data_hora_efetiva_saida TYPE TIMESTAMP WITHOUT TIME ZONE USING data_hora_efetiva_saida AT TIME ZONE 'UTC',
      ALTER COLUMN data_hora_efetiva_chegada TYPE TIMESTAMP WITHOUT TIME ZONE USING data_hora_efetiva_chegada AT TIME ZONE 'UTC';

    -- 3. escalas_svo
    ALTER TABLE escalas_svo
      ALTER COLUMN data_inicio TYPE TIMESTAMP WITHOUT TIME ZONE USING data_inicio AT TIME ZONE 'UTC',
      ALTER COLUMN data_fim TYPE TIMESTAMP WITHOUT TIME ZONE USING data_fim AT TIME ZONE 'UTC';

    -- 4. solicitacoes_viagem
    ALTER TABLE solicitacoes_viagem
      ALTER COLUMN data_saida_desejada TYPE TIMESTAMP WITHOUT TIME ZONE USING data_saida_desejada AT TIME ZONE 'UTC',
      ALTER COLUMN data_chegada_desejada TYPE TIMESTAMP WITHOUT TIME ZONE USING data_chegada_desejada AT TIME ZONE 'UTC';

    -- 5. auditorias
    ALTER TABLE auditorias
      ALTER COLUMN data_hora TYPE TIMESTAMP WITHOUT TIME ZONE USING data_hora AT TIME ZONE 'UTC',
      ALTER COLUMN data_hora SET DEFAULT now();
  `);
};