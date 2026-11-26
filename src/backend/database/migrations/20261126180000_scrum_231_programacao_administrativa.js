/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE viagens_frota
      ADD COLUMN inicio_previsto timestamptz,
      ADD COLUMN fim_previsto timestamptz,
      ADD COLUMN versao_programacao integer NOT NULL DEFAULT 0,
      ADD CONSTRAINT chk_viagem_frota_periodo_planejado CHECK (
        (inicio_previsto IS NULL AND fim_previsto IS NULL) OR
        (inicio_previsto IS NOT NULL AND fim_previsto IS NOT NULL AND fim_previsto > inicio_previsto)
      ),
      ADD CONSTRAINT chk_viagem_frota_versao_programacao CHECK (versao_programacao >= 0);

    CREATE TABLE reprogramacoes_viagem_frota (
      viagem_id integer NOT NULL REFERENCES viagens_frota(id) ON DELETE RESTRICT,
      chave uuid NOT NULL,
      autor_id integer NOT NULL,
      versao_esperada integer NOT NULL CHECK (versao_esperada >= 0),
      inicio_previsto timestamptz NOT NULL,
      fim_previsto timestamptz NOT NULL CHECK (fim_previsto > inicio_previsto),
      auditoria_id integer UNIQUE REFERENCES auditorias(id) ON DELETE RESTRICT,
      criado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (viagem_id, chave)
    );
  `);
  // A role de aplicação só lê e acrescenta comandos; histórico não pode ser reescrito.
  const appUser = process.env.POSTGRES_APP_USER;
  if (appUser && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser) &&
      await knex('pg_roles').where({ rolname: appUser }).first('rolname')) {
    const { rows } = await knex.raw('SELECT current_schema() AS schema');
    const schema = rows[0].schema;
    await knex.raw('REVOKE ALL PRIVILEGES ON TABLE ??.reprogramacoes_viagem_frota FROM ??', [schema, appUser]);
    await knex.raw('GRANT SELECT, INSERT ON TABLE ??.reprogramacoes_viagem_frota TO ??', [schema, appUser]);
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  // Depois de qualquer uso do contrato novo, um rollback de schema perderia dados.
  // LOCK impede que uma primeira gravação entre entre a verificação e a remoção.
  await knex.raw(`
    LOCK TABLE viagens_frota, reprogramacoes_viagem_frota IN ACCESS EXCLUSIVE MODE;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM reprogramacoes_viagem_frota) OR
         EXISTS (SELECT 1 FROM viagens_frota WHERE inicio_previsto IS NOT NULL OR
           fim_previsto IS NOT NULL OR versao_programacao <> 0) THEN
        RAISE EXCEPTION 'SCRUM-231: programação em uso; recuperação exige roll-forward preservando dados';
      END IF;
    END $$;
    DROP TABLE reprogramacoes_viagem_frota;
    ALTER TABLE viagens_frota
      DROP CONSTRAINT chk_viagem_frota_periodo_planejado,
      DROP CONSTRAINT chk_viagem_frota_versao_programacao,
      DROP COLUMN inicio_previsto, DROP COLUMN fim_previsto, DROP COLUMN versao_programacao;
  `);
};
