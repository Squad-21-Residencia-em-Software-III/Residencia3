const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');
const {
  obterTemplateSqlRole,
  inspecionarEstadoRole,
  validarEstadoMinimoPrivilegio,
} = require('./provisionar-usuario-app.cjs');

async function provisionarRolesCron() {
  const dbName = process.env.POSTGRES_DB;
  const expUser = process.env.FSPH_CRON_EXPIRACAO_USER || 'frotas_cron_expiracao';
  const expPassword = process.env.FSPH_CRON_EXPIRACAO_PASSWORD;
  const retUser = process.env.FSPH_CRON_RETENCAO_USER || 'frotas_cron_retencao';
  const retPassword = process.env.FSPH_CRON_RETENCAO_PASSWORD;

  if (!dbName || !expPassword || !retPassword) {
    console.error(
      'Defina POSTGRES_DB, FSPH_CRON_EXPIRACAO_PASSWORD e FSPH_CRON_RETENCAO_PASSWORD no .env antes de executar este script.'
    );
    process.exit(1);
  }

  for (const nome of [expUser, retUser]) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nome)) {
      console.error(`Nome de role invalido: ${nome}`);
      process.exit(1);
    }
  }

  const db = knex(
    knexConfig.criarConfigKnex({
      ...process.env,
      DB_ROLE: 'migration',
    })
  );

  try {
    await db.transaction(async (trx) => {
      const executor = await trx('pg_roles')
        .whereRaw('rolname = current_user')
        .first('rolname', 'rolsuper');
      const ehSuper = Boolean(executor?.rolsuper);

      // 1. Role de expiracao administrativa (fsph-expiracao-neon)
      const expExiste = await trx('pg_roles').where({ rolname: expUser }).first('rolname');
      const { rows: sqlExp } = await trx.raw(
        obterTemplateSqlRole({ roleExistente: Boolean(expExiste), executorEhSuperuser: ehSuper }),
        [expUser, expPassword]
      );
      await trx.raw(sqlExp[0].cmd);
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
      const retExiste = await trx('pg_roles').where({ rolname: retUser }).first('rolname');
      const { rows: sqlRet } = await trx.raw(
        obterTemplateSqlRole({ roleExistente: Boolean(retExiste), executorEhSuperuser: ehSuper }),
        [retUser, retPassword]
      );
      await trx.raw(sqlRet[0].cmd);
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

      for (const r of [expUser, retUser]) {
        const estado = await inspecionarEstadoRole(trx, r);
        validarEstadoMinimoPrivilegio(estado);
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
