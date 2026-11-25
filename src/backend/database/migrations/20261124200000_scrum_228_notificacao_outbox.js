const COLUNAS_OUTBOX_ESPERADAS = {
  id: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  notificacao_id: { data_type: 'integer', is_nullable: 'YES', max_length: null },
  usuario_id: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  evento_tipo: { data_type: 'character varying', is_nullable: 'NO', max_length: 64 },
  categoria: { data_type: 'character varying', is_nullable: 'NO', max_length: 60 },
  operacao: { data_type: 'character varying', is_nullable: 'NO', max_length: 20 },
  referencia_tipo: { data_type: 'character varying', is_nullable: 'YES', max_length: 40 },
  referencia_id: { data_type: 'integer', is_nullable: 'YES', max_length: null },
  ocorrencia_versao: { data_type: 'character varying', is_nullable: 'NO', max_length: 120 },
  chave_idempotencia: { data_type: 'character varying', is_nullable: 'NO', max_length: 190 },
  canal: { data_type: 'character varying', is_nullable: 'NO', max_length: 20 },
  payload_push: { data_type: 'jsonb', is_nullable: 'NO', max_length: null },
  status: { data_type: 'character varying', is_nullable: 'NO', max_length: 24 },
  tentativas: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  max_tentativas: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  proxima_execucao_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
  bloqueado_ate: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  ultimo_erro: { data_type: 'character varying', is_nullable: 'YES', max_length: 500 },
  ultimo_status_http: { data_type: 'integer', is_nullable: 'YES', max_length: null },
  processado_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  criado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
  atualizado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
};

/**
 * Valida se a estrutura da tabela notificacao_outbox da SCRUM-228 no schema alvo
 * corresponde exatamente ao contrato de outbox transacional alinhado a Secao 6.1
 * do Plano da Fase 2 (ON DELETE CASCADE para usuarios, operacao 'Administrativo'/'SVO',
 * limites de tamanho, deduplicacao por evento/destinatario/referencia/ocorrencia sem
 * colisao entre viagens ou coletas distintas, retries e retencao de estados terminais).
 *
 * Decisao arquitetural sobre notificacao_id (sem FK fisica para notificacoes.id):
 * A coluna notificacao_id armazena o identificador logico da notificacao In-App criada
 * na mesma transacao operacional, mas intencionalmente nao declara FOREIGN KEY fisica
 * para notificacoes(id). Isso permite que as politicas de retencao e expurgo operem
 * de forma desacoplada: notificacoes In-App lidas sao expurgadas 30 dias apos lida_em
 * (e nao lidas 90 dias apos criado_em), enquanto registros terminais da outbox seguem
 * sua propria janela de limpeza baseada em processado_em, evitando bloqueios de FK ou
 * exclusoes em cascata nao intencionais entre trilhas de entrega e historico In-App.
 *
 * @param {import('knex').Knex} knex
 */
async function validarCatalogoScrum228(knex) {
  const { rows: schemaRows } = await knex.raw('SELECT current_schema() AS schema_atual');
  const schemaAtual = schemaRows[0]?.schema_atual || 'public';

  // 1. Verifica colunas, tipos, nulabilidade, limites de tamanho e ausencia de default generico em ocorrencia_versao
  const { rows: colsOutbox } = await knex.raw(
    `SELECT column_name, data_type, is_nullable, character_maximum_length, column_default
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'notificacao_outbox'`,
    [schemaAtual]
  );

  const mapaColunas = new Map(colsOutbox.map((c) => [c.column_name, c]));
  for (const [nomeCol, esperado] of Object.entries(COLUNAS_OUTBOX_ESPERADAS)) {
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
        `Estrutura incompativel em notificacao_outbox.${nomeCol}: esperado (${esperado.data_type}, len=${esperado.max_length}, nullable=${esperado.is_nullable}), encontrado ${JSON.stringify(col || null)}`
      );
    }
  }

  const colOcorrencia = mapaColunas.get('ocorrencia_versao');
  if (colOcorrencia?.column_default !== null && colOcorrencia?.column_default !== undefined) {
    throw new Error(
      `Estrutura incompativel em notificacao_outbox.ocorrencia_versao: nao deve possuir default implicito (${colOcorrencia.column_default}).`
    );
  }

  // 2. Verifica constraints obrigatorias (FK com ON DELETE CASCADE, UNIQUEs incluindo referencia_tipo/id e CHECKs)
  const { rows: constraintsRows } = await knex.raw(
    `SELECT t.relname AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = ?
       AND t.relname = 'notificacao_outbox'`,
    [schemaAtual]
  );

  const mapaConstraints = new Map(
    constraintsRows.map((c) => [`${c.table_name}.${c.conname}`, c])
  );

  const constraintsObrigatorias = [
    ['notificacao_outbox.fk_notificacao_outbox_usuario', 'f', 'ON DELETE CASCADE'],
    [
      'notificacao_outbox.uq_notificacao_outbox_usuario_chave_idempotencia',
      'u',
      'usuario_id, chave_idempotencia',
    ],
    [
      'notificacao_outbox.uq_notificacao_outbox_evento_destinatario_ocorrencia',
      'u',
      'evento_tipo, usuario_id, canal, referencia_tipo, referencia_id, ocorrencia_versao',
    ],
    ['notificacao_outbox.chk_notificacao_outbox_campos_obrigatorios', 'c', 'ocorrencia_versao'],
    ['notificacao_outbox.chk_notificacao_outbox_operacao', 'c', 'Administrativo'],
    ['notificacao_outbox.chk_notificacao_outbox_canal', 'c', 'WEB_PUSH'],
    ['notificacao_outbox.chk_notificacao_outbox_status', 'c', 'FALHA_DEFINITIVA'],
    ['notificacao_outbox.chk_notificacao_outbox_tentativas', 'c', 'max_tentativas'],
    ['notificacao_outbox.chk_notificacao_outbox_referencia_coerente', 'c', 'referencia_tipo'],
    ['notificacao_outbox.chk_notificacao_outbox_payload_objeto', 'c', 'jsonb_typeof'],
    ['notificacao_outbox.chk_notificacao_outbox_processamento_coerente', 'c', 'processado_em'],
  ];

  for (const [chave, tipoEsperado, trechoEsperado] of constraintsObrigatorias) {
    const c = mapaConstraints.get(chave);
    if (!c || c.contype !== tipoEsperado || !c.def.includes(trechoEsperado)) {
      throw new Error(`Constraint obrigatoria ausente ou incompativel: ${chave}`);
    }
  }

  // 3. Verifica indices obrigatorios para fila de processamento, consulta por usuario/referencia e expurgo
  const { rows: idxRows } = await knex.raw(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = ?
       AND tablename = 'notificacao_outbox'`,
    [schemaAtual]
  );

  const mapaIdx = new Map(idxRows.map((i) => [i.indexname, i.indexdef]));

  const indicesObrigatorios = [
    ['idx_notificacao_outbox_fila_pendente', '(proxima_execucao_em, id)'],
    ['idx_notificacao_outbox_usuario_status', '(usuario_id, status, criado_em DESC)'],
    ['idx_notificacao_outbox_referencia', '(referencia_tipo, referencia_id)'],
    ['idx_notificacao_outbox_retencao_terminal', '(processado_em, status)'],
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
      `Migration SCRUM-228 bloqueada: tabela base usuarios ausente no schema alvo (${schemaAtual}).`
    );
  }

  // 2. Cria a tabela notificacao_outbox e seus indices caso ainda nao esteja presente no schema.
  // Nota sobre notificacao_id: mantido sem FK fisica para notificacoes(id) para desacoplar
  // o ciclo de retencao da central In-App (30d apos lida_em / 90d apos criado_em) do ciclo
  // de retencao operacional da outbox (expurgo de estados terminais por processado_em).
  const { rows: tabOutboxRows } = await knex.raw(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_name = 'notificacao_outbox'`,
    [schemaAtual]
  );

  if (tabOutboxRows.length === 0) {
    await knex.raw(`
      CREATE TABLE notificacao_outbox (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        notificacao_id INTEGER NULL DEFAULT NULL,
        usuario_id INTEGER NOT NULL,
        evento_tipo VARCHAR(64) NOT NULL,
        categoria VARCHAR(60) NOT NULL DEFAULT 'GERAL',
        operacao VARCHAR(20) NOT NULL,
        referencia_tipo VARCHAR(40) NULL DEFAULT NULL,
        referencia_id INTEGER NULL DEFAULT NULL,
        ocorrencia_versao VARCHAR(120) NOT NULL,
        chave_idempotencia VARCHAR(190) NOT NULL,
        canal VARCHAR(20) NOT NULL DEFAULT 'WEB_PUSH',
        payload_push JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(24) NOT NULL DEFAULT 'PENDENTE',
        tentativas INTEGER NOT NULL DEFAULT 0,
        max_tentativas INTEGER NOT NULL DEFAULT 5,
        proxima_execucao_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        bloqueado_ate TIMESTAMPTZ NULL DEFAULT NULL,
        ultimo_erro VARCHAR(500) NULL DEFAULT NULL,
        ultimo_status_http INTEGER NULL DEFAULT NULL,
        processado_em TIMESTAMPTZ NULL DEFAULT NULL,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_notificacao_outbox_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        CONSTRAINT uq_notificacao_outbox_usuario_chave_idempotencia
          UNIQUE (usuario_id, chave_idempotencia),
        CONSTRAINT uq_notificacao_outbox_evento_destinatario_ocorrencia
          UNIQUE NULLS NOT DISTINCT (
            evento_tipo,
            usuario_id,
            canal,
            referencia_tipo,
            referencia_id,
            ocorrencia_versao
          ),
        CONSTRAINT chk_notificacao_outbox_campos_obrigatorios
          CHECK (
            length(btrim(evento_tipo)) > 0
            AND length(btrim(categoria)) > 0
            AND length(btrim(ocorrencia_versao)) > 0
            AND length(btrim(chave_idempotencia)) > 0
            AND (notificacao_id IS NULL OR notificacao_id > 0)
            AND (ultimo_erro IS NULL OR (length(btrim(ultimo_erro)) > 0 AND char_length(ultimo_erro) <= 500))
          ),
        CONSTRAINT chk_notificacao_outbox_operacao
          CHECK (operacao IN ('Administrativo', 'SVO')),
        CONSTRAINT chk_notificacao_outbox_canal
          CHECK (canal IN ('WEB_PUSH')),
        CONSTRAINT chk_notificacao_outbox_status
          CHECK (status IN ('PENDENTE', 'PROCESSANDO', 'ENVIADO', 'FALHA_DEFINITIVA', 'IGNORADO')),
        CONSTRAINT chk_notificacao_outbox_tentativas
          CHECK (tentativas >= 0 AND max_tentativas >= 1 AND tentativas <= max_tentativas),
        CONSTRAINT chk_notificacao_outbox_referencia_coerente
          CHECK (
            (referencia_tipo IS NULL AND referencia_id IS NULL)
            OR (
              referencia_tipo IS NOT NULL
              AND length(btrim(referencia_tipo)) > 0
              AND referencia_id IS NOT NULL
              AND referencia_id > 0
            )
          ),
        CONSTRAINT chk_notificacao_outbox_payload_objeto
          CHECK (jsonb_typeof(payload_push) = 'object'),
        CONSTRAINT chk_notificacao_outbox_processamento_coerente
          CHECK (
            (status IN ('PENDENTE', 'PROCESSANDO') AND processado_em IS NULL)
            OR (
              status IN ('ENVIADO', 'FALHA_DEFINITIVA', 'IGNORADO')
              AND processado_em IS NOT NULL
              AND processado_em >= criado_em
            )
          )
      );

      CREATE INDEX idx_notificacao_outbox_fila_pendente
        ON notificacao_outbox (proxima_execucao_em ASC, id ASC)
        WHERE status IN ('PENDENTE', 'PROCESSANDO');

      CREATE INDEX idx_notificacao_outbox_usuario_status
        ON notificacao_outbox (usuario_id, status, criado_em DESC);

      CREATE INDEX idx_notificacao_outbox_referencia
        ON notificacao_outbox (referencia_tipo, referencia_id)
        WHERE referencia_tipo IS NOT NULL AND referencia_id IS NOT NULL;

      CREATE INDEX idx_notificacao_outbox_retencao_terminal
        ON notificacao_outbox (processado_em, status)
        WHERE status IN ('ENVIADO', 'FALHA_DEFINITIVA', 'IGNORADO');
    `);
  }

  // 3. Aplica principio de minimo privilegio para a role da aplicacao (SELECT, INSERT, UPDATE sem DELETE)
  const appUser = process.env.POSTGRES_APP_USER;
  if (appUser && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser)) {
    const roleApp = await knex('pg_roles').where({ rolname: appUser }).first('rolname');
    if (roleApp) {
      await knex.raw(
        `REVOKE ALL PRIVILEGES ON TABLE ??.notificacao_outbox FROM ??`,
        [schemaAtual, appUser]
      );
      await knex.raw(
        `GRANT SELECT, INSERT, UPDATE ON TABLE ??.notificacao_outbox TO ??`,
        [schemaAtual, appUser]
      );
      await knex.raw(
        `GRANT USAGE, SELECT ON SEQUENCE ??.notificacao_outbox_id_seq TO ??`,
        [schemaAtual, appUser]
      );
    }
  }

  await validarCatalogoScrum228(knex);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await validarCatalogoScrum228(knex);

  const outboxCount = await knex('notificacao_outbox').count({ total: '*' }).first();
  if (Number(outboxCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem registros em notificacao_outbox. Preserve ou arquive os dados antes de reverter a migration SCRUM-228.'
    );
  }

  await knex.raw(`
    DROP INDEX idx_notificacao_outbox_retencao_terminal;
    DROP INDEX idx_notificacao_outbox_referencia;
    DROP INDEX idx_notificacao_outbox_usuario_status;
    DROP INDEX idx_notificacao_outbox_fila_pendente;
    DROP TABLE notificacao_outbox;
  `);
};

exports.validarCatalogoScrum228 = validarCatalogoScrum228;
