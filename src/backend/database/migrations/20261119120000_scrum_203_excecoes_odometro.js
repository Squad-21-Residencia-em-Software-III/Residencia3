/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    CREATE TABLE excecoes_odometro (
      id serial PRIMARY KEY,
      tipo_operacao varchar(15) NOT NULL,
      viagem_frota_id integer REFERENCES viagens_frota(id) ON DELETE RESTRICT,
      ordem_svo_id integer REFERENCES ordens_svo(id) ON DELETE RESTRICT,
      fase varchar(7) NOT NULL CHECK (fase IN ('SAIDA', 'CHEGADA')),
      veiculo_id integer NOT NULL REFERENCES veiculos(id) ON DELETE RESTRICT,
      motorista_id integer NOT NULL REFERENCES motoristas(id) ON DELETE RESTRICT,
      solicitada_por integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      motivo varchar(500) NOT NULL CHECK (length(btrim(motivo)) >= 10),
      solicitada_em timestamptz NOT NULL DEFAULT clock_timestamp(),
      status varchar(8) NOT NULL DEFAULT 'PENDENTE',
      decidida_por integer REFERENCES usuarios(id) ON DELETE RESTRICT,
      decidida_em timestamptz,
      justificativa varchar(500),
      auditoria_decisao_id integer REFERENCES auditorias(id) ON DELETE RESTRICT,
      encerrada_em timestamptz,
      evidencia_id integer UNIQUE REFERENCES evidencias_odometro(id) ON DELETE RESTRICT,
      CHECK (
        (tipo_operacao = 'ADMINISTRATIVA' AND viagem_frota_id IS NOT NULL AND ordem_svo_id IS NULL) OR
        (tipo_operacao = 'SVO' AND viagem_frota_id IS NULL AND ordem_svo_id IS NOT NULL)
      ),
      CHECK (
        (status = 'PENDENTE' AND decidida_por IS NULL AND decidida_em IS NULL
          AND justificativa IS NULL AND auditoria_decisao_id IS NULL) OR
        (status IN ('APROVADA', 'RECUSADA') AND decidida_por IS NOT NULL AND decidida_por <> solicitada_por
          AND decidida_em IS NOT NULL AND justificativa IS NOT NULL AND length(btrim(justificativa)) >= 10
          AND auditoria_decisao_id IS NOT NULL)
      ),
      CHECK (evidencia_id IS NULL OR (status = 'APROVADA' AND encerrada_em IS NOT NULL))
    );

    CREATE UNIQUE INDEX uq_excecao_odometro_admin_aberta ON excecoes_odometro (viagem_frota_id, fase)
      WHERE viagem_frota_id IS NOT NULL AND encerrada_em IS NULL AND status IN ('PENDENTE', 'APROVADA');
    CREATE UNIQUE INDEX uq_excecao_odometro_svo_aberta ON excecoes_odometro (ordem_svo_id, fase)
      WHERE ordem_svo_id IS NOT NULL AND encerrada_em IS NULL AND status IN ('PENDENTE', 'APROVADA');
    CREATE INDEX idx_excecao_odometro_admin ON excecoes_odometro (viagem_frota_id, fase, id DESC);
    CREATE INDEX idx_excecao_odometro_svo ON excecoes_odometro (ordem_svo_id, fase, id DESC);
    CREATE INDEX idx_excecao_odometro_fila ON excecoes_odometro (tipo_operacao, id)
      WHERE status = 'PENDENTE' AND encerrada_em IS NULL;

    CREATE FUNCTION encerrar_excecoes_odometro() RETURNS trigger
    LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
    DECLARE
      administrativo boolean := TG_TABLE_NAME = 'viagens_frota';
      realocada boolean := (NEW.veiculo_id, NEW.motorista_id) IS DISTINCT FROM (OLD.veiculo_id, OLD.motorista_id);
    BEGIN
      IF NOT administrativo THEN
        realocada := realocada OR (NEW.inicio_previsto, NEW.fim_previsto) IS DISTINCT FROM
          (OLD.inicio_previsto, OLD.fim_previsto);
      END IF;

      IF realocada OR NEW.status IS DISTINCT FROM OLD.status THEN
        UPDATE excecoes_odometro
        SET encerrada_em = clock_timestamp()
        WHERE encerrada_em IS NULL AND status IN ('PENDENTE', 'APROVADA')
          AND ((administrativo AND viagem_frota_id = NEW.id) OR (NOT administrativo AND ordem_svo_id = NEW.id))
          AND (realocada OR NEW.status = 'CANCELADA'
            OR (fase = 'SAIDA' AND OLD.status IN ('AGENDADA', 'ALOCADA'))
            OR (fase = 'CHEGADA' AND NEW.status = 'CONCLUIDA'));
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER encerrar_excecoes_viagem_frota
      AFTER UPDATE OF veiculo_id, motorista_id, status ON viagens_frota
      FOR EACH ROW EXECUTE FUNCTION encerrar_excecoes_odometro();
    CREATE TRIGGER encerrar_excecoes_ordem_svo
      AFTER UPDATE OF veiculo_id, motorista_id, status, inicio_previsto, fim_previsto ON ordens_svo
      FOR EACH ROW EXECUTE FUNCTION encerrar_excecoes_odometro();
  `);

  const appUser = process.env.POSTGRES_APP_USER;
  if (appUser) {
    const { rows: [registro] } = await knex.raw('SELECT current_schema() AS schema');
    await knex.raw('GRANT SELECT, INSERT, UPDATE ON TABLE ??.excecoes_odometro TO ??', [registro.schema, appUser]);
    await knex.raw('REVOKE DELETE ON TABLE ??.excecoes_odometro FROM ??', [registro.schema, appUser]);
    await knex.raw('GRANT USAGE, SELECT ON SEQUENCE ??.excecoes_odometro_id_seq TO ??', [registro.schema, appUser]);
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  if (await knex('excecoes_odometro').first('id')) throw new Error('A reversão apagaria o histórico de exceções.');
  await knex.raw(`
    DROP TRIGGER encerrar_excecoes_ordem_svo ON ordens_svo;
    DROP TRIGGER encerrar_excecoes_viagem_frota ON viagens_frota;
    DROP FUNCTION encerrar_excecoes_odometro();
    DROP TABLE excecoes_odometro;
  `);
};
