const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');
const {
  obterTemplateSqlRole,
  inspecionarEstadoRole,
  validarEstadoMinimoPrivilegio,
} = require('./provisionar-usuario-app.cjs');

async function aplicarAtributosRole(trx, nome, senha, roleExistente, executorEhSuperuser) {
  if (roleExistente && senha === undefined) {
    const atributos = executorEhSuperuser
      ? 'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT'
      : 'NOCREATEDB NOCREATEROLE NOINHERIT';
    await trx.raw(`ALTER ROLE ?? WITH LOGIN ${atributos}`, [nome]);
    return;
  }

  const template = obterTemplateSqlRole({ roleExistente, executorEhSuperuser });
  const { rows: [sql] } = await trx.raw(template, [nome, senha]);
  await trx.raw(sql.cmd);
}

async function provisionarRolesCron({ env = process.env, criarConexao = knex } = {}) {
  const dbName = env.POSTGRES_DB;
  const expUser = env.FSPH_CRON_EXPIRACAO_USER || 'frotas_cron_expiracao';
  const retUser = env.FSPH_CRON_RETENCAO_USER || 'frotas_cron_retencao';
  const nomesCron = [expUser, retUser];
  // A rotacao das senhas existentes exige FSPH_CRON_ROTACIONAR_SENHAS=true.
  const rotacionarSenhas = env.FSPH_CRON_ROTACIONAR_SENHAS === 'true';

  if (!dbName) {
    throw new Error('Defina POSTGRES_DB antes de executar este script.');
  }
  if (expUser === retUser) {
    throw new Error('FSPH_CRON_EXPIRACAO_USER e FSPH_CRON_RETENCAO_USER devem ser distintos.');
  }

  const nomesReservados = [
    'frotas_app',
    'postgres',
    'public',
    env.POSTGRES_APP_USER,
    env.POSTGRES_MIGRATION_USER,
    env.POSTGRES_USER,
  ];
  for (const nome of nomesCron) {
    // Identificadores PostgreSQL acima de 63 bytes podem ser truncados.
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(nome)) {
      throw new Error(
        `Nome de role invalido: "${nome}". Use ate 63 caracteres ASCII (letras, numeros e underscore).`
      );
    }
    if (nomesReservados.includes(nome) || nome.startsWith('pg_')) {
      throw new Error(`Nome de role reservado para aplicacao ou administracao do banco: "${nome}".`);
    }
  }

  const db = criarConexao(knexConfig.criarConfigKnex({ ...env, DB_ROLE: 'migration' }));

  try {
    await db.transaction(async (trx) => {
      const { rows: [executor] } = await trx.raw(
        'SELECT rolname, rolsuper, session_user AS usuario_sessao FROM pg_roles WHERE rolname = current_user'
      );
      for (const nome of nomesCron) {
        if (nome === executor?.rolname || nome === executor?.usuario_sessao) {
          throw new Error(`Nome de role reservado para o usuario executor: "${nome}".`);
        }
      }

      const ehSuper = Boolean(executor?.rolsuper);
      const rolesExistentes = await trx('pg_roles').whereIn('rolname', nomesCron).select('rolname');
      const expExiste = rolesExistentes.some(({ rolname }) => rolname === expUser);
      const retExiste = rolesExistentes.some(({ rolname }) => rolname === retUser);
      const expPassword = expExiste && !rotacionarSenhas ? undefined : env.FSPH_CRON_EXPIRACAO_PASSWORD;
      const retPassword = retExiste && !rotacionarSenhas ? undefined : env.FSPH_CRON_RETENCAO_PASSWORD;

      if ((!expExiste || rotacionarSenhas) && !expPassword) {
        throw new Error('Defina FSPH_CRON_EXPIRACAO_PASSWORD para criar a role ou rotacionar sua senha.');
      }
      if ((!retExiste || rotacionarSenhas) && !retPassword) {
        throw new Error('Defina FSPH_CRON_RETENCAO_PASSWORD para criar a role ou rotacionar sua senha.');
      }

      // 1. Role de expiracao administrativa (fsph-expiracao-neon)
      await aplicarAtributosRole(trx, expUser, expPassword, expExiste, ehSuper);
      await trx.raw('REVOKE ALL ON SCHEMA public FROM ??', [expUser]);
      await trx.raw('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ??', [expUser]);
      await trx.raw('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ??', [expUser]);
      await trx.raw('GRANT CONNECT ON DATABASE ?? TO ??', [dbName, expUser]);
      await trx.raw('GRANT USAGE ON SCHEMA public TO ??', [expUser]);
      await trx.raw(
        'GRANT SELECT (id, status, data_saida_desejada), UPDATE (status) ON TABLE public.solicitacoes_viagem TO ??',
        [expUser]
      );
      await trx.raw('GRANT SELECT (id, solicitacao_id, status) ON TABLE public.viagens_frota TO ??', [
        expUser,
      ]);
      await trx.raw('GRANT INSERT (usuario_id, acao, modulo) ON TABLE public.auditorias TO ??', [
        expUser,
      ]);
      await trx.raw('GRANT USAGE ON SEQUENCE public.auditorias_id_seq TO ??', [expUser]);

      // 2. Role de retencao das fotos do odometro (fsph-retencao-neon)
      await aplicarAtributosRole(trx, retUser, retPassword, retExiste, ehSuper);
      await trx.raw('REVOKE ALL ON SCHEMA public FROM ??', [retUser]);
      await trx.raw('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ??', [retUser]);
      await trx.raw('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ??', [retUser]);
      await trx.raw('GRANT CONNECT ON DATABASE ?? TO ??', [dbName, retUser]);
      await trx.raw('GRANT USAGE ON SCHEMA public TO ??', [retUser]);
      await trx.raw(
        'GRANT SELECT (id, status, modalidade, preservacao_legal, criado_em, retencao_ate, conclusao_operacao_em, tipo_operacao, viagem_frota_id, deslocamento_svo_id), UPDATE (status, storage_key, expurgado_em, expurgo_motivo) ON TABLE public.evidencias_odometro TO ??',
        [retUser]
      );
      await trx.raw(
        'GRANT SELECT (evidencia_id), DELETE ON TABLE public.evidencias_odometro_arquivos TO ??',
        [retUser]
      );
      await trx.raw(
        'GRANT SELECT (id, status, data_hora_efetiva_chegada) ON TABLE public.viagens_frota TO ??',
        [retUser]
      );
      await trx.raw(
        'GRANT SELECT (id, status, data_hora_conclusao) ON TABLE public.deslocamentos_svo TO ??',
        [retUser]
      );
      await trx.raw(
        'GRANT SELECT (deslocamento_svo_id, ordem_svo_id) ON TABLE public.deslocamentos_svo_ordens TO ??',
        [retUser]
      );
      await trx.raw('GRANT SELECT (id, status) ON TABLE public.ordens_svo TO ??', [retUser]);
      // Expurgo de notificacoes (SCRUM-242): le so as colunas de data e remove linhas elegiveis.
      await trx.raw(
        'GRANT SELECT (id, lida_em, criado_em), DELETE ON TABLE public.notificacoes TO ??',
        [retUser]
      );

      for (const r of nomesCron) {
        const estado = await inspecionarEstadoRole(trx, r);
        // Apenas a role de retencao pode deletar notificacoes; a de expiracao continua proibida.
        validarEstadoMinimoPrivilegio(estado, { permitirDeletarNotificacoes: r === retUser });
      }
    });

    console.log(
      `Roles de cron "${expUser}" e "${retUser}" provisionadas e validadas com minimo privilegio no banco "${dbName}".`
    );
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  provisionarRolesCron().catch((erro) => {
    console.error('Falha ao provisionar roles de cron:', erro.message);
    process.exit(1);
  });
}

module.exports = { provisionarRolesCron };
