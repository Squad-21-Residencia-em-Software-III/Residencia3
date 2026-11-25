const COLUNAS_PUSH_SUBSCRIPTIONS_ESPERADAS = {
  id: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  usuario_id: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  endpoint: { data_type: 'text', is_nullable: 'NO', max_length: null },
  p256dh: { data_type: 'text', is_nullable: 'NO', max_length: null },
  auth: { data_type: 'text', is_nullable: 'NO', max_length: null },
  user_agent: { data_type: 'character varying', is_nullable: 'YES', max_length: 255 },
  status: { data_type: 'character varying', is_nullable: 'NO', max_length: 20 },
  ativa: { data_type: 'boolean', is_nullable: 'NO', max_length: null },
  falhas_consecutivas: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  ultimo_status_http: { data_type: 'integer', is_nullable: 'YES', max_length: null },
  ultimo_sucesso_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  ultimo_erro_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  revogada_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  expirada_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  criado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
  atualizado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
};

const COLUNAS_PREFERENCIAS_ESPERADAS = {
  id: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  usuario_id: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  categoria: { data_type: 'character varying', is_nullable: 'NO', max_length: 60 },
  canal: { data_type: 'character varying', is_nullable: 'NO', max_length: 20 },
  habilitado: { data_type: 'boolean', is_nullable: 'NO', max_length: null },
  criado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
  atualizado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
};

/**
 * Valida se as estruturas de push_subscriptions e preferencias_notificacao da SCRUM-236
 * no schema alvo correspondem exatamente ao contrato aprovado da Fase 2 (Secao 6.1 do Plano
 * e contrato de opt-in/preferencias da SCRUM-237/238), incluindo ON DELETE CASCADE,
 * unicidade e propriedade imutavel de endpoint por usuario, renovacao idempotente quando
 * o limite de dispositivos ativos ja foi atingido (referencia 5), protecao Base64/Base64URL
 * de p256dh/auth, padrao conservador (DEFAULT false) em preferencias_notificacao e indices.
 *
 * @param {import('knex').Knex} knex
 */
async function validarCatalogoScrum236(knex) {
  const { rows: schemaRows } = await knex.raw('SELECT current_schema() AS schema_atual');
  const schemaAtual = schemaRows[0]?.schema_atual || 'public';

  // 1. Verifica colunas de push_subscriptions
  const { rows: colsPush } = await knex.raw(
    `SELECT column_name, data_type, is_nullable, character_maximum_length
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'push_subscriptions'`,
    [schemaAtual]
  );

  const mapaColsPush = new Map(colsPush.map((c) => [c.column_name, c]));
  for (const [nomeCol, esperado] of Object.entries(COLUNAS_PUSH_SUBSCRIPTIONS_ESPERADAS)) {
    const col = mapaColsPush.get(nomeCol);
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
        `Estrutura incompativel em push_subscriptions.${nomeCol}: esperado (${esperado.data_type}, len=${esperado.max_length}, nullable=${esperado.is_nullable}), encontrado ${JSON.stringify(col || null)}`
      );
    }
  }

  // 2. Verifica colunas de preferencias_notificacao e o default conservador (false) em habilitado
  const { rows: colsPref } = await knex.raw(
    `SELECT column_name, data_type, is_nullable, character_maximum_length, column_default
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'preferencias_notificacao'`,
    [schemaAtual]
  );

  const mapaColsPref = new Map(colsPref.map((c) => [c.column_name, c]));
  for (const [nomeCol, esperado] of Object.entries(COLUNAS_PREFERENCIAS_ESPERADAS)) {
    const col = mapaColsPref.get(nomeCol);
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
        `Estrutura incompativel em preferencias_notificacao.${nomeCol}: esperado (${esperado.data_type}, len=${esperado.max_length}, nullable=${esperado.is_nullable}), encontrado ${JSON.stringify(col || null)}`
      );
    }
  }

  const colHabilitado = mapaColsPref.get('habilitado');
  if (
    colHabilitado?.column_default !== undefined &&
    colHabilitado?.column_default !== 'false'
  ) {
    throw new Error(
      `Estrutura incompativel em preferencias_notificacao.habilitado: padrao conservador exige column_default=false, encontrado ${JSON.stringify(colHabilitado?.column_default)}`
    );
  }

  // 3. Verifica constraints obrigatorias (FKs com ON DELETE CASCADE, UNIQUEs e CHECKs)
  const { rows: constraintsRows } = await knex.raw(
    `SELECT t.relname AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = ?
       AND t.relname IN ('push_subscriptions', 'preferencias_notificacao')`,
    [schemaAtual]
  );

  const mapaConstraints = new Map(
    constraintsRows.map((c) => [`${c.table_name}.${c.conname}`, c])
  );

  const constraintsObrigatorias = [
    ['push_subscriptions.fk_push_subscriptions_usuario', 'f', 'ON DELETE CASCADE'],
    ['push_subscriptions.uq_push_subscriptions_endpoint', 'u', 'endpoint'],
    ['push_subscriptions.chk_push_subscriptions_endpoint_https', 'c', 'https://%'],
    ['push_subscriptions.chk_push_subscriptions_chaves_protegidas', 'c', 'A-Za-z0-9+/_=-'],
    ['push_subscriptions.chk_push_subscriptions_user_agent', 'c', 'user_agent'],
    ['push_subscriptions.chk_push_subscriptions_status_ciclo', 'c', 'REVOGADA'],
    ['push_subscriptions.chk_push_subscriptions_falhas', 'c', 'falhas_consecutivas'],
    ['preferencias_notificacao.fk_preferencias_notificacao_usuario', 'f', 'ON DELETE CASCADE'],
    [
      'preferencias_notificacao.uq_preferencias_notificacao_usuario_categoria_canal',
      'u',
      'usuario_id, categoria, canal',
    ],
    ['preferencias_notificacao.chk_preferencias_notificacao_categoria', 'c', 'categoria'],
    ['preferencias_notificacao.chk_preferencias_notificacao_canal', 'c', 'WEB_PUSH'],
    ['preferencias_notificacao.chk_preferencias_notificacao_timestamps', 'c', 'atualizado_em'],
  ];

  for (const [chave, tipoEsperado, trechoEsperado] of constraintsObrigatorias) {
    const c = mapaConstraints.get(chave);
    if (!c || c.contype !== tipoEsperado || !c.def.includes(trechoEsperado)) {
      throw new Error(`Constraint obrigatoria ausente ou incompativel: ${chave}`);
    }
  }

  // 4. Verifica indices obrigatorios
  const { rows: idxRows } = await knex.raw(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = ?
       AND tablename IN ('push_subscriptions', 'preferencias_notificacao')`,
    [schemaAtual]
  );

  const mapaIdx = new Map(idxRows.map((i) => [i.indexname, i.indexdef]));

  const indicesObrigatorios = [
    ['idx_push_subscriptions_usuario_id', '(usuario_id)'],
    ['idx_push_subscriptions_usuario_ativas', 'WHERE (ativa = true)'],
    ['idx_push_subscriptions_retencao_inativas', 'WHERE (ativa = false)'],
    ['idx_preferencias_notificacao_usuario', '(usuario_id, canal)'],
  ];

  for (const [nomeIdx, trechoEsperado] of indicesObrigatorios) {
    const def = mapaIdx.get(nomeIdx);
    if (!def || !def.includes(trechoEsperado)) {
      throw new Error(`Indice obrigatorio ausente ou incompativel: ${nomeIdx}`);
    }
  }

  // 5. Verifica trigger de protecao contra transferencia de endpoint e limite de dispositivos com renovacao idempotente
  const { rows: triggerRows } = await knex.raw(
    `SELECT tg.tgname
     FROM pg_trigger tg
     JOIN pg_class t ON t.oid = tg.tgrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = ?
       AND t.relname = 'push_subscriptions'
       AND tg.tgname = 'trg_validar_regras_push_subscriptions'
       AND NOT tg.tgisinternal`,
    [schemaAtual]
  );

  if (triggerRows.length === 0) {
    throw new Error(
      'Trigger obrigatoria ausente em push_subscriptions: trg_validar_regras_push_subscriptions'
    );
  }
}

/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  const { rows: schemaRows } = await knex.raw('SELECT current_schema() AS schema_atual');
  const schemaAtual = schemaRows[0]?.schema_atual || 'public';

  // 1. Garante que a tabela base usuarios existe no schema alvo
  const { rows: tabelasBase } = await knex.raw(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_name = 'usuarios'`,
    [schemaAtual]
  );

  if (tabelasBase.length < 1) {
    throw new Error(
      `Migration SCRUM-236 bloqueada: tabela base usuarios ausente no schema alvo (${schemaAtual}).`
    );
  }

  // 2. Cria a tabela push_subscriptions, indices e trigger de propriedade/idempotencia/limite de dispositivos
  const { rows: tabPushRows } = await knex.raw(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_name = 'push_subscriptions'`,
    [schemaAtual]
  );

  if (tabPushRows.length === 0) {
    await knex.raw(`
      CREATE TABLE push_subscriptions (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent VARCHAR(255) NULL DEFAULT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ATIVA',
        ativa BOOLEAN NOT NULL DEFAULT true,
        falhas_consecutivas INTEGER NOT NULL DEFAULT 0,
        ultimo_status_http INTEGER NULL DEFAULT NULL,
        ultimo_sucesso_em TIMESTAMPTZ NULL DEFAULT NULL,
        ultimo_erro_em TIMESTAMPTZ NULL DEFAULT NULL,
        revogada_em TIMESTAMPTZ NULL DEFAULT NULL,
        expirada_em TIMESTAMPTZ NULL DEFAULT NULL,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_push_subscriptions_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT uq_push_subscriptions_endpoint
          UNIQUE (endpoint),
        CONSTRAINT chk_push_subscriptions_endpoint_https
          CHECK (
            length(btrim(endpoint)) >= 16
            AND char_length(endpoint) <= 2048
            AND endpoint = btrim(endpoint)
            AND endpoint LIKE 'https://%'
            AND endpoint !~ '[\\\\[:space:][:cntrl:]]'
          ),
        CONSTRAINT chk_push_subscriptions_chaves_protegidas
          CHECK (
            length(btrim(p256dh)) >= 16
            AND char_length(p256dh) <= 512
            AND p256dh = btrim(p256dh)
            AND p256dh ~ '^[A-Za-z0-9+/_=-]+$'
            AND length(btrim(auth)) >= 8
            AND char_length(auth) <= 256
            AND auth = btrim(auth)
            AND auth ~ '^[A-Za-z0-9+/_=-]+$'
            AND p256dh <> auth
          ),
        CONSTRAINT chk_push_subscriptions_user_agent
          CHECK (
            user_agent IS NULL
            OR (
              length(btrim(user_agent)) > 0
              AND char_length(user_agent) <= 255
              AND user_agent !~ '[[:cntrl:]]'
            )
          ),
        CONSTRAINT chk_push_subscriptions_falhas
          CHECK (
            falhas_consecutivas >= 0
            AND atualizado_em >= criado_em
          ),
        CONSTRAINT chk_push_subscriptions_status_ciclo
          CHECK (
            (
              status = 'ATIVA'
              AND ativa = true
              AND revogada_em IS NULL
              AND expirada_em IS NULL
            )
            OR (
              status = 'REVOGADA'
              AND ativa = false
              AND revogada_em IS NOT NULL
              AND revogada_em >= criado_em
            )
            OR (
              status IN ('EXPIRADA', 'INVALIDA')
              AND ativa = false
              AND (
                expirada_em IS NOT NULL
                OR revogada_em IS NOT NULL
                OR ultimo_erro_em IS NOT NULL
              )
            )
          )
      );

      CREATE INDEX idx_push_subscriptions_usuario_id
        ON push_subscriptions (usuario_id);

      CREATE INDEX idx_push_subscriptions_usuario_ativas
        ON push_subscriptions (usuario_id, atualizado_em DESC, id DESC)
        WHERE ativa = true;

      CREATE INDEX idx_push_subscriptions_retencao_inativas
        ON push_subscriptions (atualizado_em, status)
        WHERE ativa = false;

      CREATE FUNCTION validar_regras_push_subscriptions() RETURNS trigger
      LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
      DECLARE
        limite_texto text;
        limite_dispositivos integer := 5;
        ativos_atuais integer := 0;
        dono_existente integer := NULL;
      BEGIN
        IF TG_OP = 'UPDATE' THEN
          IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id THEN
            RAISE EXCEPTION 'Transferencia de endpoint de push_subscriptions entre usuarios distintos nao e permitida.'
              USING ERRCODE = '23514';
          END IF;

          IF NEW.endpoint IS DISTINCT FROM OLD.endpoint THEN
            RAISE EXCEPTION 'Alteracao de endpoint em assinatura existente nao e permitida; crie uma nova assinatura.'
              USING ERRCODE = '23514';
          END IF;
        END IF;

        IF TG_OP = 'INSERT' THEN
          SELECT usuario_id
            INTO dono_existente
            FROM push_subscriptions
           WHERE endpoint = NEW.endpoint
           LIMIT 1;

          IF dono_existente IS NOT NULL AND dono_existente <> NEW.usuario_id THEN
            RAISE EXCEPTION 'Transferencia de endpoint de push_subscriptions entre usuarios distintos nao e permitida.'
              USING ERRCODE = '23514';
          END IF;
        END IF;

        IF NEW.ativa = true THEN
          limite_texto := NULLIF(btrim(COALESCE(current_setting('fsph.push_max_dispositivos_por_usuario', true), '')), '');
          IF limite_texto IS NOT NULL THEN
            limite_dispositivos := limite_texto::integer;
          END IF;

          IF limite_dispositivos < 1 THEN
            RAISE EXCEPTION 'Configuracao fsph.push_max_dispositivos_por_usuario invalida (%).', limite_dispositivos
              USING ERRCODE = '22023';
          END IF;

          -- Serializa verificacao de limite por usuario para evitar corrida entre duas inscricoes simultaneas
          PERFORM 1 FROM usuarios WHERE id = NEW.usuario_id FOR UPDATE;

          -- Desconsidera o proprio endpoint (NEW.endpoint) para que a renovacao idempotente
          -- de um endpoint ja pertencente ao mesmo usuario (via UPDATE ou INSERT ... ON CONFLICT DO UPDATE)
          -- nao consuma uma nova vaga nem seja bloqueada quando o usuario ja possui 5 dispositivos ativos.
          SELECT COUNT(*)::int
            INTO ativos_atuais
            FROM push_subscriptions
           WHERE usuario_id = NEW.usuario_id
             AND ativa = true
             AND endpoint <> NEW.endpoint
             AND (TG_OP = 'INSERT' OR id <> NEW.id);

          IF ativos_atuais >= limite_dispositivos THEN
            RAISE EXCEPTION 'Limite maximo de % dispositivos ativos com Web Push atingido para o usuario %.', limite_dispositivos, NEW.usuario_id
              USING ERRCODE = '23514';
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER trg_validar_regras_push_subscriptions
        BEFORE INSERT OR UPDATE ON push_subscriptions
        FOR EACH ROW EXECUTE FUNCTION validar_regras_push_subscriptions();
    `);
  }

  // 3. Cria a tabela preferencias_notificacao por usuario, categoria e canal (padrao conservador DEFAULT false para WEB_PUSH)
  const { rows: tabPrefRows } = await knex.raw(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_name = 'preferencias_notificacao'`,
    [schemaAtual]
  );

  if (tabPrefRows.length === 0) {
    await knex.raw(`
      CREATE TABLE preferencias_notificacao (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        categoria VARCHAR(60) NOT NULL,
        canal VARCHAR(20) NOT NULL DEFAULT 'WEB_PUSH',
        habilitado BOOLEAN NOT NULL DEFAULT false,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_preferencias_notificacao_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT uq_preferencias_notificacao_usuario_categoria_canal
          UNIQUE (usuario_id, categoria, canal),
        CONSTRAINT chk_preferencias_notificacao_categoria
          CHECK (
            length(btrim(categoria)) >= 2
            AND char_length(categoria) <= 60
            AND categoria = btrim(categoria)
            AND categoria ~ '^[A-Z][A-Z0-9_]{1,59}$'
          ),
        CONSTRAINT chk_preferencias_notificacao_canal
          CHECK (canal IN ('WEB_PUSH')),
        CONSTRAINT chk_preferencias_notificacao_timestamps
          CHECK (atualizado_em >= criado_em)
      );

      CREATE INDEX idx_preferencias_notificacao_usuario
        ON preferencias_notificacao (usuario_id, canal);
    `);
  }

  // 4. Aplica principio de minimo privilegio para a role da aplicacao
  const appUser = process.env.POSTGRES_APP_USER;
  if (appUser && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser)) {
    const roleApp = await knex('pg_roles').where({ rolname: appUser }).first('rolname');
    if (roleApp) {
      await knex.raw(
        `REVOKE ALL PRIVILEGES ON TABLE ??.push_subscriptions, ??.preferencias_notificacao FROM ??`,
        [schemaAtual, schemaAtual, appUser]
      );
      await knex.raw(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ??.push_subscriptions TO ??`,
        [schemaAtual, appUser]
      );
      await knex.raw(
        `GRANT SELECT, INSERT, UPDATE ON TABLE ??.preferencias_notificacao TO ??`,
        [schemaAtual, appUser]
      );
      await knex.raw(
        `GRANT USAGE, SELECT ON SEQUENCE ??.push_subscriptions_id_seq, ??.preferencias_notificacao_id_seq TO ??`,
        [schemaAtual, schemaAtual, appUser]
      );
    }
  }

  await validarCatalogoScrum236(knex);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await validarCatalogoScrum236(knex);

  const pushCount = await knex('push_subscriptions').count({ total: '*' }).first();
  if (Number(pushCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem registros em push_subscriptions. Preserve ou arquive os dados antes de reverter a migration SCRUM-236.'
    );
  }

  const prefCount = await knex('preferencias_notificacao').count({ total: '*' }).first();
  if (Number(prefCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem registros em preferencias_notificacao. Preserve ou arquive os dados antes de reverter a migration SCRUM-236.'
    );
  }

  await knex.raw(`
    DROP INDEX idx_preferencias_notificacao_usuario;
    DROP TABLE preferencias_notificacao;

    DROP TRIGGER trg_validar_regras_push_subscriptions ON push_subscriptions;
    DROP FUNCTION validar_regras_push_subscriptions();
    DROP INDEX idx_push_subscriptions_retencao_inativas;
    DROP INDEX idx_push_subscriptions_usuario_ativas;
    DROP INDEX idx_push_subscriptions_usuario_id;
    DROP TABLE push_subscriptions;
  `);
};

exports.validarCatalogoScrum236 = validarCatalogoScrum236;
