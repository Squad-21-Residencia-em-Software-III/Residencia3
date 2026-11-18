/**
 * Dependencias de banco da SCRUM-166 / SCRUM-183:
 * 1. Adiciona liberada_em (TIMESTAMPTZ NULL DEFAULT NULL) em ordens_svo para controle da fila de liberacao.
 * 2. Cria a tabela alertas_atraso_svo com FKs RESTRICT, UNIQUE de par de ordens, CHECK de ordens distintas
 *    e indice parcial idx_alertas_atraso_svo_abertos para alertas pendentes.
 * 3. Adiciona material_sensivel (BOOLEAN NOT NULL DEFAULT false) em solicitacoes_viagem, preservando
 *    registros existentes como false e mantendo solicitacoes_svo.material_sensivel intacto.
 *
 * Estrategia de seguranca de migracao e rollback:
 * - Sem uso cego de IF NOT EXISTS / DROP IF EXISTS: verifica explicitamente o catalogo antes e depois.
 * - Caso algum objeto ja exista no ambiente, valida rigorosamente tipo, nulidade, default, identity,
 *   constraints e indices; qualquer divergencia aborta a execucao com erro explicito.
 * - No down, valida que os objetos correspondem a assinatura desta migration, bloqueia reversao
 *   destrutiva caso existam dados operacionais (alertas registrados, liberada_em preenchido ou
 *   material_sensivel = true) e executa DROP estrito sem IF EXISTS.
 *
 * @param {import('knex').Knex} knex
 */
async function validarCatalogoScrum183(knex) {
  const { rows: schemaRow } = await knex.raw('SELECT current_schema() AS schema_atual');
  const schema = schemaRow[0]?.schema_atual || 'public';

  // 1. Verifica coluna ordens_svo.liberada_em e objetos da SCRUM-176
  const { rows: colsOrdens } = await knex.raw(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'ordens_svo'
       AND column_name IN ('inicio_previsto', 'fim_previsto', 'liberada_em')`,
    [schema]
  );
  const mapaOrdens = new Map(colsOrdens.map((c) => [c.column_name, c]));

  for (const colNome of ['inicio_previsto', 'fim_previsto', 'liberada_em']) {
    const col = mapaOrdens.get(colNome);
    if (!col || col.data_type !== 'timestamp with time zone' || col.is_nullable !== 'YES') {
      throw new Error(
        `Estrutura incompativel em ${schema}.ordens_svo.${colNome}: esperado TIMESTAMPTZ NULL, encontrado ${JSON.stringify(col || null)}.`
      );
    }
  }

  // 2. Verifica coluna solicitacoes_viagem.material_sensivel
  const { rows: colsSolViagem } = await knex.raw(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'solicitacoes_viagem'
       AND column_name = 'material_sensivel'`,
    [schema]
  );
  const colMat = colsSolViagem[0];
  if (
    !colMat ||
    colMat.data_type !== 'boolean' ||
    colMat.is_nullable !== 'NO' ||
    !String(colMat.column_default).includes('false')
  ) {
    throw new Error(
      `Estrutura incompativel em ${schema}.solicitacoes_viagem.material_sensivel: esperado BOOLEAN NOT NULL DEFAULT false, encontrado ${JSON.stringify(colMat || null)}.`
    );
  }

  // 3. Verifica colunas da tabela alertas_atraso_svo
  const { rows: colsAlertas } = await knex.raw(
    `SELECT column_name, data_type, is_nullable, column_default, is_identity
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'alertas_atraso_svo'
     ORDER BY ordinal_position`,
    [schema]
  );
  const mapaAlertas = new Map(colsAlertas.map((c) => [c.column_name, c]));

  const especificacaoColunas = [
    { nome: 'id', tipo: 'integer', nulavel: 'NO', identity: 'YES' },
    { nome: 'ordem_em_atraso_id', tipo: 'integer', nulavel: 'NO', identity: 'NO' },
    { nome: 'ordem_afetada_id', tipo: 'integer', nulavel: 'NO', identity: 'NO' },
    { nome: 'criado_em', tipo: 'timestamp with time zone', nulavel: 'NO', identity: 'NO' },
    { nome: 'resolvido_em', tipo: 'timestamp with time zone', nulavel: 'YES', identity: 'NO' },
  ];

  if (colsAlertas.length !== especificacaoColunas.length) {
    throw new Error(
      `Estrutura incompativel em ${schema}.alertas_atraso_svo: esperado ${especificacaoColunas.length} colunas, encontrado ${colsAlertas.length}.`
    );
  }

  for (const esp of especificacaoColunas) {
    const col = mapaAlertas.get(esp.nome);
    if (
      !col ||
      col.data_type !== esp.tipo ||
      col.is_nullable !== esp.nulavel ||
      col.is_identity !== esp.identity
    ) {
      throw new Error(
        `Coluna incompativel em ${schema}.alertas_atraso_svo.${esp.nome}: esperado ${JSON.stringify(esp)}, encontrado ${JSON.stringify(col || null)}.`
      );
    }
  }

  // 4. Verifica constraints da tabela alertas_atraso_svo
  const { rows: constraints } = await knex.raw(
    `SELECT c.conname, c.contype, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = ? AND t.relname = 'alertas_atraso_svo'`,
    [schema]
  );
  const mapaConstraints = new Map(constraints.map((c) => [c.conname, c]));

  const constraintsEsperadas = [
    { nome: 'alertas_atraso_svo_pkey', tipo: 'p', trecho: 'PRIMARY KEY (id)' },
    {
      nome: 'fk_alertas_atraso_svo_atrasada',
      tipo: 'f',
      trecho: 'FOREIGN KEY (ordem_em_atraso_id) REFERENCES',
      trechoRestricao: 'ON DELETE RESTRICT',
    },
    {
      nome: 'fk_alertas_atraso_svo_afetada',
      tipo: 'f',
      trecho: 'FOREIGN KEY (ordem_afetada_id) REFERENCES',
      trechoRestricao: 'ON DELETE RESTRICT',
    },
    {
      nome: 'uq_alertas_atraso_svo_ordens',
      tipo: 'u',
      trecho: 'UNIQUE (ordem_em_atraso_id, ordem_afetada_id)',
    },
    {
      nome: 'chk_alertas_atraso_svo_ordens_distintas',
      tipo: 'c',
      trecho: 'ordem_em_atraso_id <> ordem_afetada_id',
    },
  ];

  for (const esp of constraintsEsperadas) {
    const atual = mapaConstraints.get(esp.nome);
    if (
      !atual ||
      atual.contype !== esp.tipo ||
      !atual.def.includes(esp.trecho) ||
      (esp.trechoRestricao && !atual.def.includes(esp.trechoRestricao))
    ) {
      throw new Error(
        `Constraint ausente ou incompativel em ${schema}.alertas_atraso_svo (${esp.nome}): encontrado ${JSON.stringify(atual || null)}.`
      );
    }
  }

  // 5. Verifica indice parcial idx_alertas_atraso_svo_abertos
  const { rows: indices } = await knex.raw(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = ? AND tablename = 'alertas_atraso_svo' AND indexname = 'idx_alertas_atraso_svo_abertos'`,
    [schema]
  );
  const idxAbertos = indices[0];
  if (
    !idxAbertos ||
    !idxAbertos.indexdef.includes('(ordem_afetada_id)') ||
    !idxAbertos.indexdef.includes('resolvido_em IS NULL')
  ) {
    throw new Error(
      `Indice parcial idx_alertas_atraso_svo_abertos ausente ou incompativel em ${schema}.alertas_atraso_svo.`
    );
  }

  return true;
}

/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  const { rows: schemaRow } = await knex.raw('SELECT current_schema() AS schema_atual');
  const schema = schemaRow[0]?.schema_atual || 'public';

  // 1. Coluna liberada_em em ordens_svo (cria apenas se nao existir; valida estrutura em seguida)
  const { rows: liberadaExiste } = await knex.raw(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'ordens_svo' AND column_name = 'liberada_em'`,
    [schema]
  );
  if (liberadaExiste.length === 0) {
    await knex.raw(`
      ALTER TABLE ordens_svo
        ADD COLUMN liberada_em TIMESTAMPTZ NULL DEFAULT NULL
    `);
  }

  // 2. Tabela alertas_atraso_svo e indice parcial idx_alertas_atraso_svo_abertos
  const { rows: tabelaExiste } = await knex.raw(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = ? AND table_name = 'alertas_atraso_svo'`,
    [schema]
  );
  if (tabelaExiste.length === 0) {
    await knex.raw(`
      CREATE TABLE alertas_atraso_svo (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        ordem_em_atraso_id INTEGER NOT NULL,
        ordem_afetada_id INTEGER NOT NULL,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolvido_em TIMESTAMPTZ NULL DEFAULT NULL,
        CONSTRAINT fk_alertas_atraso_svo_atrasada
          FOREIGN KEY (ordem_em_atraso_id) REFERENCES ordens_svo(id) ON DELETE RESTRICT,
        CONSTRAINT fk_alertas_atraso_svo_afetada
          FOREIGN KEY (ordem_afetada_id) REFERENCES ordens_svo(id) ON DELETE RESTRICT,
        CONSTRAINT uq_alertas_atraso_svo_ordens
          UNIQUE (ordem_em_atraso_id, ordem_afetada_id),
        CONSTRAINT chk_alertas_atraso_svo_ordens_distintas
          CHECK (ordem_em_atraso_id <> ordem_afetada_id)
      )
    `);
  }

  const { rows: indiceExiste } = await knex.raw(
    `SELECT 1 FROM pg_indexes
     WHERE schemaname = ? AND tablename = 'alertas_atraso_svo' AND indexname = 'idx_alertas_atraso_svo_abertos'`,
    [schema]
  );
  if (indiceExiste.length === 0) {
    await knex.raw(`
      CREATE INDEX idx_alertas_atraso_svo_abertos
        ON alertas_atraso_svo (ordem_afetada_id)
        WHERE resolvido_em IS NULL
    `);
  }

  // 3. Coluna material_sensivel em solicitacoes_viagem
  const { rows: materialExiste } = await knex.raw(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'solicitacoes_viagem' AND column_name = 'material_sensivel'`,
    [schema]
  );
  if (materialExiste.length === 0) {
    await knex.raw(`
      ALTER TABLE solicitacoes_viagem
        ADD COLUMN material_sensivel BOOLEAN NOT NULL DEFAULT false
    `);
  }

  // 4. Validacao explicita de compatibilidade: rejeita qualquer estrutura preexistente divergente
  await validarCatalogoScrum183(knex);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  // 1. Confirma que todos os objetos que serao removidos existem e correspondem a esta migration
  await validarCatalogoScrum183(knex);

  // 2. Bloqueia rollback destrutivo caso haja qualquer dado operacional registrado
  const alertaExistente = await knex('alertas_atraso_svo').first('id');
  if (alertaExistente) {
    throw new Error(
      'Rollback bloqueado: existem registros em alertas_atraso_svo. Exporte e reconcilie o historico antes de reverter.'
    );
  }

  const ordemLiberada = await knex('ordens_svo').whereNotNull('liberada_em').first('id');
  if (ordemLiberada) {
    throw new Error(
      'Rollback bloqueado: existem ordens em ordens_svo com liberada_em preenchido. Exporte e reconcilie antes de reverter.'
    );
  }

  const solicitacaoSensivel = await knex('solicitacoes_viagem')
    .where({ material_sensivel: true })
    .first('id');
  if (solicitacaoSensivel) {
    throw new Error(
      'Rollback bloqueado: existem solicitacoes em solicitacoes_viagem com material_sensivel = true. Exporte e reconcilie antes de reverter.'
    );
  }

  // 3. Remocao estrita (sem DROP IF EXISTS)
  await knex.raw('DROP INDEX idx_alertas_atraso_svo_abertos');
  await knex.raw('DROP TABLE alertas_atraso_svo');
  await knex.raw('ALTER TABLE ordens_svo DROP COLUMN liberada_em');
  await knex.raw('ALTER TABLE solicitacoes_viagem DROP COLUMN material_sensivel');
};

exports.validarCatalogoScrum183 = validarCatalogoScrum183;
