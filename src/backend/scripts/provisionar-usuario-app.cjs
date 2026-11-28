const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const { aplicarPrivilegiosSolicitacoesExternasSvo, DADOS } = require('../database/privilegiosSolicitacoesExternasSvo.cjs');
const knexConfig = require('../knexfile');

/**
 * Valida se o estado efetivo da role da aplicacao atende estritamente ao principio
 * de minimo privilegio (sem superuser, createdb, createrole, replication, bypassrls,
 * heranca de roles, CREATE no schema public, acesso a knex_migrations ou privilegios
 * excessivos como TRUNCATE/REFERENCES/TRIGGER).
 *
 * @param {{
 *   rolname?: string,
 *   rolcanlogin?: boolean,
 *   rolsuper?: boolean,
 *   rolcreatedb?: boolean,
 *   rolcreaterole?: boolean,
 *   rolreplication?: boolean,
 *   rolbypassrls?: boolean,
 *   rolinherit?: boolean,
 *   rolesHerdadas?: string[],
 *   podeCriarNoPublic?: boolean,
 *   podeUsarPublic?: boolean,
 *   podeAcessarMigrations?: boolean,
 *   privilegiosExcessivosTabelas?: string[]
 * }} estado
 * @param {{ permitirDeletarNotificacoes?: boolean }} [opcoes] Somente a role do job de
 *   retencao de notificacoes (SCRUM-242) pode manter DELETE em notificacoes.
 */
function validarEstadoMinimoPrivilegio(estado, opcoes = {}) {
  if (!estado || !estado.rolname) {
    throw new Error('Role da aplicacao nao encontrada em pg_roles apos o provisionamento.');
  }

  const violacoes = [];

  if (!estado.rolcanlogin) violacoes.push('rolcanlogin deve ser true');
  if (estado.rolsuper) violacoes.push('rolsuper deve ser false (NOSUPERUSER)');
  if (estado.rolcreatedb) violacoes.push('rolcreatedb deve ser false (NOCREATEDB)');
  if (estado.rolcreaterole) violacoes.push('rolcreaterole deve ser false (NOCREATEROLE)');
  if (estado.rolreplication) violacoes.push('rolreplication deve ser false (NOREPLICATION)');
  if (estado.rolbypassrls) violacoes.push('rolbypassrls deve ser false (NOBYPASSRLS)');
  if (estado.rolinherit) violacoes.push('rolinherit deve ser false (NOINHERIT)');

  if (Array.isArray(estado.rolesHerdadas) && estado.rolesHerdadas.length > 0) {
    violacoes.push(`role possui associacoes herdadas indevidas: ${estado.rolesHerdadas.join(', ')}`);
  }

  if (estado.podeCriarNoPublic) {
    violacoes.push('role nao pode ter privilegio CREATE no schema public');
  }

  if (estado.podeUsarPublic === false) {
    violacoes.push('role precisa ter privilegio USAGE no schema public');
  }

  if (estado.podeAcessarMigrations) {
    violacoes.push('role nao pode ter nenhum privilegio sobre knex_migrations ou knex_migrations_lock');
  }

  if (estado.podeDeletarHistoricoSvo) {
    violacoes.push(
      'role nao pode ter privilegio DELETE sobre tabelas de historico de vinculos/designacoes SVO (equipes_svo_integrantes, ordens_svo_integrantes)'
    );
  }

  if (estado.podeDeletarEvidenciasOdometro) {
    violacoes.push(
      'role nao pode ter privilegio DELETE sobre tabelas imutaveis de evidencias/deslocamentos de odometro (deslocamentos_svo, deslocamentos_svo_ordens, evidencias_odometro)'
    );
  }

  if (estado.podeDeletarNotificacoes && !opcoes.permitirDeletarNotificacoes) {
    violacoes.push(
      'role nao pode ter privilegio DELETE sobre a tabela notificacoes (o expurgo deve ser executado exclusivamente pelo job de retencao)'
    );
  }

  if (estado.podeDeletarNotificacaoOutbox) {
    violacoes.push(
      'role nao pode ter privilegio DELETE sobre a tabela notificacao_outbox (o expurgo de estados terminais deve ocorrer exclusivamente pela rotina de retencao)'
    );
  }

  if (estado.podeDeletarPreferenciasNotificacao) {
    violacoes.push(
      'role nao pode ter privilegio DELETE sobre a tabela preferencias_notificacao'
    );
  }

  if (estado.podeDeletarDadosExternosSvo) {
    violacoes.push(
      'role nao pode ter privilegio DELETE sobre as tabelas protegidas de solicitacoes externas SVO (solicitacoes_svo_dados_externos, solicitacoes_svo_credenciais_externas, solicitacoes_svo_recuperacoes_tentativa)'
    );
  }

  if (
    Array.isArray(estado.privilegiosExcessivosTabelas) &&
    estado.privilegiosExcessivosTabelas.length > 0
  ) {
    violacoes.push(
      `role possui privilegios de tabela alem de SELECT/INSERT/UPDATE/DELETE: ${estado.privilegiosExcessivosTabelas.join(', ')}`
    );
  }

  if (violacoes.length > 0) {
    throw new Error(
      `Validacao de minimo privilegio falhou para a role "${estado.rolname}": ${violacoes.join('; ')}`
    );
  }

  return true;
}

/**
 * Consulta no catalogo do PostgreSQL os atributos efetivos, associacoes em pg_auth_members
 * e privilegios de schema/tabela da role informada.
 *
 * @param {import('knex').Knex} conexao
 * @param {string} appUser
 */
async function inspecionarEstadoRole(conexao, appUser) {
  const atributos = await conexao('pg_roles')
    .where({ rolname: appUser })
    .first(
      'rolname',
      'rolcanlogin',
      'rolsuper',
      'rolinherit',
      'rolcreaterole',
      'rolcreatedb',
      'rolreplication',
      'rolbypassrls'
    );

  if (!atributos) {
    return null;
  }

  const { rows: membershipsRows } = await conexao.raw(
    `SELECT r.rolname AS role_herdada
     FROM pg_auth_members m
     JOIN pg_roles r ON r.oid = m.roleid
     JOIN pg_roles u ON u.oid = m.member
     WHERE u.rolname = ?
     ORDER BY r.rolname`,
    [appUser]
  );

  const { rows: privRows } = await conexao.raw(
    `SELECT
       has_schema_privilege(?, 'public', 'CREATE') AS pode_criar_no_public,
       has_schema_privilege(?, 'public', 'USAGE') AS pode_usar_public,
       CASE
         WHEN to_regclass('public.knex_migrations') IS NOT NULL THEN
           has_table_privilege(?, 'public.knex_migrations', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         ELSE false
       END
       OR
       CASE
         WHEN to_regclass('public.knex_migrations_lock') IS NOT NULL THEN
           has_table_privilege(?, 'public.knex_migrations_lock', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         ELSE false
       END AS pode_acessar_migrations,
       CASE
         WHEN to_regclass('public.equipes_svo_integrantes') IS NOT NULL THEN
           has_table_privilege(?, 'public.equipes_svo_integrantes', 'DELETE')
         ELSE false
       END
       OR
       CASE
         WHEN to_regclass('public.ordens_svo_integrantes') IS NOT NULL THEN
           has_table_privilege(?, 'public.ordens_svo_integrantes', 'DELETE')
         ELSE false
       END AS pode_deletar_historico_svo,
       CASE
         WHEN to_regclass('public.deslocamentos_svo') IS NOT NULL THEN
           has_table_privilege(?, 'public.deslocamentos_svo', 'DELETE')
         ELSE false
       END
       OR
       CASE
         WHEN to_regclass('public.deslocamentos_svo_ordens') IS NOT NULL THEN
           has_table_privilege(?, 'public.deslocamentos_svo_ordens', 'DELETE')
         ELSE false
       END
       OR
       CASE
         WHEN to_regclass('public.evidencias_odometro') IS NOT NULL THEN
           has_table_privilege(?, 'public.evidencias_odometro', 'DELETE')
         ELSE false
       END AS pode_deletar_evidencias_odometro,
       CASE
         WHEN to_regclass('public.notificacoes') IS NOT NULL THEN
           has_table_privilege(?, 'public.notificacoes', 'DELETE')
         ELSE false
       END AS pode_deletar_notificacoes,
       CASE
         WHEN to_regclass('public.notificacao_outbox') IS NOT NULL THEN
           has_table_privilege(?, 'public.notificacao_outbox', 'DELETE')
         ELSE false
       END AS pode_deletar_notificacao_outbox,
       CASE
         WHEN to_regclass('public.preferencias_notificacao') IS NOT NULL THEN
           has_table_privilege(?, 'public.preferencias_notificacao', 'DELETE')
         ELSE false
       END AS pode_deletar_preferencias_notificacao,
       CASE
         WHEN to_regclass('public.solicitacoes_svo_dados_externos') IS NOT NULL THEN
           has_table_privilege(?, 'public.solicitacoes_svo_dados_externos', 'DELETE')
         ELSE false
       END
       OR
       CASE
         WHEN to_regclass('public.solicitacoes_svo_credenciais_externas') IS NOT NULL THEN
           has_table_privilege(?, 'public.solicitacoes_svo_credenciais_externas', 'DELETE')
         ELSE false
       END
       OR
       CASE
         WHEN to_regclass('public.solicitacoes_svo_recuperacoes_tentativa') IS NOT NULL THEN
           has_table_privilege(?, 'public.solicitacoes_svo_recuperacoes_tentativa', 'DELETE')
         ELSE false
       END AS pode_deletar_dados_externos_svo`,
    [
      appUser,
      appUser,
      appUser,
      appUser,
      appUser,
      appUser,
      appUser,
      appUser,
      appUser,
      appUser,
      appUser,
      appUser,
      appUser,
      appUser,
      appUser,
    ]
  );

  const { rows: excessivosRows } = await conexao.raw(
    `SELECT table_name, privilege_type
     FROM information_schema.role_table_grants
     WHERE grantee = ?
       AND table_schema = 'public'
       AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
     ORDER BY table_name, privilege_type`,
    [appUser]
  );

  return {
    ...atributos,
    rolesHerdadas: membershipsRows.map((r) => r.role_herdada),
    podeCriarNoPublic: Boolean(privRows[0]?.pode_criar_no_public),
    podeUsarPublic: Boolean(privRows[0]?.pode_usar_public),
    podeAcessarMigrations: Boolean(privRows[0]?.pode_acessar_migrations),
    podeDeletarHistoricoSvo: Boolean(privRows[0]?.pode_deletar_historico_svo),
    podeDeletarEvidenciasOdometro: Boolean(privRows[0]?.pode_deletar_evidencias_odometro),
    podeDeletarNotificacoes: Boolean(privRows[0]?.pode_deletar_notificacoes),
    podeDeletarNotificacaoOutbox: Boolean(privRows[0]?.pode_deletar_notificacao_outbox),
    podeDeletarPreferenciasNotificacao: Boolean(privRows[0]?.pode_deletar_preferencias_notificacao),
    podeDeletarDadosExternosSvo: Boolean(privRows[0]?.pode_deletar_dados_externos_svo),
    privilegiosExcessivosTabelas: excessivosRows.map(
      (r) => `${r.table_name}:${r.privilege_type}`
    ),
  };
}

/**
 * Monta o comando SQL de CREATE ROLE ou ALTER ROLE compativel com o privilegio
 * do usuario executor (superuser local vs role administrativa gerenciada como Neon).
 *
 * @param {{ roleExistente: boolean, executorEhSuperuser: boolean }} contexto
 */
function obterTemplateSqlRole({ roleExistente, executorEhSuperuser }) {
  if (!roleExistente) {
    return `SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT', ?::text, ?::text) AS cmd`;
  }

  if (executorEhSuperuser) {
    return `SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT', ?::text, ?::text) AS cmd`;
  }

  // Em provedores gerenciados (ex.: Neon), o owner possui CREATEROLE mas nao SUPERUSER;
  // aplica os atributos permitidos no ALTER ROLE e valida todos os demais (incluindo
  // rolsuper=false, rolreplication=false, rolbypassrls=false) em validarEstadoMinimoPrivilegio.
  return `SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOCREATEDB NOCREATEROLE NOINHERIT', ?::text, ?::text) AS cmd`;
}

async function provisionarUsuarioAplicacao() {
  const appUser = process.env.POSTGRES_APP_USER;
  const appPassword = process.env.POSTGRES_APP_PASSWORD;
  const dbName = process.env.POSTGRES_DB;

  if (!appUser || !appPassword || !dbName) {
    console.error(
      'Defina POSTGRES_DB, POSTGRES_APP_USER e POSTGRES_APP_PASSWORD no arquivo .env antes de executar este script.'
    );
    process.exit(1);
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appUser)) {
    console.error('POSTGRES_APP_USER deve conter apenas letras, numeros e underscore.');
    process.exit(1);
  }

  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });

  const db = knex(configMigration);

  try {
    const estadoValidado = await db.transaction(async (trx) => {
      const executor = await trx('pg_roles')
        .whereRaw('rolname = current_user')
        .first('rolname', 'rolsuper');
      const roleExistente = await trx('pg_roles').where({ rolname: appUser }).first('rolname');

      const templateSql = obterTemplateSqlRole({
        roleExistente: Boolean(roleExistente),
        executorEhSuperuser: Boolean(executor?.rolsuper),
      });

      const { rows: sqlRole } = await trx.raw(templateSql, [appUser, appPassword]);
      await trx.raw(sqlRole[0].cmd);

      // Revoga qualquer associacao herdada (pg_auth_members) que a role possa ter recebido anteriormente
      const { rows: herdadas } = await trx.raw(
        `SELECT r.rolname AS role_herdada
         FROM pg_auth_members m
         JOIN pg_roles r ON r.oid = m.roleid
         JOIN pg_roles u ON u.oid = m.member
         WHERE u.rolname = ?`,
        [appUser]
      );
      for (const item of herdadas) {
        await trx.raw('REVOKE ?? FROM ??', [item.role_herdada, appUser]);
      }

      // Remove permissao de criar objetos no schema public para usuarios comuns
      await trx.raw('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      await trx.raw('REVOKE ALL ON SCHEMA public FROM ??', [appUser]);

      // Concede apenas conexao no banco e uso do schema public (sem CREATE)
      await trx.raw('GRANT CONNECT ON DATABASE ?? TO ??', [dbName, appUser]);
      await trx.raw('GRANT USAGE ON SCHEMA public TO ??', [appUser]);

      // Revoga privilegios anteriores (como TRUNCATE/REFERENCES/TRIGGER) e concede apenas DML basico
      await trx.raw('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ??', [appUser]);
      await trx.raw('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ??', [
        appUser,
      ]);

      // A aplicacao nao deve ler nem alterar as tabelas internas de controle de migrations
      await trx.raw(
        `DO $$
        BEGIN
          IF to_regclass('public.knex_migrations') IS NOT NULL THEN
            EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.knex_migrations FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.knex_migrations_lock') IS NOT NULL THEN
            EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.knex_migrations_lock FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.equipes_svo_integrantes') IS NOT NULL THEN
            EXECUTE format('REVOKE DELETE ON TABLE public.equipes_svo_integrantes FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.ordens_svo_integrantes') IS NOT NULL THEN
            EXECUTE format('REVOKE DELETE ON TABLE public.ordens_svo_integrantes FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.deslocamentos_svo') IS NOT NULL THEN
            EXECUTE format('REVOKE DELETE ON TABLE public.deslocamentos_svo FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.deslocamentos_svo_ordens') IS NOT NULL THEN
            EXECUTE format('REVOKE DELETE ON TABLE public.deslocamentos_svo_ordens FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.evidencias_odometro') IS NOT NULL THEN
            EXECUTE format('REVOKE DELETE ON TABLE public.evidencias_odometro FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.excecoes_odometro') IS NOT NULL THEN
            EXECUTE format('REVOKE DELETE ON TABLE public.excecoes_odometro FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.evidencias_odometro_arquivos') IS NOT NULL THEN
            EXECUTE format('REVOKE UPDATE ON TABLE public.evidencias_odometro_arquivos FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.notificacoes') IS NOT NULL THEN
            EXECUTE format('REVOKE DELETE ON TABLE public.notificacoes FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.notificacao_outbox') IS NOT NULL THEN
            EXECUTE format('REVOKE DELETE ON TABLE public.notificacao_outbox FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.preferencias_notificacao') IS NOT NULL THEN
            EXECUTE format('REVOKE DELETE ON TABLE public.preferencias_notificacao FROM %I', '${appUser}');
          END IF;
          IF to_regclass('public.reprogramacoes_viagem_frota') IS NOT NULL THEN
            EXECUTE format('REVOKE UPDATE, DELETE ON TABLE public.reprogramacoes_viagem_frota FROM %I', '${appUser}');
          END IF;
        END $$;`
      );

      // Concede uso e leitura de sequences para colunas SERIAL / IDENTITY
      await trx.raw('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ??', [appUser]);
      await trx.raw('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ??', [appUser]);

      // Garante que tabelas e sequences criadas em futuras migrations recebam os mesmos privilegios minimos
      await trx.raw(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ??',
        [appUser]
      );
      await trx.raw(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ??',
        [appUser]
      );
      await trx.raw(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ??',
        [appUser]
      );
      await trx.raw(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ??',
        [appUser]
      );

      if (await trx.schema.withSchema('public').hasTable(DADOS)) {
        const corrigida = !(await trx.schema.withSchema('public').hasColumn(DADOS, 'endereco_ocorrencia'));
        const { rows: [migracoes] } = await trx.raw("SELECT to_regclass('public.knex_migrations') AS tabela");
        const acompanhamento = migracoes.tabela && await trx('public.knex_migrations')
          .where({ name: '20261128100000_scrum_266_acompanhamento_e_recuperacao_svo.js' })
          .first('id');
        await aplicarPrivilegiosSolicitacoesExternasSvo(trx, 'public', appUser, corrigida, Boolean(acompanhamento));
      }

      // Validacao obrigatoria dos atributos efetivos e privilegios antes de confirmar a transacao
      const estado = await inspecionarEstadoRole(trx, appUser);
      validarEstadoMinimoPrivilegio(estado);
      return estado;
    });

    console.log(
      `Role de minimo privilegio "${appUser}" configurada e validada com sucesso no banco "${dbName}" ` +
        `(rolsuper=${estadoValidado.rolsuper}, rolcreatedb=${estadoValidado.rolcreatedb}, ` +
        `rolcreaterole=${estadoValidado.rolcreaterole}, rolreplication=${estadoValidado.rolreplication}, ` +
        `rolbypassrls=${estadoValidado.rolbypassrls}, rolinherit=${estadoValidado.rolinherit}, ` +
        `rolesHerdadas=${estadoValidado.rolesHerdadas.length}).`
    );
  } finally {
    await db.destroy();
  }
}

module.exports = {
  validarEstadoMinimoPrivilegio,
  inspecionarEstadoRole,
  obterTemplateSqlRole,
  provisionarUsuarioAplicacao,
};

if (require.main === module) {
  provisionarUsuarioAplicacao().catch((erro) => {
    console.error('Falha ao provisionar role da aplicacao:', erro.message);
    process.exit(1);
  });
}
