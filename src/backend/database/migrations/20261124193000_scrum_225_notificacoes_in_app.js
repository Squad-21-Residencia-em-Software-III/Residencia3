const COLUNAS_NOTIFICACOES_ESPERADAS = {
  id: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  usuario_id: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  tipo: { data_type: 'character varying', is_nullable: 'NO', max_length: 64 },
  titulo: { data_type: 'character varying', is_nullable: 'NO', max_length: 120 },
  mensagem: { data_type: 'character varying', is_nullable: 'NO', max_length: 280 },
  severidade: { data_type: 'character varying', is_nullable: 'NO', max_length: 20 },
  operacao: { data_type: 'character varying', is_nullable: 'NO', max_length: 20 },
  referencia_tipo: { data_type: 'character varying', is_nullable: 'YES', max_length: 40 },
  referencia_id: { data_type: 'integer', is_nullable: 'YES', max_length: null },
  url_destino: { data_type: 'character varying', is_nullable: 'NO', max_length: 255 },
  chave_idempotencia: { data_type: 'character varying', is_nullable: 'NO', max_length: 190 },
  lida_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  criado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
};

/**
 * Valida se a estrutura da tabela notificacoes da SCRUM-225 no schema alvo
 * corresponde exatamente ao contrato aprovado da Fase 2 (Secao 6.1 do Plano),
 * incluindo tipos, limites de caracteres, ON DELETE CASCADE, severidade,
 * operacao, validacao reforçada de url_destino, idempotencia e indices.
 *
 * @param {import('knex').Knex} knex
 */
async function validarCatalogoScrum225(knex) {
  const { rows: schemaRows } = await knex.raw('SELECT current_schema() AS schema_atual');
  const schemaAtual = schemaRows[0]?.schema_atual || 'public';

  // 1. Verifica colunas, tipos, nulabilidade e limites de tamanho da tabela notificacoes
  const { rows: colsNotificacoes } = await knex.raw(
    `SELECT column_name, data_type, is_nullable, character_maximum_length
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'notificacoes'`,
    [schemaAtual]
  );

  const mapaColunas = new Map(colsNotificacoes.map((c) => [c.column_name, c]));
  for (const [nomeCol, esperado] of Object.entries(COLUNAS_NOTIFICACOES_ESPERADAS)) {
    const col = mapaColunas.get(nomeCol);
    const maxLenAtual =
      col?.character_maximum_length === undefined ? null : col.character_maximum_length;
    const maxLenCompativel =
      esperado.max_length === null ||
      maxLenAtual === undefined ||
      Number(maxLenAtual) === esperado.max_length;

    if (
      !col ||
      col.data_type !== esperado.data_type ||
      col.is_nullable !== esperado.is_nullable ||
      !maxLenCompativel
    ) {
      throw new Error(
        `Estrutura incompativel em notificacoes.${nomeCol}: esperado (${esperado.data_type}, len=${esperado.max_length}, nullable=${esperado.is_nullable}), encontrado ${JSON.stringify(col || null)}`
      );
    }
  }

  // 2. Verifica constraints obrigatorias (FK com ON DELETE CASCADE, UNIQUE e CHECKs)
  const { rows: constraintsRows } = await knex.raw(
    `SELECT t.relname AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = ?
       AND t.relname = 'notificacoes'`,
    [schemaAtual]
  );

  const mapaConstraints = new Map(
    constraintsRows.map((c) => [`${c.table_name}.${c.conname}`, c])
  );

  const constraintsObrigatorias = [
    ['notificacoes.fk_notificacoes_usuario', 'f', 'ON DELETE CASCADE'],
    [
      'notificacoes.uq_notificacoes_usuario_chave_idempotencia',
      'u',
      'usuario_id, chave_idempotencia',
    ],
    ['notificacoes.chk_notificacoes_campos_obrigatorios', 'c', '280'],
    ['notificacoes.chk_notificacoes_severidade', 'c', 'danger'],
    ['notificacoes.chk_notificacoes_operacao', 'c', 'Administrativo'],
    ['notificacoes.chk_notificacoes_referencia_coerente', 'c', 'referencia_tipo'],
    ['notificacoes.chk_notificacoes_url_destino_interna', 'c', '[:cntrl:]'],
    ['notificacoes.chk_notificacoes_leitura_temporal', 'c', 'lida_em'],
  ];

  for (const [chave, tipoEsperado, trechoEsperado] of constraintsObrigatorias) {
    const c = mapaConstraints.get(chave);
    if (!c || c.contype !== tipoEsperado || !c.def.includes(trechoEsperado)) {
      throw new Error(`Constraint obrigatoria ausente ou incompativel: ${chave}`);
    }
  }

  // 3. Verifica indices obrigatorios para paginacao por cursor, nao lidas, referencia e retencao
  const { rows: idxRows } = await knex.raw(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = ?
       AND tablename = 'notificacoes'`,
    [schemaAtual]
  );

  const mapaIdx = new Map(idxRows.map((i) => [i.indexname, i.indexdef]));

  const indicesObrigatorios = [
    ['idx_notificacoes_usuario_cursor', '(usuario_id, criado_em DESC, id DESC)'],
    ['idx_notificacoes_usuario_lida_criado', '(usuario_id, lida_em, criado_em DESC, id DESC)'],
    ['idx_notificacoes_usuario_nao_lidas', 'WHERE (lida_em IS NULL)'],
    ['idx_notificacoes_usuario_referencia', '(usuario_id, referencia_tipo, referencia_id)'],
    ['idx_notificacoes_retencao_lidas', 'WHERE (lida_em IS NOT NULL)'],
    ['idx_notificacoes_criado_em', '(criado_em)'],
  ];

  for (const [nomeIdx, trechoEsperado] of indicesObrigatorios) {
    const def = mapaIdx.get(nomeIdx);
    if (!def || !def.includes(trechoEsperado)) {
      throw new Error(`Indice obrigatorio ausente ou incompativel: ${nomeIdx}`);
    }
  }
}

/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  const { rows: schemaRows } = await knex.raw('SELECT current_schema() AS schema_atual');
  const schemaAtual = schemaRows[0]?.schema_atual || 'public';

  // 1. Garante que a tabela base usuarios existe no schema alvo antes de criar a FK
  const { rows: tabelasBase } = await knex.raw(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_name = 'usuarios'`,
    [schemaAtual]
  );

  if (tabelasBase.length < 1) {
    throw new Error(
      `Migration SCRUM-225 bloqueada: tabela base usuarios ausente no schema alvo (${schemaAtual}).`
    );
  }

  // 2. Cria a tabela notificacoes e seus indices caso ainda nao esteja presente no schema
  const { rows: tabNotificacoesRows } = await knex.raw(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_name = 'notificacoes'`,
    [schemaAtual]
  );

  if (tabNotificacoesRows.length === 0) {
    await knex.raw(`
      CREATE TABLE notificacoes (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        tipo VARCHAR(64) NOT NULL,
        titulo VARCHAR(120) NOT NULL,
        mensagem VARCHAR(280) NOT NULL,
        severidade VARCHAR(20) NOT NULL DEFAULT 'info',
        operacao VARCHAR(20) NOT NULL,
        referencia_tipo VARCHAR(40) NULL DEFAULT NULL,
        referencia_id INTEGER NULL DEFAULT NULL,
        url_destino VARCHAR(255) NOT NULL,
        chave_idempotencia VARCHAR(190) NOT NULL,
        lida_em TIMESTAMPTZ NULL DEFAULT NULL,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_notificacoes_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT uq_notificacoes_usuario_chave_idempotencia
          UNIQUE (usuario_id, chave_idempotencia),
        CONSTRAINT chk_notificacoes_campos_obrigatorios
          CHECK (
            length(btrim(tipo)) > 0
            AND length(btrim(titulo)) > 0
            AND length(btrim(mensagem)) > 0
            AND char_length(mensagem) <= 280
            AND length(btrim(chave_idempotencia)) > 0
          ),
        CONSTRAINT chk_notificacoes_severidade
          CHECK (severidade IN ('info', 'success', 'warning', 'danger')),
        CONSTRAINT chk_notificacoes_operacao
          CHECK (operacao IN ('Administrativo', 'SVO')),
        CONSTRAINT chk_notificacoes_referencia_coerente
          CHECK (
            (referencia_tipo IS NULL AND referencia_id IS NULL)
            OR (
              referencia_tipo IS NOT NULL
              AND length(btrim(referencia_tipo)) > 0
              AND referencia_id IS NOT NULL
              AND referencia_id > 0
            )
          ),
        CONSTRAINT chk_notificacoes_url_destino_interna
          CHECK (
            length(btrim(url_destino)) > 0
            AND url_destino = btrim(url_destino)
            AND url_destino LIKE '/%'
            AND url_destino NOT LIKE '//%'
            AND url_destino !~ '[\\\\[:space:][:cntrl:]]'
            AND url_destino !~* '^[a-z][a-z0-9+.-]*:'
          ),
        CONSTRAINT chk_notificacoes_leitura_temporal
          CHECK (lida_em IS NULL OR lida_em >= criado_em)
      );

      CREATE INDEX idx_notificacoes_usuario_cursor
        ON notificacoes (usuario_id, criado_em DESC, id DESC);

      CREATE INDEX idx_notificacoes_usuario_lida_criado
        ON notificacoes (usuario_id, lida_em, criado_em DESC, id DESC);

      CREATE INDEX idx_notificacoes_usuario_nao_lidas
        ON notificacoes (usuario_id, criado_em DESC, id DESC)
        WHERE lida_em IS NULL;

      CREATE INDEX idx_notificacoes_usuario_referencia
        ON notificacoes (usuario_id, referencia_tipo, referencia_id);

      CREATE INDEX idx_notificacoes_retencao_lidas
        ON notificacoes (lida_em)
        WHERE lida_em IS NOT NULL;

      CREATE INDEX idx_notificacoes_criado_em
        ON notificacoes (criado_em);
    `);
  }

  // 3. Aplica principio de minimo privilegio para a role da aplicacao (SELECT, INSERT, UPDATE sem DELETE)
  const appUser = process.env.POSTGRES_APP_USER;
  if (appUser && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser)) {
    const roleApp = await knex('pg_roles').where({ rolname: appUser }).first('rolname');
    if (roleApp) {
      await knex.raw(
        `REVOKE ALL PRIVILEGES ON TABLE ??.notificacoes FROM ??`,
        [schemaAtual, appUser]
      );
      await knex.raw(
        `GRANT SELECT, INSERT, UPDATE ON TABLE ??.notificacoes TO ??`,
        [schemaAtual, appUser]
      );
      await knex.raw(
        `GRANT USAGE, SELECT ON SEQUENCE ??.notificacoes_id_seq TO ??`,
        [schemaAtual, appUser]
      );
    }
  }

  await validarCatalogoScrum225(knex);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await validarCatalogoScrum225(knex);

  const notificacoesCount = await knex('notificacoes').count({ total: '*' }).first();
  if (Number(notificacoesCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem registros em notificacoes. Preserve ou arquive os dados antes de reverter a migration SCRUM-225.'
    );
  }

  await knex.raw(`
    DROP INDEX idx_notificacoes_criado_em;
    DROP INDEX idx_notificacoes_retencao_lidas;
    DROP INDEX idx_notificacoes_usuario_referencia;
    DROP INDEX idx_notificacoes_usuario_nao_lidas;
    DROP INDEX idx_notificacoes_usuario_lida_criado;
    DROP INDEX idx_notificacoes_usuario_cursor;
    DROP TABLE notificacoes;
  `);
};

exports.validarCatalogoScrum225 = validarCatalogoScrum225;
