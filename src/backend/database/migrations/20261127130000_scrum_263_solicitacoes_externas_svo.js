const COLUNAS_SOLICITACOES_SVO_SCRUM263_ESPERADAS = {
  registrante_id: { data_type: 'integer', is_nullable: 'YES', max_length: null },
  canal_origem: { data_type: 'character varying', is_nullable: 'NO', max_length: 20 },
  protocolo: { data_type: 'character varying', is_nullable: 'YES', max_length: 64 },
};

const COLUNAS_DADOS_EXTERNOS_ESPERADAS = {
  solicitacao_id: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  nome_solicitante: { data_type: 'character varying', is_nullable: 'YES', max_length: 150 },
  telefone_solicitante: { data_type: 'character varying', is_nullable: 'YES', max_length: 30 },
  email_solicitante: { data_type: 'character varying', is_nullable: 'YES', max_length: 255 },
  cpf_solicitante: { data_type: 'character', is_nullable: 'YES', max_length: 11 },
  tipo_solicitante: { data_type: 'character varying', is_nullable: 'NO', max_length: 20 },
  nome_instituicao: { data_type: 'character varying', is_nullable: 'YES', max_length: 180 },
  nome_falecido: { data_type: 'character varying', is_nullable: 'YES', max_length: 150 },
  documento_falecido: { data_type: 'character varying', is_nullable: 'YES', max_length: 60 },
  endereco_ocorrencia: { data_type: 'character varying', is_nullable: 'YES', max_length: 255 },
  numero_imovel: { data_type: 'character varying', is_nullable: 'YES', max_length: 30 },
  sem_numero_imovel: { data_type: 'boolean', is_nullable: 'NO', max_length: null },
  complemento_ocorrencia: { data_type: 'character varying', is_nullable: 'YES', max_length: 120 },
  ponto_referencia: { data_type: 'character varying', is_nullable: 'YES', max_length: 255 },
  latitude_ocorrencia: { data_type: 'double precision', is_nullable: 'YES', max_length: null },
  longitude_ocorrencia: { data_type: 'double precision', is_nullable: 'YES', max_length: null },
  fora_area_cobertura: { data_type: 'boolean', is_nullable: 'NO', max_length: null },
  descricao_ocorrencia: { data_type: 'character varying', is_nullable: 'YES', max_length: 2000 },
  data_hora_ocorrencia: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
  informacoes_medicas: { data_type: 'character varying', is_nullable: 'YES', max_length: 2000 },
  ciencia_aviso_privacidade: { data_type: 'boolean', is_nullable: 'NO', max_length: null },
  versao_aviso_privacidade: { data_type: 'character varying', is_nullable: 'NO', max_length: 40 },
  ciencia_registrada_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
  motivo_recusa_publico: { data_type: 'character varying', is_nullable: 'YES', max_length: 500 },
  cancelamento_solicitado_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  cancelamento_motivo: { data_type: 'character varying', is_nullable: 'YES', max_length: 500 },
  cancelamento_status: { data_type: 'character varying', is_nullable: 'YES', max_length: 20 },
  cancelamento_decidido_por: { data_type: 'integer', is_nullable: 'YES', max_length: null },
  cancelamento_decidido_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  cancelamento_justificativa_decisao: { data_type: 'character varying', is_nullable: 'YES', max_length: 500 },
  versao_dados: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  encerrado_operacional_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  consulta_publica_expira_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  retencao_ate: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  preservacao_legal: { data_type: 'boolean', is_nullable: 'NO', max_length: null },
  preservacao_motivo: { data_type: 'text', is_nullable: 'YES', max_length: null },
  anonimizado_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  expurgado_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  expurgado_por: { data_type: 'integer', is_nullable: 'YES', max_length: null },
  expurgo_motivo: { data_type: 'character varying', is_nullable: 'YES', max_length: 100 },
  criado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
  atualizado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
};

const COLUNAS_CREDENCIAIS_EXTERNAS_ESPERADAS = {
  solicitacao_id: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  segredo_digest: { data_type: 'character', is_nullable: 'NO', max_length: 64 },
  algoritmo_digest: { data_type: 'character varying', is_nullable: 'NO', max_length: 30 },
  versao_credencial: { data_type: 'integer', is_nullable: 'NO', max_length: null },
  chave_idempotencia_criacao: { data_type: 'character varying', is_nullable: 'YES', max_length: 120 },
  payload_criacao_digest: { data_type: 'character', is_nullable: 'YES', max_length: 64 },
  prova_tentativa_digest: { data_type: 'character', is_nullable: 'YES', max_length: 64 },
  envelope_recuperacao: { data_type: 'text', is_nullable: 'YES', max_length: null },
  recuperacao_expira_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  emitida_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
  valida_ate: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  revogada_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  revogada_motivo: { data_type: 'character varying', is_nullable: 'YES', max_length: 120 },
  ultimo_acesso_em: { data_type: 'timestamp with time zone', is_nullable: 'YES', max_length: null },
  atualizado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO', max_length: null },
};

async function validarColunasEspecificadas(knex, schemaAtual, nomeTabela, colunasEsperadas) {
  const { rows } = await knex.raw(
    `SELECT column_name, data_type, is_nullable, character_maximum_length
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = ?`,
    [schemaAtual, nomeTabela]
  );

  const mapa = new Map(rows.map((c) => [c.column_name, c]));
  for (const [nomeCol, esperado] of Object.entries(colunasEsperadas)) {
    const col = mapa.get(nomeCol);
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
        `Estrutura incompativel em ${nomeTabela}.${nomeCol}: esperado (${esperado.data_type}, len=${esperado.max_length}, nullable=${esperado.is_nullable}), encontrado ${JSON.stringify(col || null)}`
      );
    }
  }
}

/**
 * Valida se o catalogo do PostgreSQL contem exatamente as alteracoes aditivas
 * em solicitacoes_svo e as tabelas protegidas solicitacoes_svo_dados_externos e
 * solicitacoes_svo_credenciais_externas definidas pela SCRUM-263.
 *
 * @param {import('knex').Knex} knex
 */
async function validarCatalogoScrum263(knex) {
  const { rows: schemaRows } = await knex.raw('SELECT current_schema() AS schema_atual');
  const schemaAtual = schemaRows[0]?.schema_atual || 'public';

  // 1. Verifica colunas em solicitacoes_svo, solicitacoes_svo_dados_externos e solicitacoes_svo_credenciais_externas
  await validarColunasEspecificadas(
    knex,
    schemaAtual,
    'solicitacoes_svo',
    COLUNAS_SOLICITACOES_SVO_SCRUM263_ESPERADAS
  );
  await validarColunasEspecificadas(
    knex,
    schemaAtual,
    'solicitacoes_svo_dados_externos',
    COLUNAS_DADOS_EXTERNOS_ESPERADAS
  );
  await validarColunasEspecificadas(
    knex,
    schemaAtual,
    'solicitacoes_svo_credenciais_externas',
    COLUNAS_CREDENCIAIS_EXTERNAS_ESPERADAS
  );

  // 2. Verifica constraints obrigatorias (FKs, UNIQUEs e CHECKs condicionais)
  const { rows: constraintsRows } = await knex.raw(
    `SELECT t.relname AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = ?
       AND t.relname IN (
         'solicitacoes_svo',
         'solicitacoes_svo_dados_externos',
         'solicitacoes_svo_credenciais_externas'
       )`,
    [schemaAtual]
  );

  const mapaConstraints = new Map(
    constraintsRows.map((c) => [`${c.table_name}.${c.conname}`, c])
  );

  const constraintsObrigatorias = [
    ['solicitacoes_svo.chk_solicitacoes_svo_canal_origem', 'c', 'EXTERNA'],
    ['solicitacoes_svo.chk_solicitacoes_svo_canal_registrante_protocolo', 'c', 'registrante_id'],
    ['solicitacoes_svo.uq_solicitacoes_svo_protocolo', 'u', 'protocolo'],
    [
      'solicitacoes_svo_dados_externos.fk_solicitacoes_svo_dados_externos_solicitacao',
      'f',
      'ON DELETE RESTRICT',
    ],
    [
      'solicitacoes_svo_dados_externos.fk_solicitacoes_svo_dados_externos_cancelamento_decisor',
      'f',
      'ON DELETE RESTRICT',
    ],
    [
      'solicitacoes_svo_dados_externos.fk_solicitacoes_svo_dados_externos_expurgado_por',
      'f',
      'ON DELETE RESTRICT',
    ],
    [
      'solicitacoes_svo_dados_externos.chk_solicitacoes_svo_dados_externos_tipo_instituicao',
      'c',
      'INSTITUICAO',
    ],
    [
      'solicitacoes_svo_dados_externos.chk_solicitacoes_svo_dados_externos_numero_imovel',
      'c',
      'sem_numero_imovel',
    ],
    [
      'solicitacoes_svo_dados_externos.chk_solicitacoes_svo_dados_externos_coordenadas',
      'c',
      'latitude_ocorrencia',
    ],
    [
      'solicitacoes_svo_dados_externos.chk_solicitacoes_svo_dados_externos_ciclo_pessoal',
      'c',
      'cpf_solicitante',
    ],
    [
      'solicitacoes_svo_dados_externos.chk_solicitacoes_svo_dados_externos_aviso_privacidade',
      'c',
      'ciencia_aviso_privacidade',
    ],
    [
      'solicitacoes_svo_dados_externos.chk_solicitacoes_svo_dados_externos_cancelamento',
      'c',
      'cancelamento_status',
    ],
    [
      'solicitacoes_svo_dados_externos.chk_solicitacoes_svo_dados_externos_retencao',
      'c',
      'retencao_ate',
    ],
    [
      'solicitacoes_svo_dados_externos.chk_solicitacoes_svo_dados_externos_versao',
      'c',
      'versao_dados',
    ],
    [
      'solicitacoes_svo_credenciais_externas.fk_solicitacoes_svo_credenciais_externas_solicitacao',
      'f',
      'ON DELETE RESTRICT',
    ],
    [
      'solicitacoes_svo_credenciais_externas.uq_solicitacoes_svo_credenciais_idempotencia',
      'u',
      'chave_idempotencia_criacao',
    ],
    [
      'solicitacoes_svo_credenciais_externas.chk_solicitacoes_svo_credenciais_digest',
      'c',
      'segredo_digest',
    ],
    [
      'solicitacoes_svo_credenciais_externas.chk_solicitacoes_svo_credenciais_idempotencia',
      'c',
      'payload_criacao_digest',
    ],
    [
      'solicitacoes_svo_credenciais_externas.chk_solicitacoes_svo_credenciais_ciclo',
      'c',
      'revogada_em',
    ],
  ];

  for (const [chave, tipoEsperado, trechoEsperado] of constraintsObrigatorias) {
    const c = mapaConstraints.get(chave);
    if (!c || c.contype !== tipoEsperado || !c.def.includes(trechoEsperado)) {
      throw new Error(`Constraint obrigatoria ausente ou incompativel: ${chave}`);
    }
  }

  // Garante tambem que a FK de registrante_id para usuarios continua ativa em solicitacoes_svo
  const fkRegistrante = constraintsRows.find(
    (c) =>
      c.table_name === 'solicitacoes_svo' &&
      c.contype === 'f' &&
      c.def.includes('FOREIGN KEY (registrante_id) REFERENCES')
  );
  if (!fkRegistrante) {
    throw new Error(
      'Constraint FK de registrante_id para usuarios ausente em solicitacoes_svo.'
    );
  }

  // 3. Verifica indices obrigatorios
  const { rows: idxRows } = await knex.raw(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = ?
       AND tablename IN (
         'solicitacoes_svo',
         'solicitacoes_svo_dados_externos',
         'solicitacoes_svo_credenciais_externas'
       )`,
    [schemaAtual]
  );

  const mapaIdx = new Map(idxRows.map((i) => [i.indexname, i.indexdef]));

  const indicesObrigatorios = [
    ['idx_solicitacoes_svo_canal_status_id', '(canal_origem, status, id DESC)'],
    ['idx_solicitacoes_svo_dados_externos_ocorrencia', '(data_hora_ocorrencia DESC)'],
    ['idx_solicitacoes_svo_dados_externos_cancelamento_pendente', 'cancelamento_status'],
    ['idx_solicitacoes_svo_dados_externos_retencao_pendente', '(retencao_ate)'],
    ['idx_solicitacoes_svo_credenciais_validade', '(valida_ate)'],
  ];

  for (const [nomeIdx, trechoEsperado] of indicesObrigatorios) {
    const def = mapaIdx.get(nomeIdx);
    if (!def || !def.includes(trechoEsperado)) {
      throw new Error(`Indice obrigatorio ausente ou incompativel: ${nomeIdx}`);
    }
  }

  // 4. Verifica triggers de integridade de canal EXTERNA e bloqueio de mudanca de canal
  const { rows: triggerRows } = await knex.raw(
    `SELECT t.relname AS table_name, tg.tgname
     FROM pg_trigger tg
     JOIN pg_class t ON t.oid = tg.tgrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = ?
       AND NOT tg.tgisinternal
       AND tg.tgname IN (
         'trg_validar_vinculo_canal_externo_dados_svo',
         'trg_validar_vinculo_canal_externo_credenciais_svo',
         'trg_proteger_integridade_canal_solicitacao_svo'
       )`,
    [schemaAtual]
  );

  const triggersEncontradas = new Set(triggerRows.map((r) => `${r.table_name}.${r.tgname}`));
  const triggersObrigatorias = [
    'solicitacoes_svo_dados_externos.trg_validar_vinculo_canal_externo_dados_svo',
    'solicitacoes_svo_credenciais_externas.trg_validar_vinculo_canal_externo_credenciais_svo',
    'solicitacoes_svo.trg_proteger_integridade_canal_solicitacao_svo',
  ];

  for (const tg of triggersObrigatorias) {
    if (!triggersEncontradas.has(tg)) {
      throw new Error(`Trigger obrigatoria ausente: ${tg}`);
    }
  }
}

/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  const { rows: schemaRows } = await knex.raw('SELECT current_schema() AS schema_atual');
  const schemaAtual = schemaRows[0]?.schema_atual || 'public';

  // 1. Garante que as tabelas base usuarios e solicitacoes_svo existem no schema alvo
  const { rows: tabelasBase } = await knex.raw(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_name IN ('usuarios', 'solicitacoes_svo')`,
    [schemaAtual]
  );

  if (tabelasBase.length < 2) {
    throw new Error(
      `Migration SCRUM-263 bloqueada: tabelas base (usuarios, solicitacoes_svo) ausentes no schema alvo (${schemaAtual}).`
    );
  }

  // 2. Evolucao aditiva em solicitacoes_svo (registrante_id nullable, canal_origem, protocolo opaco)
  const { rows: colsSvoExistentes } = await knex.raw(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'solicitacoes_svo'
       AND column_name IN ('canal_origem', 'protocolo')`,
    [schemaAtual]
  );
  const nomesColsSvo = new Set(colsSvoExistentes.map((c) => c.column_name));

  if (!nomesColsSvo.has('canal_origem') && !nomesColsSvo.has('protocolo')) {
    await knex.raw(`
      ALTER TABLE solicitacoes_svo
        ADD COLUMN canal_origem VARCHAR(20) NULL,
        ADD COLUMN protocolo VARCHAR(64) NULL DEFAULT NULL;

      UPDATE solicitacoes_svo
        SET canal_origem = 'INTERNA'
        WHERE canal_origem IS NULL;

      ALTER TABLE solicitacoes_svo
        ALTER COLUMN canal_origem SET DEFAULT 'INTERNA',
        ALTER COLUMN canal_origem SET NOT NULL,
        ALTER COLUMN registrante_id DROP NOT NULL;

      ALTER TABLE solicitacoes_svo
        ADD CONSTRAINT chk_solicitacoes_svo_canal_origem
          CHECK (canal_origem IN ('INTERNA', 'EXTERNA')),
        ADD CONSTRAINT chk_solicitacoes_svo_canal_registrante_protocolo
          CHECK (
            (
              canal_origem = 'INTERNA'
              AND registrante_id IS NOT NULL
              AND protocolo IS NULL
            )
            OR (
              canal_origem = 'EXTERNA'
              AND registrante_id IS NULL
              AND protocolo IS NOT NULL
              AND length(btrim(protocolo)) >= 12
              AND char_length(protocolo) <= 64
              AND protocolo = btrim(protocolo)
              AND protocolo ~ '^[A-Z0-9][A-Z0-9-]{10,62}[A-Z0-9]$'
            )
          ),
        ADD CONSTRAINT uq_solicitacoes_svo_protocolo
          UNIQUE (protocolo);

      CREATE INDEX idx_solicitacoes_svo_canal_status_id
        ON solicitacoes_svo (canal_origem, status, id DESC);
    `);
  }

  // 3. Cria a estrutura protegida solicitacoes_svo_dados_externos (1:1 com solicitacoes_svo EXTERNA)
  const { rows: tabDadosExternosRows } = await knex.raw(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_name = 'solicitacoes_svo_dados_externos'`,
    [schemaAtual]
  );

  if (tabDadosExternosRows.length === 0) {
    await knex.raw(`
      CREATE TABLE solicitacoes_svo_dados_externos (
        solicitacao_id INTEGER PRIMARY KEY,
        nome_solicitante VARCHAR(150) NULL,
        telefone_solicitante VARCHAR(30) NULL,
        email_solicitante VARCHAR(255) NULL,
        cpf_solicitante CHAR(11) NULL,
        tipo_solicitante VARCHAR(20) NOT NULL,
        nome_instituicao VARCHAR(180) NULL DEFAULT NULL,
        nome_falecido VARCHAR(150) NULL,
        documento_falecido VARCHAR(60) NULL DEFAULT NULL,
        endereco_ocorrencia VARCHAR(255) NULL,
        numero_imovel VARCHAR(30) NULL DEFAULT NULL,
        sem_numero_imovel BOOLEAN NOT NULL DEFAULT false,
        complemento_ocorrencia VARCHAR(120) NULL DEFAULT NULL,
        ponto_referencia VARCHAR(255) NULL DEFAULT NULL,
        latitude_ocorrencia DOUBLE PRECISION NULL DEFAULT NULL,
        longitude_ocorrencia DOUBLE PRECISION NULL DEFAULT NULL,
        fora_area_cobertura BOOLEAN NOT NULL DEFAULT false,
        descricao_ocorrencia VARCHAR(2000) NULL,
        data_hora_ocorrencia TIMESTAMPTZ NOT NULL,
        informacoes_medicas VARCHAR(2000) NULL DEFAULT NULL,
        ciencia_aviso_privacidade BOOLEAN NOT NULL,
        versao_aviso_privacidade VARCHAR(40) NOT NULL,
        ciencia_registrada_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        motivo_recusa_publico VARCHAR(500) NULL DEFAULT NULL,
        cancelamento_solicitado_em TIMESTAMPTZ NULL DEFAULT NULL,
        cancelamento_motivo VARCHAR(500) NULL DEFAULT NULL,
        cancelamento_status VARCHAR(20) NULL DEFAULT NULL,
        cancelamento_decidido_por INTEGER NULL DEFAULT NULL,
        cancelamento_decidido_em TIMESTAMPTZ NULL DEFAULT NULL,
        cancelamento_justificativa_decisao VARCHAR(500) NULL DEFAULT NULL,
        versao_dados INTEGER NOT NULL DEFAULT 1,
        encerrado_operacional_em TIMESTAMPTZ NULL DEFAULT NULL,
        consulta_publica_expira_em TIMESTAMPTZ NULL DEFAULT NULL,
        retencao_ate TIMESTAMPTZ NULL DEFAULT NULL,
        preservacao_legal BOOLEAN NOT NULL DEFAULT false,
        preservacao_motivo TEXT NULL DEFAULT NULL,
        anonimizado_em TIMESTAMPTZ NULL DEFAULT NULL,
        expurgado_em TIMESTAMPTZ NULL DEFAULT NULL,
        expurgado_por INTEGER NULL DEFAULT NULL,
        expurgo_motivo VARCHAR(100) NULL DEFAULT NULL,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_solicitacoes_svo_dados_externos_solicitacao
          FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes_svo(id) ON DELETE RESTRICT,
        CONSTRAINT fk_solicitacoes_svo_dados_externos_cancelamento_decisor
          FOREIGN KEY (cancelamento_decidido_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT fk_solicitacoes_svo_dados_externos_expurgado_por
          FOREIGN KEY (expurgado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT chk_solicitacoes_svo_dados_externos_tipo_instituicao
          CHECK (
            (
              tipo_solicitante = 'PESSOA_FISICA'
              AND nome_instituicao IS NULL
            )
            OR (
              tipo_solicitante = 'INSTITUICAO'
              AND (
                (anonimizado_em IS NULL AND expurgado_em IS NULL AND nome_instituicao IS NOT NULL AND length(btrim(nome_instituicao)) >= 2)
                OR ((anonimizado_em IS NOT NULL OR expurgado_em IS NOT NULL) AND (nome_instituicao IS NULL OR length(btrim(nome_instituicao)) >= 2))
              )
            )
          ),
        CONSTRAINT chk_solicitacoes_svo_dados_externos_numero_imovel
          CHECK (
            (
              sem_numero_imovel = true
              AND numero_imovel IS NULL
            )
            OR (
              sem_numero_imovel = false
              AND (
                (anonimizado_em IS NULL AND expurgado_em IS NULL AND numero_imovel IS NOT NULL AND length(btrim(numero_imovel)) >= 1 AND numero_imovel = btrim(numero_imovel))
                OR ((anonimizado_em IS NOT NULL OR expurgado_em IS NOT NULL) AND numero_imovel IS NULL)
              )
            )
          ),
        CONSTRAINT chk_solicitacoes_svo_dados_externos_coordenadas
          CHECK (
            (latitude_ocorrencia IS NULL AND longitude_ocorrencia IS NULL)
            OR (
              latitude_ocorrencia IS NOT NULL
              AND longitude_ocorrencia IS NOT NULL
              AND latitude_ocorrencia NOT IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
              AND longitude_ocorrencia NOT IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)
              AND latitude_ocorrencia >= -90
              AND latitude_ocorrencia <= 90
              AND longitude_ocorrencia >= -180
              AND longitude_ocorrencia <= 180
            )
          ),
        CONSTRAINT chk_solicitacoes_svo_dados_externos_ciclo_pessoal
          CHECK (
            (
              anonimizado_em IS NULL
              AND expurgado_em IS NULL
              AND expurgado_por IS NULL
              AND expurgo_motivo IS NULL
              AND nome_solicitante IS NOT NULL
              AND length(btrim(nome_solicitante)) >= 2
              AND telefone_solicitante IS NOT NULL
              AND length(btrim(telefone_solicitante)) >= 8
              AND telefone_solicitante = btrim(telefone_solicitante)
              AND telefone_solicitante ~ '^[0-9+() -]{8,30}$'
              AND email_solicitante IS NOT NULL
              AND length(btrim(email_solicitante)) >= 5
              AND email_solicitante = btrim(email_solicitante)
              AND email_solicitante !~ '[[:space:][:cntrl:]]'
              AND position('@' in email_solicitante) > 1
              AND cpf_solicitante IS NOT NULL
              AND cpf_solicitante ~ '^[0-9]{11}$'
              AND cpf_solicitante !~ '^([0-9])\\1{10}$'
              AND nome_falecido IS NOT NULL
              AND length(btrim(nome_falecido)) >= 2
              AND endereco_ocorrencia IS NOT NULL
              AND length(btrim(endereco_ocorrencia)) >= 3
              AND descricao_ocorrencia IS NOT NULL
              AND length(btrim(descricao_ocorrencia)) >= 5
            )
            OR (
              (anonimizado_em IS NOT NULL OR expurgado_em IS NOT NULL)
              AND nome_solicitante IS NULL
              AND telefone_solicitante IS NULL
              AND email_solicitante IS NULL
              AND cpf_solicitante IS NULL
              AND nome_falecido IS NULL
              AND documento_falecido IS NULL
              AND informacoes_medicas IS NULL
              AND complemento_ocorrencia IS NULL
              AND ponto_referencia IS NULL
              AND latitude_ocorrencia IS NULL
              AND longitude_ocorrencia IS NULL
            )
          ),
        CONSTRAINT chk_solicitacoes_svo_dados_externos_campos_opcionais
          CHECK (
            (documento_falecido IS NULL OR length(btrim(documento_falecido)) > 0)
            AND (complemento_ocorrencia IS NULL OR length(btrim(complemento_ocorrencia)) > 0)
            AND (ponto_referencia IS NULL OR length(btrim(ponto_referencia)) > 0)
            AND (informacoes_medicas IS NULL OR length(btrim(informacoes_medicas)) > 0)
            AND (motivo_recusa_publico IS NULL OR length(btrim(motivo_recusa_publico)) > 0)
          ),
        CONSTRAINT chk_solicitacoes_svo_dados_externos_aviso_privacidade
          CHECK (
            ciencia_aviso_privacidade = true
            AND length(btrim(versao_aviso_privacidade)) >= 1
            AND versao_aviso_privacidade = btrim(versao_aviso_privacidade)
            AND versao_aviso_privacidade !~ '[[:cntrl:]]'
          ),
        CONSTRAINT chk_solicitacoes_svo_dados_externos_cancelamento
          CHECK (
            (
              cancelamento_status IS NULL
              AND cancelamento_solicitado_em IS NULL
              AND cancelamento_motivo IS NULL
              AND cancelamento_decidido_por IS NULL
              AND cancelamento_decidido_em IS NULL
              AND cancelamento_justificativa_decisao IS NULL
            )
            OR (
              cancelamento_status = 'PENDENTE'
              AND cancelamento_solicitado_em IS NOT NULL
              AND cancelamento_motivo IS NOT NULL
              AND length(btrim(cancelamento_motivo)) >= 5
              AND cancelamento_decidido_por IS NULL
              AND cancelamento_decidido_em IS NULL
              AND cancelamento_justificativa_decisao IS NULL
            )
            OR (
              cancelamento_status IN ('ACEITO', 'NEGADO')
              AND cancelamento_solicitado_em IS NOT NULL
              AND cancelamento_motivo IS NOT NULL
              AND length(btrim(cancelamento_motivo)) >= 5
              AND cancelamento_decidido_por IS NOT NULL
              AND cancelamento_decidido_em IS NOT NULL
              AND cancelamento_decidido_em >= cancelamento_solicitado_em
              AND (cancelamento_justificativa_decisao IS NULL OR length(btrim(cancelamento_justificativa_decisao)) >= 5)
            )
          ),
        CONSTRAINT chk_solicitacoes_svo_dados_externos_retencao
          CHECK (
            (
              encerrado_operacional_em IS NULL
              AND consulta_publica_expira_em IS NULL
              AND retencao_ate IS NULL
              AND anonimizado_em IS NULL
              AND expurgado_em IS NULL
            )
            OR (
              encerrado_operacional_em IS NOT NULL
              AND (consulta_publica_expira_em IS NULL OR consulta_publica_expira_em >= encerrado_operacional_em)
              AND (retencao_ate IS NULL OR retencao_ate >= encerrado_operacional_em + interval '12 months')
              AND (anonimizado_em IS NULL OR (retencao_ate IS NOT NULL AND anonimizado_em >= retencao_ate AND preservacao_legal = false))
              AND (
                (expurgado_em IS NULL AND expurgado_por IS NULL AND expurgo_motivo IS NULL)
                OR (
                  expurgado_em IS NOT NULL
                  AND retencao_ate IS NOT NULL
                  AND expurgado_em >= retencao_ate
                  AND preservacao_legal = false
                  AND expurgo_motivo IS NOT NULL
                  AND length(btrim(expurgo_motivo)) >= 5
                )
              )
            )
          ),
        CONSTRAINT chk_solicitacoes_svo_dados_externos_preservacao
          CHECK (
            (preservacao_legal = false AND preservacao_motivo IS NULL)
            OR (preservacao_legal = true AND preservacao_motivo IS NOT NULL AND length(btrim(preservacao_motivo)) >= 5)
          ),
        CONSTRAINT chk_solicitacoes_svo_dados_externos_versao
          CHECK (versao_dados >= 1 AND atualizado_em >= criado_em)
      );

      CREATE INDEX idx_solicitacoes_svo_dados_externos_ocorrencia
        ON solicitacoes_svo_dados_externos (data_hora_ocorrencia DESC);

      CREATE INDEX idx_solicitacoes_svo_dados_externos_cancelamento_pendente
        ON solicitacoes_svo_dados_externos (cancelamento_solicitado_em ASC)
        WHERE cancelamento_status = 'PENDENTE';

      CREATE INDEX idx_solicitacoes_svo_dados_externos_retencao_pendente
        ON solicitacoes_svo_dados_externos (retencao_ate)
        WHERE anonimizado_em IS NULL AND expurgado_em IS NULL AND preservacao_legal = false AND retencao_ate IS NOT NULL;
    `);
  }

  // 4. Cria a estrutura protegida solicitacoes_svo_credenciais_externas (1:1 com solicitacoes_svo EXTERNA)
  const { rows: tabCredenciaisRows } = await knex.raw(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = ?
       AND table_name = 'solicitacoes_svo_credenciais_externas'`,
    [schemaAtual]
  );

  if (tabCredenciaisRows.length === 0) {
    await knex.raw(`
      CREATE TABLE solicitacoes_svo_credenciais_externas (
        solicitacao_id INTEGER PRIMARY KEY,
        segredo_digest CHAR(64) NOT NULL,
        algoritmo_digest VARCHAR(30) NOT NULL DEFAULT 'SHA-256',
        versao_credencial INTEGER NOT NULL DEFAULT 1,
        chave_idempotencia_criacao VARCHAR(120) NULL DEFAULT NULL,
        payload_criacao_digest CHAR(64) NULL DEFAULT NULL,
        prova_tentativa_digest CHAR(64) NULL DEFAULT NULL,
        envelope_recuperacao TEXT NULL DEFAULT NULL,
        recuperacao_expira_em TIMESTAMPTZ NULL DEFAULT NULL,
        emitida_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        valida_ate TIMESTAMPTZ NULL DEFAULT NULL,
        revogada_em TIMESTAMPTZ NULL DEFAULT NULL,
        revogada_motivo VARCHAR(120) NULL DEFAULT NULL,
        ultimo_acesso_em TIMESTAMPTZ NULL DEFAULT NULL,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_solicitacoes_svo_credenciais_externas_solicitacao
          FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes_svo(id) ON DELETE RESTRICT,
        CONSTRAINT uq_solicitacoes_svo_credenciais_idempotencia
          UNIQUE (chave_idempotencia_criacao),
        CONSTRAINT chk_solicitacoes_svo_credenciais_digest
          CHECK (
            segredo_digest ~ '^[0-9a-f]{64}$'
            AND algoritmo_digest IN ('SHA-256', 'HMAC-SHA-256')
            AND versao_credencial >= 1
          ),
        CONSTRAINT chk_solicitacoes_svo_credenciais_idempotencia
          CHECK (
            (
              chave_idempotencia_criacao IS NULL
              AND payload_criacao_digest IS NULL
              AND prova_tentativa_digest IS NULL
              AND envelope_recuperacao IS NULL
              AND recuperacao_expira_em IS NULL
            )
            OR (
              chave_idempotencia_criacao IS NOT NULL
              AND length(btrim(chave_idempotencia_criacao)) >= 8
              AND chave_idempotencia_criacao = btrim(chave_idempotencia_criacao)
              AND chave_idempotencia_criacao !~ '[[:space:][:cntrl:]]'
              AND payload_criacao_digest IS NOT NULL
              AND payload_criacao_digest ~ '^[0-9a-f]{64}$'
              AND (prova_tentativa_digest IS NULL OR prova_tentativa_digest ~ '^[0-9a-f]{64}$')
              AND (
                (envelope_recuperacao IS NULL AND recuperacao_expira_em IS NULL)
                OR (
                  envelope_recuperacao IS NOT NULL
                  AND length(btrim(envelope_recuperacao)) >= 16
                  AND recuperacao_expira_em IS NOT NULL
                  AND recuperacao_expira_em >= emitida_em
                )
              )
            )
          ),
        CONSTRAINT chk_solicitacoes_svo_credenciais_ciclo
          CHECK (
            (valida_ate IS NULL OR valida_ate >= emitida_em)
            AND (
              (revogada_em IS NULL AND revogada_motivo IS NULL)
              OR (
                revogada_em IS NOT NULL
                AND revogada_em >= emitida_em
                AND revogada_motivo IS NOT NULL
                AND length(btrim(revogada_motivo)) >= 3
              )
            )
            AND (ultimo_acesso_em IS NULL OR ultimo_acesso_em >= emitida_em)
            AND atualizado_em >= emitida_em
          )
      );

      CREATE INDEX idx_solicitacoes_svo_credenciais_validade
        ON solicitacoes_svo_credenciais_externas (valida_ate)
        WHERE revogada_em IS NULL;
    `);
  }

  // 5. Funcoes e triggers para garantir que apenas solicitacoes EXTERNA tenham dados/credenciais externos
  //    e impedir mudanca de canal_origem ou violacao de vinculo em solicitacoes_svo
  const { rows: triggersExistentes } = await knex.raw(
    `SELECT tg.tgname
     FROM pg_trigger tg
     JOIN pg_class t ON t.oid = tg.tgrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = ?
       AND NOT tg.tgisinternal
       AND tg.tgname IN (
         'trg_validar_vinculo_canal_externo_dados_svo',
         'trg_validar_vinculo_canal_externo_credenciais_svo',
         'trg_proteger_integridade_canal_solicitacao_svo'
       )`,
    [schemaAtual]
  );

  if (triggersExistentes.length === 0) {
    await knex.raw(`
      CREATE FUNCTION validar_vinculo_canal_externo_svo()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path FROM CURRENT
      AS $$
      DECLARE
        canal_atual varchar(20);
      BEGIN
        SELECT s.canal_origem
          INTO canal_atual
          FROM solicitacoes_svo s
         WHERE s.id = NEW.solicitacao_id;

        IF canal_atual IS DISTINCT FROM 'EXTERNA' THEN
          RAISE EXCEPTION 'Dados externos e credenciais de acompanhamento so podem ser vinculados a solicitacoes SVO com canal_origem = EXTERNA (solicitacao_id=%).',
            NEW.solicitacao_id
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$;

      CREATE FUNCTION proteger_integridade_canal_solicitacao_svo()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path FROM CURRENT
      AS $$
      BEGIN
        IF NEW.canal_origem IS DISTINCT FROM OLD.canal_origem THEN
          RAISE EXCEPTION 'Nao e permitido alterar canal_origem de uma solicitacao SVO apos o registro (id=%).',
            OLD.id
            USING ERRCODE = '23514';
        END IF;

        IF OLD.canal_origem = 'EXTERNA' AND NEW.protocolo IS DISTINCT FROM OLD.protocolo THEN
          RAISE EXCEPTION 'Nao e permitido alterar o protocolo publico de uma solicitacao externa SVO apos a emissao (id=%).',
            OLD.id
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER trg_validar_vinculo_canal_externo_dados_svo
        BEFORE INSERT OR UPDATE ON solicitacoes_svo_dados_externos
        FOR EACH ROW
        EXECUTE FUNCTION validar_vinculo_canal_externo_svo();

      CREATE TRIGGER trg_validar_vinculo_canal_externo_credenciais_svo
        BEFORE INSERT OR UPDATE ON solicitacoes_svo_credenciais_externas
        FOR EACH ROW
        EXECUTE FUNCTION validar_vinculo_canal_externo_svo();

      CREATE TRIGGER trg_proteger_integridade_canal_solicitacao_svo
        BEFORE UPDATE ON solicitacoes_svo
        FOR EACH ROW
        EXECUTE FUNCTION proteger_integridade_canal_solicitacao_svo();
    `);
  }

  // 6. Valida o catalogo antes de conceder privilegios por coluna para rejeitar estruturas preexistentes incompativeis
  await validarCatalogoScrum263(knex);

  // 7. Aplica principio de minimo privilegio para a role da aplicacao:
  //    SELECT, INSERT e UPDATE restrito apenas as colunas mutaveis; sem DELETE
  const appUser = process.env.POSTGRES_APP_USER;
  if (appUser && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser)) {
    const roleApp = await knex('pg_roles').where({ rolname: appUser }).first('rolname');
    if (roleApp) {
      await knex.raw(
        `REVOKE ALL PRIVILEGES ON TABLE ??.solicitacoes_svo_dados_externos, ??.solicitacoes_svo_credenciais_externas FROM ??`,
        [schemaAtual, schemaAtual, appUser]
      );
      await knex.raw(
        `GRANT SELECT, INSERT, UPDATE (
          telefone_solicitante,
          email_solicitante,
          endereco_ocorrencia,
          numero_imovel,
          sem_numero_imovel,
          complemento_ocorrencia,
          ponto_referencia,
          latitude_ocorrencia,
          longitude_ocorrencia,
          fora_area_cobertura,
          motivo_recusa_publico,
          cancelamento_solicitado_em,
          cancelamento_motivo,
          cancelamento_status,
          cancelamento_decidido_por,
          cancelamento_decidido_em,
          cancelamento_justificativa_decisao,
          versao_dados,
          encerrado_operacional_em,
          consulta_publica_expira_em,
          retencao_ate,
          preservacao_legal,
          preservacao_motivo,
          atualizado_em
        ) ON TABLE ??.solicitacoes_svo_dados_externos TO ??`,
        [schemaAtual, appUser]
      );
      await knex.raw(
        `GRANT SELECT, INSERT, UPDATE (
          envelope_recuperacao,
          recuperacao_expira_em,
          valida_ate,
          revogada_em,
          revogada_motivo,
          ultimo_acesso_em,
          atualizado_em
        ) ON TABLE ??.solicitacoes_svo_credenciais_externas TO ??`,
        [schemaAtual, appUser]
      );
    }
  }
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await validarCatalogoScrum263(knex);

  const dadosExternosCount = await knex('solicitacoes_svo_dados_externos')
    .count({ total: '*' })
    .first();
  if (Number(dadosExternosCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem registros em solicitacoes_svo_dados_externos. Preserve os dados ou execute roll-forward antes de reverter a migration SCRUM-263.'
    );
  }

  const credenciaisCount = await knex('solicitacoes_svo_credenciais_externas')
    .count({ total: '*' })
    .first();
  if (Number(credenciaisCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem registros em solicitacoes_svo_credenciais_externas. Preserve os dados ou execute roll-forward antes de reverter a migration SCRUM-263.'
    );
  }

  const externasCount = await knex('solicitacoes_svo')
    .where(function () {
      this.where('canal_origem', '<>', 'INTERNA')
        .orWhereNull('registrante_id')
        .orWhereNotNull('protocolo');
    })
    .count({ total: '*' })
    .first();
  if (Number(externasCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem solicitacoes em solicitacoes_svo com canal_origem EXTERNA, registrante_id nulo ou protocolo preenchido.'
    );
  }

  await knex.raw(`
    DROP TRIGGER trg_proteger_integridade_canal_solicitacao_svo ON solicitacoes_svo;
    DROP TRIGGER trg_validar_vinculo_canal_externo_credenciais_svo ON solicitacoes_svo_credenciais_externas;
    DROP TRIGGER trg_validar_vinculo_canal_externo_dados_svo ON solicitacoes_svo_dados_externos;
    DROP FUNCTION proteger_integridade_canal_solicitacao_svo();
    DROP FUNCTION validar_vinculo_canal_externo_svo();

    DROP INDEX idx_solicitacoes_svo_credenciais_validade;
    DROP TABLE solicitacoes_svo_credenciais_externas;

    DROP INDEX idx_solicitacoes_svo_dados_externos_retencao_pendente;
    DROP INDEX idx_solicitacoes_svo_dados_externos_cancelamento_pendente;
    DROP INDEX idx_solicitacoes_svo_dados_externos_ocorrencia;
    DROP TABLE solicitacoes_svo_dados_externos;

    DROP INDEX idx_solicitacoes_svo_canal_status_id;
    ALTER TABLE solicitacoes_svo
      DROP CONSTRAINT uq_solicitacoes_svo_protocolo,
      DROP CONSTRAINT chk_solicitacoes_svo_canal_registrante_protocolo,
      DROP CONSTRAINT chk_solicitacoes_svo_canal_origem,
      ALTER COLUMN registrante_id SET NOT NULL,
      DROP COLUMN protocolo,
      DROP COLUMN canal_origem;
  `);
};

exports.validarCatalogoScrum263 = validarCatalogoScrum263;
