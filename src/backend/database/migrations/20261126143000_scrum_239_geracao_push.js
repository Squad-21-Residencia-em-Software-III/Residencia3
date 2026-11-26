/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE push_subscriptions ADD COLUMN geracao_vinculo integer NOT NULL DEFAULT 1;

    CREATE FUNCTION atualizar_geracao_vinculo_push() RETURNS trigger
    LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
    BEGIN
      IF NEW.ativa AND (NOT OLD.ativa OR
          (NEW.p256dh, NEW.auth) IS DISTINCT FROM (OLD.p256dh, OLD.auth)) THEN
        NEW.geracao_vinculo := OLD.geracao_vinculo + 1;
      END IF;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER trg_atualizar_geracao_vinculo_push
      BEFORE UPDATE OF ativa, p256dh, auth ON push_subscriptions
      FOR EACH ROW EXECUTE FUNCTION atualizar_geracao_vinculo_push();
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    DROP TRIGGER trg_atualizar_geracao_vinculo_push ON push_subscriptions;
    DROP FUNCTION atualizar_geracao_vinculo_push();
    ALTER TABLE push_subscriptions DROP COLUMN geracao_vinculo;
  `);
};
