const PERFIS_ESPERADOS = [
  'ADMINISTRADOR',
  'SOLICITANTE',
  'GESTOR_FROTA',
  'GESTOR_SVO',
  'MOTORISTA_FROTA',
  'MOTORISTA_SVO',
  'INTEGRANTE_SVO',
];

const COLUNAS_EQUIPES_INTEGRANTE_ESPERADAS = {
  id: { data_type: 'integer', is_nullable: 'NO' },
  equipe_id: { data_type: 'integer', is_nullable: 'NO' },
  usuario_id: { data_type: 'integer', is_nullable: 'NO' },
  vinculado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO' },
  desvinculado_em: { data_type: 'timestamp with time zone', is_nullable: 'YES' },
};

const COLUNAS_ORDENS_INTEGRANTE_ESPERADAS = {
  id: { data_type: 'integer', is_nullable: 'NO' },
  ordem_id: { data_type: 'integer', is_nullable: 'NO' },
  equipe_id: { data_type: 'integer', is_nullable: 'NO' },
  usuario_id: { data_type: 'integer', is_nullable: 'NO' },
  designado_em: { data_type: 'timestamp with time zone', is_nullable: 'NO' },
  designado_por: { data_type: 'integer', is_nullable: 'NO' },
  revogado_em: { data_type: 'timestamp with time zone', is_nullable: 'YES' },
  revogado_por: { data_type: 'integer', is_nullable: 'YES' },
};

/**
 * Valida se as estruturas da SCRUM-198 no schema alvo correspondem exatamente
 * ao contrato esperado pelo backend (usuarios, equipes_svo, equipes_svo_integrantes
 * e ordens_svo_integrantes), falhando caso exista alguma estrutura preexistente incompativel.
 *
 * @param {import('knex').Knex} knex
 */
async function validarCatalogoScrum198(knex) {
  const { rows: schemaRows } = await knex.raw('SELECT current_schema() AS schema_atual');
  const schemaAtual = schemaRows[0]?.schema_atual || 'public';

  // 1. Verifica constraints de usuarios e equipes_svo
  const { rows: constraintsBase } = await knex.raw(
    `SELECT t.relname AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = ?
       AND t.relname IN ('usuarios', 'equipes_svo', 'equipes_svo_integrantes', 'ordens_svo_integrantes')`,
    [schemaAtual]
  );

  const mapaConstraints = new Map(
    constraintsBase.map((c) => [`${c.table_name}.${c.conname}`, c])
  );

  const chkPerfil = mapaConstraints.get('usuarios.chk_usuarios_perfil');
  if (!chkPerfil || chkPerfil.contype !== 'c' || !chkPerfil.def.includes('INTEGRANTE_SVO')) {
    throw new Error(
      'Estrutura incompativel em usuarios: constraint chk_usuarios_perfil ausente ou sem suporte a INTEGRANTE_SVO.'
    );
  }

  const chkNomeEquipe = mapaConstraints.get('equipes_svo.chk_equipes_svo_nome_nao_vazio');
  if (!chkNomeEquipe || chkNomeEquipe.contype !== 'c') {
    throw new Error(
      'Estrutura incompativel em equipes_svo: constraint chk_equipes_svo_nome_nao_vazio ausente.'
    );
  }

  // 2. Verifica colunas de equipes_svo_integrantes
  const { rows: colsVinculos } = await knex.raw(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'equipes_svo_integrantes'`,
    [schemaAtual]
  );

  const mapaColVinculos = new Map(colsVinculos.map((c) => [c.column_name, c]));
  for (const [nomeCol, esperado] of Object.entries(COLUNAS_EQUIPES_INTEGRANTE_ESPERADAS)) {
    const col = mapaColVinculos.get(nomeCol);
    if (!col || col.data_type !== esperado.data_type || col.is_nullable !== esperado.is_nullable) {
      throw new Error(
        `Estrutura incompativel em equipes_svo_integrantes.${nomeCol}: esperado (${esperado.data_type}, nullable=${esperado.is_nullable}), encontrado ${JSON.stringify(col || null)}`
      );
    }
  }

  // 3. Verifica colunas de ordens_svo_integrantes
  const { rows: colsDesignacoes } = await knex.raw(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'ordens_svo_integrantes'`,
    [schemaAtual]
  );

  const mapaColDesignacoes = new Map(colsDesignacoes.map((c) => [c.column_name, c]));
  for (const [nomeCol, esperado] of Object.entries(COLUNAS_ORDENS_INTEGRANTE_ESPERADAS)) {
    const col = mapaColDesignacoes.get(nomeCol);
    if (!col || col.data_type !== esperado.data_type || col.is_nullable !== esperado.is_nullable) {
      throw new Error(
        `Estrutura incompativel em ordens_svo_integrantes.${nomeCol}: esperado (${esperado.data_type}, nullable=${esperado.is_nullable}), encontrado ${JSON.stringify(col || null)}`
      );
    }
  }

  // 4. Verifica FKs e CHECKs de equipes_svo_integrantes e ordens_svo_integrantes
  const constraintsObrigatorias = [
    ['equipes_svo_integrantes.fk_equipes_svo_integrantes_equipe', 'f', 'ON DELETE RESTRICT'],
    ['equipes_svo_integrantes.fk_equipes_svo_integrantes_usuario', 'f', 'ON DELETE RESTRICT'],
    ['equipes_svo_integrantes.chk_equipes_svo_integrantes_periodo', 'c', 'desvinculado_em'],
    ['ordens_svo_integrantes.fk_ordens_svo_integrantes_ordem', 'f', 'ON DELETE RESTRICT'],
    ['ordens_svo_integrantes.fk_ordens_svo_integrantes_equipe', 'f', 'ON DELETE RESTRICT'],
    ['ordens_svo_integrantes.fk_ordens_svo_integrantes_usuario', 'f', 'ON DELETE RESTRICT'],
    ['ordens_svo_integrantes.fk_ordens_svo_integrantes_designado_por', 'f', 'ON DELETE RESTRICT'],
    ['ordens_svo_integrantes.fk_ordens_svo_integrantes_revogado_por', 'f', 'ON DELETE RESTRICT'],
    ['ordens_svo_integrantes.chk_ordens_svo_integrantes_revogacao', 'c', 'revogado_em'],
  ];

  for (const [chave, tipoEsperado, trechoEsperado] of constraintsObrigatorias) {
    const c = mapaConstraints.get(chave);
    if (!c || c.contype !== tipoEsperado || !c.def.includes(trechoEsperado)) {
      throw new Error(`Constraint obrigatoria ausente ou incompativel: ${chave}`);
    }
  }

  // 5. Verifica indices obrigatorios
  const { rows: idxRows } = await knex.raw(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = ?
       AND tablename IN ('equipes_svo', 'equipes_svo_integrantes', 'ordens_svo_integrantes')`,
    [schemaAtual]
  );

  const mapaIdx = new Map(idxRows.map((i) => [i.indexname, i.indexdef]));

  const indicesObrigatorios = [
    ['uq_equipes_svo_nome_normalizado', 'UNIQUE INDEX'],
    ['uq_equipes_svo_integrantes_ativo', 'WHERE (desvinculado_em IS NULL)'],
    ['idx_equipes_svo_integrantes_usuario_ativo', 'WHERE (desvinculado_em IS NULL)'],
    ['idx_equipes_svo_integrantes_equipe', 'equipe_id'],
    ['uq_ordens_svo_integrantes_ativo', 'WHERE (revogado_em IS NULL)'],
    ['idx_ordens_svo_integrantes_usuario_ativo', 'WHERE (revogado_em IS NULL)'],
    ['idx_ordens_svo_integrantes_equipe_usuario_ativo', 'WHERE (revogado_em IS NULL)'],
    ['idx_ordens_svo_integrantes_ordem', 'ordem_id'],
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

  // 1. Valida registros existentes em equipes_svo antes de aplicar constraint e indice unico
  const { rows: nomesVazios } = await knex.raw(
    `SELECT COUNT(*)::int AS total
     FROM equipes_svo
     WHERE nome_equipe IS NULL OR length(btrim(nome_equipe)) = 0`
  );
  if (Number(nomesVazios[0]?.total || 0) > 0) {
    throw new Error(
      'Migration SCRUM-198 bloqueada: existem registros em equipes_svo com nome_equipe vazio.'
    );
  }

  const { rows: nomesDuplicados } = await knex.raw(
    `SELECT lower(btrim(nome_equipe)) AS nome_norm, COUNT(*)::int AS total
     FROM equipes_svo
     GROUP BY lower(btrim(nome_equipe))
     HAVING COUNT(*) > 1
     LIMIT 1`
  );
  if (nomesDuplicados.length > 0) {
    throw new Error(
      'Migration SCRUM-198 bloqueada: existem nomes de equipe duplicados apos normalizacao em equipes_svo. Regularize antes de criar o indice unico.'
    );
  }

  // 2. Valida perfis existentes em usuarios antes de recriar chk_usuarios_perfil
  const perfisInvalidos = await knex('usuarios')
    .whereNotIn('perfil', PERFIS_ESPERADOS)
    .count({ total: '*' });
  if (Number(perfisInvalidos[0]?.total || 0) > 0) {
    throw new Error(
      'Migration SCRUM-198 bloqueada: existem registros em usuarios com perfil fora do dominio permitido.'
    );
  }

  // 3. Amplia chk_usuarios_perfil para incluir INTEGRANTE_SVO
  await knex.raw(`
    ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_usuarios_perfil;
    ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_perfil
      CHECK (perfil IN (
        'ADMINISTRADOR',
        'SOLICITANTE',
        'GESTOR_FROTA',
        'GESTOR_SVO',
        'MOTORISTA_FROTA',
        'MOTORISTA_SVO',
        'INTEGRANTE_SVO'
      ));
  `);

  // 4. Aplica constraint de nome nao vazio e indice unico normalizado em equipes_svo
  const { rows: chkNomeRows } = await knex.raw(
    `SELECT 1
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = ?
       AND t.relname = 'equipes_svo'
       AND c.conname = 'chk_equipes_svo_nome_nao_vazio'`,
    [schemaAtual]
  );
  if (chkNomeRows.length === 0) {
    await knex.raw(`
      ALTER TABLE equipes_svo
      ADD CONSTRAINT chk_equipes_svo_nome_nao_vazio
      CHECK (length(btrim(nome_equipe)) > 0)
    `);
  }

  const { rows: idxNomeRows } = await knex.raw(
    `SELECT 1 FROM pg_indexes WHERE schemaname = ? AND tablename = 'equipes_svo' AND indexname = 'uq_equipes_svo_nome_normalizado'`,
    [schemaAtual]
  );
  if (idxNomeRows.length === 0) {
    await knex.raw(`
      CREATE UNIQUE INDEX uq_equipes_svo_nome_normalizado
        ON equipes_svo (lower(btrim(nome_equipe)))
    `);
  }

  // 5. Cria tabela equipes_svo_integrantes (vinculos de equipe com historico)
  const { rows: tabVinculosRows } = await knex.raw(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = 'equipes_svo_integrantes'`,
    [schemaAtual]
  );
  if (tabVinculosRows.length === 0) {
    await knex.raw(`
      CREATE TABLE equipes_svo_integrantes (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        equipe_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        vinculado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        desvinculado_em TIMESTAMPTZ NULL DEFAULT NULL,
        CONSTRAINT fk_equipes_svo_integrantes_equipe
          FOREIGN KEY (equipe_id) REFERENCES equipes_svo(id) ON DELETE RESTRICT,
        CONSTRAINT fk_equipes_svo_integrantes_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT chk_equipes_svo_integrantes_periodo
          CHECK (desvinculado_em IS NULL OR desvinculado_em >= vinculado_em)
      );

      CREATE UNIQUE INDEX uq_equipes_svo_integrantes_ativo
        ON equipes_svo_integrantes (equipe_id, usuario_id)
        WHERE desvinculado_em IS NULL;

      CREATE INDEX idx_equipes_svo_integrantes_usuario_ativo
        ON equipes_svo_integrantes (usuario_id, equipe_id)
        WHERE desvinculado_em IS NULL;

      CREATE INDEX idx_equipes_svo_integrantes_equipe
        ON equipes_svo_integrantes (equipe_id);
    `);
  }

  // 6. Cria tabela ordens_svo_integrantes (designacoes individuais com historico)
  const { rows: tabDesignacoesRows } = await knex.raw(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = 'ordens_svo_integrantes'`,
    [schemaAtual]
  );
  if (tabDesignacoesRows.length === 0) {
    await knex.raw(`
      CREATE TABLE ordens_svo_integrantes (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        ordem_id INTEGER NOT NULL,
        equipe_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        designado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        designado_por INTEGER NOT NULL,
        revogado_em TIMESTAMPTZ NULL DEFAULT NULL,
        revogado_por INTEGER NULL DEFAULT NULL,
        CONSTRAINT fk_ordens_svo_integrantes_ordem
          FOREIGN KEY (ordem_id) REFERENCES ordens_svo(id) ON DELETE RESTRICT,
        CONSTRAINT fk_ordens_svo_integrantes_equipe
          FOREIGN KEY (equipe_id) REFERENCES equipes_svo(id) ON DELETE RESTRICT,
        CONSTRAINT fk_ordens_svo_integrantes_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT fk_ordens_svo_integrantes_designado_por
          FOREIGN KEY (designado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT fk_ordens_svo_integrantes_revogado_por
          FOREIGN KEY (revogado_por) REFERENCES usuarios(id) ON DELETE RESTRICT,
        CONSTRAINT chk_ordens_svo_integrantes_revogacao
          CHECK (
            (revogado_em IS NULL AND revogado_por IS NULL)
            OR (revogado_em IS NOT NULL AND revogado_por IS NOT NULL AND revogado_em >= designado_em)
          )
      );

      CREATE UNIQUE INDEX uq_ordens_svo_integrantes_ativo
        ON ordens_svo_integrantes (ordem_id, usuario_id)
        WHERE revogado_em IS NULL;

      CREATE INDEX idx_ordens_svo_integrantes_usuario_ativo
        ON ordens_svo_integrantes (usuario_id, ordem_id)
        WHERE revogado_em IS NULL;

      CREATE INDEX idx_ordens_svo_integrantes_equipe_usuario_ativo
        ON ordens_svo_integrantes (equipe_id, usuario_id, ordem_id)
        WHERE revogado_em IS NULL;

      CREATE INDEX idx_ordens_svo_integrantes_ordem
        ON ordens_svo_integrantes (ordem_id);
    `);
  }

  // 7. Se a role da aplicacao existir e estivermos no schema public, garante apenas SELECT/INSERT/UPDATE (sem DELETE)
  const appUser = process.env.POSTGRES_APP_USER;
  if (schemaAtual === 'public' && appUser && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser)) {
    const roleApp = await knex('pg_roles').where({ rolname: appUser }).first('rolname');
    if (roleApp) {
      await knex.raw(
        `REVOKE ALL PRIVILEGES ON TABLE public.equipes_svo_integrantes, public.ordens_svo_integrantes FROM ??`,
        [appUser]
      );
      await knex.raw(
        `GRANT SELECT, INSERT, UPDATE ON TABLE public.equipes_svo_integrantes, public.ordens_svo_integrantes TO ??`,
        [appUser]
      );
      await knex.raw(
        `GRANT USAGE, SELECT ON SEQUENCE public.equipes_svo_integrantes_id_seq, public.ordens_svo_integrantes_id_seq TO ??`,
        [appUser]
      );
    }
  }

  await validarCatalogoScrum198(knex);
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await validarCatalogoScrum198(knex);

  const designacoesCount = await knex('ordens_svo_integrantes').count({ total: '*' }).first();
  if (Number(designacoesCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem designacoes registradas em ordens_svo_integrantes. Preserve ou arquive os dados antes de reverter a migration SCRUM-198.'
    );
  }

  const vinculosCount = await knex('equipes_svo_integrantes').count({ total: '*' }).first();
  if (Number(vinculosCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem vinculos registrados em equipes_svo_integrantes. Preserve ou arquive os dados antes de reverter a migration SCRUM-198.'
    );
  }

  const integrantesCount = await knex('usuarios')
    .where({ perfil: 'INTEGRANTE_SVO' })
    .count({ total: '*' })
    .first();
  if (Number(integrantesCount?.total || 0) > 0) {
    throw new Error(
      'Rollback bloqueado: existem usuarios com perfil INTEGRANTE_SVO. Remova ou altere esses registros antes de reverter a migration SCRUM-198.'
    );
  }

  await knex.raw(`
    DROP INDEX IF EXISTS idx_ordens_svo_integrantes_ordem;
    DROP INDEX IF EXISTS idx_ordens_svo_integrantes_equipe_usuario_ativo;
    DROP INDEX IF EXISTS idx_ordens_svo_integrantes_usuario_ativo;
    DROP INDEX IF EXISTS uq_ordens_svo_integrantes_ativo;
    DROP TABLE ordens_svo_integrantes;

    DROP INDEX IF EXISTS idx_equipes_svo_integrantes_equipe;
    DROP INDEX IF EXISTS idx_equipes_svo_integrantes_usuario_ativo;
    DROP INDEX IF EXISTS uq_equipes_svo_integrantes_ativo;
    DROP TABLE equipes_svo_integrantes;

    DROP INDEX IF EXISTS uq_equipes_svo_nome_normalizado;
    ALTER TABLE equipes_svo DROP CONSTRAINT chk_equipes_svo_nome_nao_vazio;

    ALTER TABLE usuarios DROP CONSTRAINT chk_usuarios_perfil;
    ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_perfil
      CHECK (perfil IN (
        'ADMINISTRADOR',
        'SOLICITANTE',
        'GESTOR_FROTA',
        'GESTOR_SVO',
        'MOTORISTA_FROTA',
        'MOTORISTA_SVO'
      ));
  `);
};

exports.validarCatalogoScrum198 = validarCatalogoScrum198;
