const { aplicarPrivilegiosSolicitacoesExternasSvo } = require('../privilegiosSolicitacoesExternasSvo.cjs');

exports.up = async (knex) => {
  const [{ schema }] = (await knex.raw('SELECT current_schema() AS schema')).rows;
  await aplicarPrivilegiosSolicitacoesExternasSvo(knex, schema, process.env.POSTGRES_APP_USER, true, true);

  await knex.raw(`
    ALTER TABLE solicitacoes_svo_recuperacoes_tentativa ALTER COLUMN envelope_cifrado DROP NOT NULL;
    UPDATE solicitacoes_svo_recuperacoes_tentativa SET envelope_cifrado = NULL WHERE descartada_em IS NOT NULL;
    ALTER TABLE solicitacoes_svo_recuperacoes_tentativa
      ADD CONSTRAINT chk_svo_recuperacao_envelope_ativo CHECK (
        (descartada_em IS NULL AND envelope_cifrado IS NOT NULL) OR
        (descartada_em IS NOT NULL AND envelope_cifrado IS NULL)
      );

    CREATE FUNCTION descartar_envelope_recuperacao_svo()
    RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW.descartada_em IS NULL THEN RETURN NEW; END IF;
      ELSIF OLD.descartada_em IS NULL AND NEW.descartada_em IS NOT NULL
        AND ROW(NEW.solicitacao_id, NEW.versao_chave, NEW.criado_em, NEW.expira_em)
          IS NOT DISTINCT FROM ROW(OLD.solicitacao_id, OLD.versao_chave, OLD.criado_em, OLD.expira_em)
        AND (OLD.expira_em <= clock_timestamp() OR EXISTS (
          SELECT FROM solicitacoes_svo_credenciais_externas c
           WHERE c.solicitacao_id = OLD.solicitacao_id AND c.revogada_em IS NOT NULL
        ))
      THEN
        NEW.envelope_cifrado := NULL;
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Descarte inválido de comprovante externo SVO' USING ERRCODE = '23514';
    END $$;
    REVOKE ALL ON FUNCTION descartar_envelope_recuperacao_svo() FROM PUBLIC;

    CREATE TRIGGER trg_svo_recuperacao_descartar_envelope
      BEFORE INSERT OR UPDATE ON solicitacoes_svo_recuperacoes_tentativa
      FOR EACH ROW EXECUTE FUNCTION descartar_envelope_recuperacao_svo();
  `);
};

exports.down = async (knex) => {
  await knex.raw('LOCK TABLE solicitacoes_svo_recuperacoes_tentativa IN ACCESS EXCLUSIVE MODE');
  if (await knex('solicitacoes_svo_recuperacoes_tentativa').whereNull('envelope_cifrado').first('solicitacao_id')) {
    throw new Error('Rollback bloqueado: material criptográfico já descartado. Utilize roll-forward.');
  }
  await knex.raw(`
    DROP TRIGGER trg_svo_recuperacao_descartar_envelope ON solicitacoes_svo_recuperacoes_tentativa;
    DROP FUNCTION descartar_envelope_recuperacao_svo();
    ALTER TABLE solicitacoes_svo_recuperacoes_tentativa
      DROP CONSTRAINT chk_svo_recuperacao_envelope_ativo,
      ALTER COLUMN envelope_cifrado SET NOT NULL;
  `);
};
