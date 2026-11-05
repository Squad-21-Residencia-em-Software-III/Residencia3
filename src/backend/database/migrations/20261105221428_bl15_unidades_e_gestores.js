/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  await knex.raw(`
    -- 1. Cria tabela unidades com os 3 registros fixos
    CREATE TABLE unidades (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(50) NOT NULL UNIQUE,
      tipo VARCHAR(30) NOT NULL,
      CONSTRAINT chk_unidades_nome CHECK (nome IN ('SVO', 'HEMOSE', 'LACEN')),
      CONSTRAINT chk_unidades_tipo CHECK (tipo IN ('SVO', 'ADMINISTRATIVA'))
    );

    INSERT INTO unidades (nome, tipo) VALUES
      ('SVO', 'SVO'),
      ('HEMOSE', 'ADMINISTRATIVA'),
      ('LACEN', 'ADMINISTRATIVA');

    -- 2. Cria tabela associativa gestores_unidades
    CREATE TABLE gestores_unidades (
      unidade_id INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      PRIMARY KEY (unidade_id, usuario_id)
    );

    CREATE INDEX idx_gestores_unidades_usuario_id ON gestores_unidades(usuario_id);

    -- 3. Adiciona coluna unidade_id em solicitacoes_viagem (aceita nulo para antigas)
    ALTER TABLE solicitacoes_viagem
    ADD COLUMN unidade_id INTEGER REFERENCES unidades(id) ON DELETE RESTRICT;

    CREATE INDEX idx_solicitacoes_viagem_unidade_id ON solicitacoes_viagem(unidade_id);
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.raw(`
    ALTER TABLE solicitacoes_viagem DROP COLUMN IF EXISTS unidade_id;
    DROP TABLE IF EXISTS gestores_unidades;
    DROP TABLE IF EXISTS unidades;
  `);
};