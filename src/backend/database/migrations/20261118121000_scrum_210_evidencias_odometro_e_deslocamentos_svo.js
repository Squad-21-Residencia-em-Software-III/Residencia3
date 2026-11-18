const COLUNAS_DESLOCAMENTOS_SVO_ESPERADAS = {
  id: { data_type: 'integer', is_nullable: 'NO' },
  veiculo_id: { data_type: 'integer', is_nullable: 'NO' },
  motorista_id: { data_type: 'integer', is_nullable: 'NO' },
  iniciado_por: { data_type: 'integer', is_nullable: 'NO' },
  finalizado_por: { data_type: 'integer', is_nullable: 'YES' },
  km_inicial: { data_type: 'integer', is_nullable: 'NO' },
  km_final: { data_type: 'integer', is_nullable: 'YES' },
  data_hora_saida: { data_type: 'timestamp with time zone', is_nullable: 'NO' },
  data_hora_conclusao: { data_type: 'timestamp with time zone', is_nullable: 'YES' },
  status: { data_type: 'character varying', is_nullable: 'NO' },
};

const COLUNAS_DESLOCAMENTOS_SVO_ORDENS_ESPERADAS = {
  id: { data_type: 'integer', is_nullable: 'NO' },
  deslocamento_svo_id: { data_type: 'integer', is_nullable: 'NO' },
  ordem_svo_id: { data_type: 'integer', is_nullable: 'NO' },
  vinculado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO' },
  vinculado_por: { data_type: 'integer', is_nullable: 'NO' },
};

const COLUNAS_EVIDENCIAS_ODOMETRO_ESPERADAS = {
  id: { data_type: 'integer', is_nullable: 'NO' },
  tipo_operacao: { data_type: 'character varying', is_nullable: 'NO' },
  fase: { data_type: 'character varying', is_nullable: 'NO' },
  viagem_frota_id: { data_type: 'integer', is_nullable: 'YES' },
  deslocamento_svo_id: { data_type: 'integer', is_nullable: 'YES' },
  ordem_svo_id: { data_type: 'integer', is_nullable: 'YES' },
  veiculo_id: { data_type: 'integer', is_nullable: 'NO' },
  motorista_id: { data_type: 'integer', is_nullable: 'NO' },
  motorista_usuario_id: { data_type: 'integer', is_nullable: 'NO' },
  km_registrado: { data_type: 'integer', is_nullable: 'NO' },
  modalidade: { data_type: 'character varying', is_nullable: 'NO' },
  status: { data_type: 'character varying', is_nullable: 'NO' },
  storage_key: { data_type: 'character varying', is_nullable: 'YES' },
  mime_type: { data_type: 'character varying', is_nullable: 'YES' },
  tamanho_bytes: { data_type: 'integer', is_nullable: 'YES' },
  sha256: { data_type: 'character', is_nullable: 'YES' },
  excecao_aprovada_por: { data_type: 'integer', is_nullable: 'YES' },
  excecao_aprovada_em: { data_type: 'timestamp with time zone', is_nullable: 'YES' },
  excecao_justificativa: { data_type: 'text', is_nullable: 'YES' },
  conclusao_operacao_em: { data_type: 'timestamp with time zone', is_nullable: 'YES' },
  retencao_ate: { data_type: 'timestamp with time zone', is_nullable: 'YES' },
  preservacao_legal: { data_type: 'boolean', is_nullable: 'NO' },
  preservacao_motivo: { data_type: 'text', is_nullable: 'YES' },
  expurgado_em: { data_type: 'timestamp with time zone', is_nullable: 'YES' },
  expurgado_por: { data_type: 'integer', is_nullable: 'YES' },
  expurgo_motivo: { data_type: 'character varying', is_nullable: 'YES' },
  registrado_por: { data_type: 'integer', is_nullable: 'NO' },
  auditoria_id: { data_type: 'integer', is_nullable: 'YES' },
  criado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO' },
};

async function validarColunasTabela(knex, schemaAtual, nomeTabela, colunasEsperadas) {
  const { rows } = await knex.raw(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = ?`,
    [schemaAtual, nomeTabela]
  );

  const mapa = new Map(rows.map((c) => [c.column_name, c]));
  for (const [nomeCol, esperado] of Object.entries(colunasEsperadas)) {
    const col = mapa.get(nomeCol);
    if (!col || col.data_type !== esperado.data_type || col.is_nullable !== esperado.is_nullable) {
      throw new Error(
        `Estrutura incompativel em ${nomeTabela}.${nomeCol}: esperado (${esperado.data_type}, nullable=${esperado.is_nullable}), encontrado ${JSON.stringify(col || null)}`
      );
    }
  }
}

/**
 * Valida se o catalogo do PostgreSQL contem exatamente as tabelas, colunas,
 * FKs, constraints CHECK e indices parciais/unicos definidos pela SCRUM-210.
 *
 * @param {import('knex').Knex} knex
 */
async function validarCatalogoScrum210(knex) {
  const { rows: schemaRows } = await knex.raw('SELECT current_schema() AS schema_atual');
  const schemaAtual = schemaRows[0]?.schema_atual || 'public';

  await validarColunasTabela(
    knex,
    schemaAtual,
    'deslocamentos_svo',
    COLUNAS_DESLOCAMENTOS_SVO_ESPERADAS
  );
  await validarColunasTabela(
    knex,
    schemaAtual,
    'deslocamentos_svo_ordens',
    COLUNAS_DESLOCAMENTOS_SVO_ORDENS_ESPERADAS
  );
  await validarColunasTabela(
    knex,
    schemaAtual,
    'evidencias_odometro',
    COLUNAS_EVIDENCIAS_ODOMETRO_ESPERADAS
  );

  const { rows: constraintsRows } = await knex.raw(
    `SELECT t.relname AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = ?
       AND t.relname IN ('deslocamentos_svo', 'deslocamentos_svo_ordens', 'evidencias_odometro')`,
    [schemaAtual]
  );

  const mapaConstraints = new Map(
    constraintsRows.map((c) => [`${c.table_name}.${c.conname}`, c])
  );

  const constraintsObrigatorias = [
    ['deslocamentos_svo.fk_deslocamentos_svo_veiculo', 'f', 'ON DELETE RESTRICT'],
    ['deslocamentos_svo.fk_deslocamentos_svo_motorista', 'f', 'ON DELETE RESTRICT'],
    ['deslocamentos_svo.fk_deslocamentos_svo_iniciado_por', 'f', 'ON DELETE RESTRICT'],
    ['deslocamentos_svo.fk_deslocamentos_svo_finalizado_por', 'f', 'ON DELETE RESTRICT'],
    ['deslocamentos_svo.chk_deslocamentos_svo_km_inicial', 'c', 'km_inicial'],
    ['deslocamentos_svo.chk_deslocamentos_svo_km_coerente', 'c', 'km_final'],
    ['deslocamentos_svo.chk_deslocamentos_svo_status', 'c', 'EM_CURSO'],
    ['deslocamentos_svo.chk_deslocamentos_svo_conclusao', 'c', 'data_hora_conclusao'],
    ['deslocamentos_svo_ordens.fk_deslocamentos_svo_ordens_deslocamento', 'f', 'ON DELETE RESTRICT'],
    ['deslocamentos_svo_ordens.fk_deslocamentos_svo_ordens_ordem', 'f', 'ON DELETE RESTRICT'],
    ['deslocamentos_svo_ordens.fk_deslocamentos_svo_ordens_usuario', 'f', 'ON DELETE RESTRICT'],
    ['deslocamentos_svo_ordens.uq_deslocamentos_svo_ordens_ordem', 'u', 'ordem_svo_id'],
    ['deslocamentos_svo_ordens.uq_deslocamentos_svo_ordens_par', 'u', 'deslocamento_svo_id'],
    ['evidencias_odometro.fk_evidencias_odometro_viagem_frota', 'f', 'ON DELETE RESTRICT'],
    ['evidencias_odometro.fk_evidencias_odometro_deslocamento_svo', 'f', 'ON DELETE RESTRICT'],
    ['evidencias_odometro.fk_evidencias_odometro_ordem_svo', 'f', 'ON DELETE RESTRICT'],
    ['evidencias_odometro.fk_evidencias_odometro_veiculo', 'f', 'ON DELETE RESTRICT'],
    ['evidencias_odometro.fk_evidencias_odometro_motorista', 'f', 'ON DELETE RESTRICT'],
    ['evidencias_odometro.fk_evidencias_odometro_motorista_usuario', 'f', 'ON DELETE RESTRICT'],
    ['evidencias_odometro.fk_evidencias_odometro_excecao_aprovador', 'f', 'ON DELETE RESTRICT'],
    ['evidencias_odometro.fk_evidencias_odometro_expurgado_por', 'f', 'ON DELETE RESTRICT'],
    ['evidencias_odometro.fk_evidencias_odometro_registrado_por', 'f', 'ON DELETE RESTRICT'],
    ['evidencias_odometro.fk_evidencias_odometro_auditoria', 'f', 'ON DELETE RESTRICT'],
    ['evidencias_odometro.chk_evidencias_odometro_tipo_operacao', 'c', 'ADMINISTRATIVA'],
    ['evidencias_odometro.chk_evidencias_odometro_fase', 'c', 'SAIDA'],
    ['evidencias_odometro.chk_evidencias_odometro_origem_operacao', 'c', 'viagem_frota_id'],
    ['evidencias_odometro.chk_evidencias_odometro_km', 'c', 'km_registrado'],
    ['evidencias_odometro.chk_evidencias_odometro_modalidade', 'c', 'EXCECAO_GESTOR'],
    ['evidencias_odometro.chk_evidencias_odometro_status', 'c', 'EXPURGADA_RETENCAO'],
    ['evidencias_odometro.chk_evidencias_odometro_storage_key_segura', 'c', 'storage_key'],
    ['evidencias_odometro.chk_evidencias_odometro_mime', 'c', 'image/jpeg'],
    ['evidencias_odometro.chk_evidencias_odometro_tamanho', 'c', 'tamanho_bytes'],
    ['evidencias_odometro.chk_evidencias_odometro_sha256', 'c', 'sha256'],
    ['evidencias_odometro.chk_evidencias_odometro_modalidade_dados', 'c', 'excecao_aprovada_por'],
    ['evidencias_odometro.chk_evidencias_odometro_retencao', 'c', 'retencao_ate'],
  ];

  for (const [chave, tipoEsperado, trechoEsperado] of constraintsObrigatorias) {
    const c = mapaConstraints.get(chave);
    if (!c || c.contype !== tipoEsperado || !c.def.includes(trechoEsperado)) {
      throw new Error(`Constraint obrigatoria ausente ou incompativel: ${chave}`);
    }
  }

  const { rows: idxRows } = await knex.raw(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = ?
       AND tablename IN ('deslocamentos_svo', 'deslocamentos_svo_ordens', 'evidencias_odometro')`,
    [schemaAtual]
  );

  const mapaIdx = new Map(idxRows.map((i) => [i.indexname, i.indexdef]));

  const indicesObrigatorios = [
    ['uq_deslocamentos_svo_veiculo_em_curso', 'UNIQUE INDEX'],
    ['uq_deslocamentos_svo_motorista_em_curso', 'UNIQUE INDEX'],
    ['idx_deslocamentos_svo_status_conclusao', 'data_hora_conclusao'],
    ['idx_deslocamentos_svo_ordens_deslocamento', 'deslocamento_svo_id'],
    ['uq_evidencias_odometro_viagem_frota_fase_ativa', 'UNIQUE INDEX'],
    ['uq_evidencias_odometro_deslocamento_svo_fase_ativa', 'UNIQUE INDEX'],
    ['uq_evidencias_odometro_storage_key', 'UNIQUE INDEX'],
    ['idx_evidencias_odometro_retencao_pendente', 'retencao_ate'],
    ['idx_evidencias_odometro_operacao_criado', 'tipo_operacao'],
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

  // 1. Verifica existencia previa das tabelas de origem obrigatorias
  const { rows: tabelasOrigem } = await knex.raw(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_name IN ('viagens_frota', 'ordens_svo', 'veiculos', 'motoristas', 'usuarios', 'auditorias')`,
    [schemaAtual]
  );
  if (tabelasOrigem.length < 6) {
    throw new Error(
      'Migration SCRUM-210 bloqueada: tabelas base (viagens_frota, ordens_svo, veiculos, motoristas, usuarios, auditorias) ausentes no schema alvo.'
    );
  }

  // 2. Cria tabela deslocamentos_svo (identidade estavel do deslocamento fisico compartilhado SVO)
  const { rows: tabDeslocamentos } = await knex.raw(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = 'deslocamentos_svo'`,
    [schemaAtual]
  );
  if (tabDeslocamentos.length === 0) {
    await knex.raw(`
      CREATE TABLE deslocamentos_svo (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        veiculo_id INTEGER NOT NULL,
        motorista_id INTEGER NOT NULL,
        iniciado_por INTEGER NOT NULL,
        finalizado_por INTEGER NULL DEFAULT NULL,
        km_inicial INTEGER NOT NULL,
        km_final INTEGER NULL DEFAULT NULL,
        data_hora_saida TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        data_hora_conclusao TIMESTAMPTZ NULL DEFAULT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'EM_CURSO',
        CONSTRAINT fk_deslocamentos_svo_veiculo
          FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE RESTRICT,
        CONSTRAINT fk_deslocamentos_svo_motorista
          FOREIGN KEY (motorista_id) REFERENCES motoristas(id) ON DELETE RESTRICT,
        CONSTRAINT fk_deslocamentos_svo_iniciado_por
          FOREIGN KEY (iniciado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT fk_deslocamentos_svo_finalizado_por
          FOREIGN KEY (finalizado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT chk_deslocamentos_svo_km_inicial
          CHECK (km_inicial >= 0),
        CONSTRAINT chk_deslocamentos_svo_km_coerente
          CHECK (km_final IS NULL OR km_final >= km_inicial),
        CONSTRAINT chk_deslocamentos_svo_status
          CHECK (status IN ('EM_CURSO', 'CONCLUIDO', 'CANCELADO')),
        CONSTRAINT chk_deslocamentos_svo_conclusao
          CHECK (
            (
              status = 'CONCLUIDO'
              AND data_hora_conclusao IS NOT NULL
              AND finalizado_por IS NOT NULL
              AND km_final IS NOT NULL
              AND data_hora_conclusao >= data_hora_saida
            )
            OR (
              status IN ('EM_CURSO', 'CANCELADO')
              AND data_hora_conclusao IS NULL
              AND finalizado_por IS NULL
              AND km_final IS NULL
            )
          )
      );

      CREATE UNIQUE INDEX uq_deslocamentos_svo_veiculo_em_curso
        ON deslocamentos_svo (veiculo_id)
        WHERE status = 'EM_CURSO';

      CREATE UNIQUE INDEX uq_deslocamentos_svo_motorista_em_curso
        ON deslocamentos_svo (motorista_id)
        WHERE status = 'EM_CURSO';

      CREATE INDEX idx_deslocamentos_svo_status_conclusao
        ON deslocamentos_svo (status, data_hora_conclusao);
    `);
  }

  // 3. Cria tabela deslocamentos_svo_ordens (vinculo estavel entre ordens_svo e deslocamento fisico)
  const { rows: tabDeslocamentosOrdens } = await knex.raw(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = 'deslocamentos_svo_ordens'`,
    [schemaAtual]
  );
  if (tabDeslocamentosOrdens.length === 0) {
    await knex.raw(`
      CREATE TABLE deslocamentos_svo_ordens (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        deslocamento_svo_id INTEGER NOT NULL,
        ordem_svo_id INTEGER NOT NULL,
        vinculado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        vinculado_por INTEGER NOT NULL,
        CONSTRAINT fk_deslocamentos_svo_ordens_deslocamento
          FOREIGN KEY (deslocamento_svo_id) REFERENCES deslocamentos_svo(id) ON DELETE RESTRICT,
        CONSTRAINT fk_deslocamentos_svo_ordens_ordem
          FOREIGN KEY (ordem_svo_id) REFERENCES ordens_svo(id) ON DELETE RESTRICT,
        CONSTRAINT fk_deslocamentos_svo_ordens_usuario
          FOREIGN KEY (vinculado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT uq_deslocamentos_svo_ordens_ordem
          UNIQUE (ordem_svo_id),
        CONSTRAINT uq_deslocamentos_svo_ordens_par
          UNIQUE (deslocamento_svo_id, ordem_svo_id)
      );

      CREATE INDEX idx_deslocamentos_svo_ordens_deslocamento
        ON deslocamentos_svo_ordens (deslocamento_svo_id);
    `);
  }

  // 4. Cria tabela evidencias_odometro (metadados imutaveis de foto ou excecao autorizada e retencao de 12 meses)
  const { rows: tabEvidencias } = await knex.raw(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = 'evidencias_odometro'`,
    [schemaAtual]
  );
  if (tabEvidencias.length === 0) {
    await knex.raw(`
      CREATE TABLE evidencias_odometro (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        tipo_operacao VARCHAR(20) NOT NULL,
        fase VARCHAR(20) NOT NULL,
        viagem_frota_id INTEGER NULL DEFAULT NULL,
        deslocamento_svo_id INTEGER NULL DEFAULT NULL,
        ordem_svo_id INTEGER NULL DEFAULT NULL,
        veiculo_id INTEGER NOT NULL,
        motorista_id INTEGER NOT NULL,
        motorista_usuario_id INTEGER NOT NULL,
        km_registrado INTEGER NOT NULL,
        modalidade VARCHAR(20) NOT NULL DEFAULT 'FOTO',
        status VARCHAR(30) NOT NULL DEFAULT 'ATIVA',
        storage_key VARCHAR(512) NULL DEFAULT NULL,
        mime_type VARCHAR(100) NULL DEFAULT NULL,
        tamanho_bytes INTEGER NULL DEFAULT NULL,
        sha256 CHAR(64) NULL DEFAULT NULL,
        excecao_aprovada_por INTEGER NULL DEFAULT NULL,
        excecao_aprovada_em TIMESTAMPTZ NULL DEFAULT NULL,
        excecao_justificativa TEXT NULL DEFAULT NULL,
        conclusao_operacao_em TIMESTAMPTZ NULL DEFAULT NULL,
        retencao_ate TIMESTAMPTZ NULL DEFAULT NULL,
        preservacao_legal BOOLEAN NOT NULL DEFAULT false,
        preservacao_motivo TEXT NULL DEFAULT NULL,
        expurgado_em TIMESTAMPTZ NULL DEFAULT NULL,
        expurgado_por INTEGER NULL DEFAULT NULL,
        expurgo_motivo VARCHAR(100) NULL DEFAULT NULL,
        registrado_por INTEGER NOT NULL,
        auditoria_id INTEGER NULL DEFAULT NULL,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_evidencias_odometro_viagem_frota
          FOREIGN KEY (viagem_frota_id) REFERENCES viagens_frota(id) ON DELETE RESTRICT,
        CONSTRAINT fk_evidencias_odometro_deslocamento_svo
          FOREIGN KEY (deslocamento_svo_id) REFERENCES deslocamentos_svo(id) ON DELETE RESTRICT,
        CONSTRAINT fk_evidencias_odometro_ordem_svo
          FOREIGN KEY (ordem_svo_id) REFERENCES ordens_svo(id) ON DELETE RESTRICT,
        CONSTRAINT fk_evidencias_odometro_veiculo
          FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE RESTRICT,
        CONSTRAINT fk_evidencias_odometro_motorista
          FOREIGN KEY (motorista_id) REFERENCES motoristas(id) ON DELETE RESTRICT,
        CONSTRAINT fk_evidencias_odometro_motorista_usuario
          FOREIGN KEY (motorista_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT fk_evidencias_odometro_excecao_aprovador
          FOREIGN KEY (excecao_aprovada_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT fk_evidencias_odometro_expurgado_por
          FOREIGN KEY (expurgado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT fk_evidencias_odometro_registrado_por
          FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT fk_evidencias_odometro_auditoria
          FOREIGN KEY (auditoria_id) REFERENCES auditorias(id) ON DELETE RESTRICT,
        CONSTRAINT chk_evidencias_odometro_tipo_operacao
          CHECK (tipo_operacao IN ('ADMINISTRATIVA', 'SVO')),
        CONSTRAINT chk_evidencias_odometro_fase
          CHECK (fase IN ('SAIDA', 'CHEGADA')),
        CONSTRAINT chk_evidencias_odometro_origem_operacao
          CHECK (
            (
              tipo_operacao = 'ADMINISTRATIVA'
              AND viagem_frota_id IS NOT NULL
              AND deslocamento_svo_id IS NULL
              AND ordem_svo_id IS NULL
            )
            OR (
              tipo_operacao = 'SVO'
              AND viagem_frota_id IS NULL
              AND deslocamento_svo_id IS NOT NULL
            )
            -- Foto provisoria SVO enviada antes de a coleta iniciar (o deslocamento ainda nao existe).
            -- A confirmacao na transicao preenche deslocamento_svo_id (SCRUM-208, PR #172).
            OR (
              tipo_operacao = 'SVO'
              AND viagem_frota_id IS NULL
              AND deslocamento_svo_id IS NULL
              AND ordem_svo_id IS NOT NULL
              AND modalidade = 'FOTO'
              AND status IN ('STAGING', 'REJEITADA')
            )
          ),
        CONSTRAINT chk_evidencias_odometro_km
          CHECK (km_registrado >= 0),
        CONSTRAINT chk_evidencias_odometro_modalidade
          CHECK (modalidade IN ('FOTO', 'EXCECAO_GESTOR')),
        CONSTRAINT chk_evidencias_odometro_status
          CHECK (status IN ('STAGING', 'ATIVA', 'SUBSTITUIDA', 'REJEITADA', 'EXPURGADA_RETENCAO')),
        CONSTRAINT chk_evidencias_odometro_storage_key_segura
          CHECK (
            storage_key IS NULL
            OR (
              length(btrim(storage_key)) > 0
              AND position('..' in storage_key) = 0
              AND lower(left(btrim(storage_key), 5)) <> 'data:'
              AND lower(left(btrim(storage_key), 5)) <> 'http:'
              AND lower(left(btrim(storage_key), 6)) <> 'https:'
            )
          ),
        CONSTRAINT chk_evidencias_odometro_mime
          CHECK (
            mime_type IS NULL
            OR mime_type IN ('image/jpeg', 'image/png', 'image/webp')
          ),
        CONSTRAINT chk_evidencias_odometro_tamanho
          CHECK (
            tamanho_bytes IS NULL
            OR (tamanho_bytes > 0 AND tamanho_bytes <= 15728640)
          ),
        CONSTRAINT chk_evidencias_odometro_sha256
          CHECK (
            sha256 IS NULL
            OR sha256 ~ '^[0-9a-f]{64}$'
          ),
        CONSTRAINT chk_evidencias_odometro_modalidade_dados
          CHECK (
            (
              modalidade = 'FOTO'
              AND status IN ('STAGING', 'ATIVA', 'SUBSTITUIDA', 'REJEITADA')
              AND storage_key IS NOT NULL
              AND mime_type IS NOT NULL
              AND tamanho_bytes IS NOT NULL
              AND sha256 IS NOT NULL
              AND excecao_aprovada_por IS NULL
              AND excecao_aprovada_em IS NULL
              AND excecao_justificativa IS NULL
            )
            OR (
              modalidade = 'FOTO'
              AND status = 'EXPURGADA_RETENCAO'
              AND storage_key IS NULL
              AND mime_type IS NOT NULL
              AND tamanho_bytes IS NOT NULL
              AND sha256 IS NOT NULL
              AND excecao_aprovada_por IS NULL
              AND excecao_aprovada_em IS NULL
              AND excecao_justificativa IS NULL
            )
            OR (
              modalidade = 'EXCECAO_GESTOR'
              AND status IN ('ATIVA', 'SUBSTITUIDA')
              AND storage_key IS NULL
              AND mime_type IS NULL
              AND tamanho_bytes IS NULL
              AND sha256 IS NULL
              AND excecao_aprovada_por IS NOT NULL
              AND excecao_aprovada_em IS NOT NULL
              AND excecao_justificativa IS NOT NULL
              AND length(btrim(excecao_justificativa)) >= 10
              AND excecao_aprovada_por <> motorista_usuario_id
            )
          ),
        CONSTRAINT chk_evidencias_odometro_retencao
          CHECK (
            (
              (
                retencao_ate IS NULL
                AND conclusao_operacao_em IS NULL
              )
              OR (
                conclusao_operacao_em IS NOT NULL
                AND retencao_ate IS NOT NULL
                AND retencao_ate >= conclusao_operacao_em + interval '12 months'
              )
            )
            AND (
              (
                status <> 'EXPURGADA_RETENCAO'
                AND expurgado_em IS NULL
                AND expurgado_por IS NULL
                AND expurgo_motivo IS NULL
              )
              OR (
                status = 'EXPURGADA_RETENCAO'
                AND modalidade = 'FOTO'
                AND preservacao_legal = false
                AND conclusao_operacao_em IS NOT NULL
                AND retencao_ate IS NOT NULL
                AND expurgado_em IS NOT NULL
                AND expurgado_em >= retencao_ate
                AND expurgo_motivo IS NOT NULL
                AND length(btrim(expurgo_motivo)) > 0
              )
            )
          )
      );

      CREATE UNIQUE INDEX uq_evidencias_odometro_viagem_frota_fase_ativa
        ON evidencias_odometro (viagem_frota_id, fase)
        WHERE tipo_operacao = 'ADMINISTRATIVA' AND status IN ('ATIVA', 'EXPURGADA_RETENCAO');

      CREATE UNIQUE INDEX uq_evidencias_odometro_deslocamento_svo_fase_ativa
        ON evidencias_odometro (deslocamento_svo_id, fase)
        WHERE tipo_operacao = 'SVO' AND status IN ('ATIVA', 'EXPURGADA_RETENCAO');

      CREATE UNIQUE INDEX uq_evidencias_odometro_storage_key
        ON evidencias_odometro (storage_key)
        WHERE storage_key IS NOT NULL;

      CREATE INDEX idx_evidencias_odometro_retencao_pendente
        ON evidencias_odometro (retencao_ate)
        WHERE modalidade = 'FOTO'
          AND status = 'ATIVA'
          AND preservacao_legal = false
          AND retencao_ate IS NOT NULL;

      CREATE INDEX idx_evidencias_odometro_operacao_criado
        ON evidencias_odometro (tipo_operacao, criado_em DESC, id DESC);
    `);
  }

  // 5. Se a role da aplicacao existir e estivermos no schema public, concede apenas SELECT/INSERT/UPDATE (sem DELETE)
  const appUser = process.env.POSTGRES_APP_USER;
  if (schemaAtual === 'public' && appUser && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser)) {
    const roleApp = await knex('pg_roles').where({ rolname: appUser }).first('rolname');
    if (roleApp) {
      await knex.raw(
        `REVOKE ALL PRIVILEGES ON TABLE ??.deslocamentos_svo, ??.deslocamentos_svo_ordens, ??.evidencias_odometro FROM ??`,
        [schemaAtual, schemaAtual, schemaAtual, appUser]
      );
      await knex.raw(
        `GRANT SELECT, INSERT, UPDATE ON TABLE ??.deslocamentos_svo, ??.deslocamentos_svo_ordens, ??.evidencias_odometro TO ??`,
        [schemaAtual, schemaAtual, schemaAtual, appUser]
      );
      await knex.raw(
        `GRANT USAGE, SELECT ON SEQUENCE ??.deslocamentos_svo_id_seq, ??.deslocamentos_svo_ordens_id_seq, ??.evidencias_odometro_id_seq TO ??`,
        [schemaAtual, schemaAtual, schemaAtual, appUser]
      );
    }
  }

  await validarCatalogoScrum210(knex);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await validarCatalogoScrum210(knex);

  const evidenciasCount = await knex('evidencias_odometro').count({ total: '*' }).first();
  if (Number(evidenciasCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem registros em evidencias_odometro. Preserve ou arquive os metadados antes de reverter a migration SCRUM-210.'
    );
  }

  const vinculosOrdensCount = await knex('deslocamentos_svo_ordens').count({ total: '*' }).first();
  if (Number(vinculosOrdensCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem vinculos registrados em deslocamentos_svo_ordens. Preserve ou arquive os dados antes de reverter a migration SCRUM-210.'
    );
  }

  const deslocamentosCount = await knex('deslocamentos_svo').count({ total: '*' }).first();
  if (Number(deslocamentosCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem deslocamentos registrados em deslocamentos_svo. Preserve ou arquive os dados antes de reverter a migration SCRUM-210.'
    );
  }

  await knex.raw(`
    DROP INDEX idx_evidencias_odometro_operacao_criado;
    DROP INDEX idx_evidencias_odometro_retencao_pendente;
    DROP INDEX uq_evidencias_odometro_storage_key;
    DROP INDEX uq_evidencias_odometro_deslocamento_svo_fase_ativa;
    DROP INDEX uq_evidencias_odometro_viagem_frota_fase_ativa;
    DROP TABLE evidencias_odometro;

    DROP INDEX idx_deslocamentos_svo_ordens_deslocamento;
    DROP TABLE deslocamentos_svo_ordens;

    DROP INDEX idx_deslocamentos_svo_status_conclusao;
    DROP INDEX uq_deslocamentos_svo_motorista_em_curso;
    DROP INDEX uq_deslocamentos_svo_veiculo_em_curso;
    DROP TABLE deslocamentos_svo;
  `);
};

exports.validarCatalogoScrum210 = validarCatalogoScrum210;
