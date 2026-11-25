const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');
const migrationScrum236 = require('../database/migrations/20261124203000_scrum_236_push_subscriptions_e_preferencias');
const {
  inspecionarEstadoRole,
  validarEstadoMinimoPrivilegio,
} = require('./provisionar-usuario-app.cjs');

async function esperarErroSql(trx, codigoEsperado, acao) {
  await trx.raw('SAVEPOINT sp_teste_negativo');
  try {
    await acao();
    return false;
  } catch (e) {
    await trx.raw('ROLLBACK TO SAVEPOINT sp_teste_negativo');
    await trx.raw('RELEASE SAVEPOINT sp_teste_negativo');
    return e && e.code === codigoEsperado;
  }
}

async function criarBaseIsolada(trx, schema) {
  await trx.raw('CREATE SCHEMA ??', [schema]);
  await trx.raw('SET LOCAL search_path TO ??', [schema]);

  await trx.raw(`
    CREATE TABLE usuarios (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      senha VARCHAR(255) NOT NULL,
      tipo_usuario VARCHAR(50) NOT NULL,
      perfil VARCHAR(50) NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT true,
      versao_sessao INTEGER NOT NULL DEFAULT 1
    );

    INSERT INTO usuarios (id, nome, email, senha, tipo_usuario, perfil)
    VALUES
      (1, 'Solicitante A', 'solicitante.a@exemplo.invalid', 'hash', 'SOLICITANTE', 'SOLICITANTE'),
      (2, 'Motorista B', 'motorista.b@exemplo.invalid', 'hash', 'MOTORISTA', 'MOTORISTA_FROTA'),
      (3, 'Integrante SVO C', 'integrante.c@exemplo.invalid', 'hash', 'INTEGRANTE_SVO', 'INTEGRANTE_SVO'),
      (4, 'Usuario Cascade D', 'cascade.d@exemplo.invalid', 'hash', 'SOLICITANTE', 'SOLICITANTE');
    SELECT setval(pg_get_serial_sequence('usuarios', 'id'), 4, true);
  `);
}

const CHAVE_P256DH_VALIDA =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const CHAVE_P256DH_RENOVADA =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const CHAVE_AUTH_VALIDA = 'tBHItJI5svbpez7KI4CCXg';
const CHAVE_AUTH_RENOVADA = 'vI7_kL9mN2pQ4rS6tU8wXy';

async function executarValidacaoCompletaScrum236() {
  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });
  const db = knex(configMigration);
  const relatorio = [];

  try {
    // 1. Bloqueio quando tabela base usuarios nao existe no schema
    const schemaSemBase = `val236_sem_base_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await trx.raw('CREATE SCHEMA ??', [schemaSemBase]);
        await trx.raw('SET LOCAL search_path TO ??', [schemaSemBase]);

        let bloqueouSemBase = false;
        try {
          await migrationScrum236.up(trx);
        } catch (e) {
          bloqueouSemBase = /tabela base usuarios ausente/i.test(e.message);
        }
        if (!bloqueouSemBase) {
          throw new Error('Migration up deveria ter bloqueado schema sem tabela base usuarios.');
        }
        throw new Error('ROLLBACK_ISOLADO');
      })
      .catch((e) => {
        if (e.message !== 'ROLLBACK_ISOLADO') throw e;
      });

    // 2. Bloqueio de estrutura preexistente incompativel no UP
    const schemaIncomp = `val236_inc_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsolada(trx, schemaIncomp);
        await trx.raw(`
          CREATE TABLE push_subscriptions (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER NOT NULL,
            endpoint VARCHAR(50) NOT NULL
          )
        `);

        let bloqueouIncompativel = false;
        try {
          await migrationScrum236.up(trx);
        } catch (e) {
          bloqueouIncompativel = /Estrutura incompativel em push_subscriptions/i.test(e.message);
        }
        if (!bloqueouIncompativel) {
          throw new Error(
            'Migration up deveria ter rejeitado tabela push_subscriptions preexistente incompativel.'
          );
        }
        throw new Error('ROLLBACK_ISOLADO');
      })
      .catch((e) => {
        if (e.message !== 'ROLLBACK_ISOLADO') throw e;
      });

    relatorio.push(
      '1. Bloqueio de ausencia de tabela base e estruturas preexistentes incompativeis no up: OK'
    );

    // 3. Validacao completa em schema isolado com concorrencia real e teste real da role frotas_app
    const schemaCiclo = `val236_ciclo_${Date.now()}`;
    try {
      await db.transaction(async (trx) => {
        await criarBaseIsolada(trx, schemaCiclo);
        await migrationScrum236.up(trx);
      });
      relatorio.push(
        '2. Aplicacao limpa da migration SCRUM-236 (up) e validacao de catalogo: OK'
      );

      // 3.1 Testa FKs (ON DELETE CASCADE), validacao de endpoint HTTPS, chaves Base64/Base64URL p256dh/auth e propriedade imutavel de endpoint
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);

        // Testa ON DELETE CASCADE para usuario 4 em ambas as tabelas
        await trx('push_subscriptions').insert({
          usuario_id: 4,
          endpoint: 'https://fcm.googleapis.com/fcm/send/device-cascade-4',
          p256dh: CHAVE_P256DH_VALIDA,
          auth: CHAVE_AUTH_VALIDA,
          user_agent: 'Mozilla/5.0 (Android 15; Mobile)',
        });
        await trx('preferencias_notificacao').insert({
          usuario_id: 4,
          categoria: 'VIAGENS',
          canal: 'WEB_PUSH',
        });

        await trx('usuarios').where({ id: 4 }).del();
        const restouPush4 = await trx('push_subscriptions')
          .where({ usuario_id: 4 })
          .count({ total: '*' })
          .first();
        const restouPref4 = await trx('preferencias_notificacao')
          .where({ usuario_id: 4 })
          .count({ total: '*' })
          .first();

        if (Number(restouPush4?.total || 0) !== 0 || Number(restouPref4?.total || 0) !== 0) {
          throw new Error(
            'ON DELETE CASCADE deveria remover assinaturas e preferencias do usuario excluido.'
          );
        }

        // Insere assinatura valida para usuario 1
        const [sub1] = await trx('push_subscriptions')
          .insert({
            usuario_id: 1,
            endpoint: 'https://fcm.googleapis.com/fcm/send/sub-usuario-1-dev-1',
            p256dh: CHAVE_P256DH_VALIDA,
            auth: CHAVE_AUTH_VALIDA,
            user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0',
          })
          .returning('*');

        // Proibicao de cadastrar ou transferir endpoint de outro usuario (BEFORE INSERT detecta propriedade alheia -> 23514)
        const bloqueouEndpointDeOutroUsuarioInsert = await esperarErroSql(trx, '23514', () =>
          trx('push_subscriptions').insert({
            usuario_id: 2,
            endpoint: 'https://fcm.googleapis.com/fcm/send/sub-usuario-1-dev-1',
            p256dh: CHAVE_P256DH_VALIDA,
            auth: CHAVE_AUTH_VALIDA,
          })
        );

        // Proibicao de transferir endpoint existente do usuario 1 para o usuario 2 via UPDATE (trigger -> 23514)
        const bloqueouTransferenciaEndpoint = await esperarErroSql(trx, '23514', () =>
          trx('push_subscriptions').where({ id: sub1.id }).update({ usuario_id: 2 })
        );

        // Proibicao de alterar o endpoint de uma assinatura existente via UPDATE (trigger -> 23514)
        const bloqueouMutacaoEndpoint = await esperarErroSql(trx, '23514', () =>
          trx('push_subscriptions')
            .where({ id: sub1.id })
            .update({ endpoint: 'https://fcm.googleapis.com/fcm/send/endpoint-trocado' })
        );

        // Proibicao de transferir endpoint via ON CONFLICT (endpoint) DO UPDATE SET usuario_id = 2 (trigger -> 23514)
        const bloqueouUpsertTransferencia = await esperarErroSql(trx, '23514', () =>
          trx.raw(
            `INSERT INTO push_subscriptions (usuario_id, endpoint, p256dh, auth)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (endpoint) DO UPDATE SET usuario_id = EXCLUDED.usuario_id`,
            [
              2,
              'https://fcm.googleapis.com/fcm/send/sub-usuario-1-dev-1',
              CHAVE_P256DH_VALIDA,
              CHAVE_AUTH_VALIDA,
            ]
          )
        );

        // Validacoes negativas de endpoint (nao-HTTPS, barras invertidas, controle, espacos) e chaves p256dh/auth
        const endpointsInvalidos = [
          'http://fcm.googleapis.com/fcm/send/inseguro-http',
          'https://fcm.googleapis.com/fcm/send/com\\barra-invertida',
          'https://fcm.googleapis.com/fcm/send/com espaco',
          'https://fcm.googleapis.com/fcm/send/com\nquebra',
          'ftp://fcm.googleapis.com/fcm/send/token-12345',
        ];

        for (const epInvalido of endpointsInvalidos) {
          const bloqueouEp = await esperarErroSql(trx, '23514', () =>
            trx('push_subscriptions').insert({
              usuario_id: 1,
              endpoint: epInvalido,
              p256dh: CHAVE_P256DH_VALIDA,
              auth: CHAVE_AUTH_VALIDA,
            })
          );
          if (!bloqueouEp) {
            throw new Error(
              `Endpoint invalido deveria ter sido bloqueado: ${JSON.stringify(epInvalido)}`
            );
          }
        }

        const bloqueouChaveCurta = await esperarErroSql(trx, '23514', () =>
          trx('push_subscriptions').insert({
            usuario_id: 1,
            endpoint: 'https://fcm.googleapis.com/fcm/send/chave-curta-12345',
            p256dh: 'curta',
            auth: '123',
          })
        );

        const bloqueouChaveForaBase64 = await esperarErroSql(trx, '23514', () =>
          trx('push_subscriptions').insert({
            usuario_id: 1,
            endpoint: 'https://fcm.googleapis.com/fcm/send/chave-invalida-base64',
            p256dh: 'CHAVE_COM_CARACTERES_INVALIDOS_$$$%%%###@@@!!!',
            auth: CHAVE_AUTH_VALIDA,
          })
        );

        const bloqueouChavesIguais = await esperarErroSql(trx, '23514', () =>
          trx('push_subscriptions').insert({
            usuario_id: 1,
            endpoint: 'https://fcm.googleapis.com/fcm/send/chaves-iguais-12345',
            p256dh: 'MESMA_CHAVE_CRIPTOGRAFICA_REPETIDA_123456',
            auth: 'MESMA_CHAVE_CRIPTOGRAFICA_REPETIDA_123456',
          })
        );

        if (
          !bloqueouEndpointDeOutroUsuarioInsert ||
          !bloqueouTransferenciaEndpoint ||
          !bloqueouMutacaoEndpoint ||
          !bloqueouUpsertTransferencia ||
          !bloqueouChaveCurta ||
          !bloqueouChaveForaBase64 ||
          !bloqueouChavesIguais
        ) {
          throw new Error(
            'Falha na validacao de propriedade do endpoint, bloqueio de transferencia ou protecao Base64 de p256dh/auth.'
          );
        }

        await trx('push_subscriptions').del();
      });

      relatorio.push(
        '3. FKs (ON DELETE CASCADE), propriedade imutavel do endpoint HTTPS e protecao Base64/Base64URL de p256dh/auth: OK'
      );

      // 3.2 Testa limite configuravel de dispositivos ativos (referencia 5), renovacao idempotente no limite maximo e liberacao de vaga ao revogar
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);

        const idsInseridos = [];
        for (let i = 1; i <= 5; i += 1) {
          const [sub] = await trx('push_subscriptions')
            .insert({
              usuario_id: 1,
              endpoint: `https://fcm.googleapis.com/fcm/send/u1-device-${i}`,
              p256dh: CHAVE_P256DH_VALIDA,
              auth: CHAVE_AUTH_VALIDA,
              user_agent: `Device ${i}`,
            })
            .returning('id');
          idsInseridos.push(sub.id);
        }

        // Renovacao idempotente (via INSERT ... ON CONFLICT (endpoint) DO UPDATE) do device-1 quando o usuario JA POSSUI 5 dispositivos ativos
        await trx.raw(
          `INSERT INTO push_subscriptions (usuario_id, endpoint, p256dh, auth, user_agent)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (endpoint) DO UPDATE
             SET p256dh = EXCLUDED.p256dh,
                 auth = EXCLUDED.auth,
                 user_agent = EXCLUDED.user_agent,
                 atualizado_em = CURRENT_TIMESTAMP`,
          [
            1,
            'https://fcm.googleapis.com/fcm/send/u1-device-1',
            CHAVE_P256DH_RENOVADA,
            CHAVE_AUTH_RENOVADA,
            'Device 1 Renovado',
          ]
        );

        const subRenovada = await trx('push_subscriptions')
          .where({ id: idsInseridos[0] })
          .first('p256dh', 'auth', 'user_agent');
        const qtdAtivosAposRenovacao = await trx('push_subscriptions')
          .where({ usuario_id: 1, ativa: true })
          .count({ total: '*' })
          .first();

        if (
          subRenovada?.p256dh !== CHAVE_P256DH_RENOVADA ||
          subRenovada?.auth !== CHAVE_AUTH_RENOVADA ||
          Number(qtdAtivosAposRenovacao?.total || 0) !== 5
        ) {
          throw new Error(
            'Renovacao idempotente de endpoint existente no limite maximo de 5 dispositivos falhou ou consumiu nova vaga.'
          );
        }

        // 6o dispositivo NOVO ativo deve continuar sendo bloqueado (referencia padrao = 5 -> 23514)
        const bloqueouSextoDispositivo = await esperarErroSql(trx, '23514', () =>
          trx('push_subscriptions').insert({
            usuario_id: 1,
            endpoint: 'https://fcm.googleapis.com/fcm/send/u1-device-6-excedente',
            p256dh: CHAVE_P256DH_VALIDA,
            auth: CHAVE_AUTH_VALIDA,
          })
        );

        if (!bloqueouSextoDispositivo) {
          throw new Error('Deveria ter bloqueado o 6o dispositivo ativo inÃƒÂ©dito (limite padrao 5).');
        }

        // Revoga o dispositivo 1 (status = REVOGADA, ativa = false) -> nao conta mais no limite de ativos
        await trx('push_subscriptions').where({ id: idsInseridos[0] }).update({
          status: 'REVOGADA',
          ativa: false,
          revogada_em: trx.fn.now(),
          atualizado_em: trx.fn.now(),
        });

        // Agora um novo dispositivo ativo pode ser cadastrado para o usuario 1
        await trx('push_subscriptions').insert({
          usuario_id: 1,
          endpoint: 'https://fcm.googleapis.com/fcm/send/u1-device-6-apos-revogacao',
          p256dh: CHAVE_P256DH_VALIDA,
          auth: CHAVE_AUTH_VALIDA,
        });

        // Com 5 ativos novamente, tentar reativar o dispositivo 1 que estava REVOGADO deve ser bloqueado (seria o 6o ativo -> 23514)
        const bloqueouReativacaoAcimaDoLimite = await esperarErroSql(trx, '23514', () =>
          trx('push_subscriptions').where({ id: idsInseridos[0] }).update({
            status: 'ATIVA',
            ativa: true,
            revogada_em: null,
            atualizado_em: trx.fn.now(),
          })
        );

        if (!bloqueouReativacaoAcimaDoLimite) {
          throw new Error(
            'Reativacao de assinatura revogada deveria ser bloqueada quando o usuario ja possui 5 outros dispositivos ativos.'
          );
        }

        // Testa limite configuravel na sessao (fsph.push_max_dispositivos_por_usuario = '2') para o usuario 2
        await trx.raw("SET LOCAL fsph.push_max_dispositivos_por_usuario = '2'");
        await trx('push_subscriptions').insert([
          {
            usuario_id: 2,
            endpoint: 'https://fcm.googleapis.com/fcm/send/u2-device-1',
            p256dh: CHAVE_P256DH_VALIDA,
            auth: CHAVE_AUTH_VALIDA,
          },
          {
            usuario_id: 2,
            endpoint: 'https://fcm.googleapis.com/fcm/send/u2-device-2',
            p256dh: CHAVE_P256DH_VALIDA,
            auth: CHAVE_AUTH_VALIDA,
          },
        ]);

        const bloqueouTerceiroComLimiteConfigurado = await esperarErroSql(trx, '23514', () =>
          trx('push_subscriptions').insert({
            usuario_id: 2,
            endpoint: 'https://fcm.googleapis.com/fcm/send/u2-device-3-excedente',
            p256dh: CHAVE_P256DH_VALIDA,
            auth: CHAVE_AUTH_VALIDA,
          })
        );

        if (!bloqueouTerceiroComLimiteConfigurado) {
          throw new Error(
            'Deveria ter respeitado o limite configuravel fsph.push_max_dispositivos_por_usuario = 2.'
          );
        }

        await trx('push_subscriptions').del();
      });

      relatorio.push(
        '4. Limite configuravel (padrao 5), renovacao idempotente de endpoint existente no limite maximo e liberacao de vaga ao revogar: OK'
      );

      // 3.3 Concorrencia real: duas transacoes simultaneas disputando a 5a e ultima vaga de dispositivo ativo do mesmo usuario
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);
        for (let i = 1; i <= 4; i += 1) {
          await trx('push_subscriptions').insert({
            usuario_id: 1,
            endpoint: `https://fcm.googleapis.com/fcm/send/conc-base-${i}`,
            p256dh: CHAVE_P256DH_VALIDA,
            auth: CHAVE_AUTH_VALIDA,
          });
        }
      });

      let prontas = 0;
      let liberarBarreira;
      const barreira = new Promise((resolve) => {
        liberarBarreira = resolve;
      });

      const tentativaDisputaVaga = async (indice) => {
        return db.transaction(async (trx) => {
          await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);
          prontas += 1;
          if (prontas === 2) {
            liberarBarreira();
          } else {
            await barreira;
          }

          await trx('push_subscriptions').insert({
            usuario_id: 1,
            endpoint: `https://fcm.googleapis.com/fcm/send/conc-disputa-vaga-${indice}`,
            p256dh: CHAVE_P256DH_VALIDA,
            auth: CHAVE_AUTH_VALIDA,
          });
          return 'INSERIDA';
        });
      };

      const resultadosDisputa = await Promise.allSettled([
        tentativaDisputaVaga(1),
        tentativaDisputaVaga(2),
      ]);

      const sucessosDisputa = resultadosDisputa.filter((r) => r.status === 'fulfilled');
      const bloqueiosLimite = resultadosDisputa.filter(
        (r) => r.status === 'rejected' && r.reason && r.reason.code === '23514'
      );
      const totalAtivosUsuario1 = await db
        .withSchema(schemaCiclo)
        .from('push_subscriptions')
        .where({ usuario_id: 1, ativa: true })
        .count({ total: '*' })
        .first();

      if (
        sucessosDisputa.length !== 1 ||
        bloqueiosLimite.length !== 1 ||
        Number(totalAtivosUsuario1?.total || 0) !== 5
      ) {
        throw new Error(
          `Falha na serializacao concorrente do limite de dispositivos: sucessos=${sucessosDisputa.length}, bloqueios=${bloqueiosLimite.length}, ativos=${totalAtivosUsuario1?.total}`
        );
      }

      relatorio.push(
        '5. Concorrencia real entre duas transacoes simultaneas disputando a 5a vaga de dispositivo ativo (serializacao FOR UPDATE): OK'
      );

      // 3.4 Testa preferencias_notificacao com padrao conservador (DEFAULT false) e elegibilidade de expurgo de assinaturas inativas (404/410/revogadas)
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);

        // Insere preferencia sem informar habilitado -> deve assumir o padrao conservador (habilitado = false)
        const [prefDefaultConservador] = await trx('preferencias_notificacao')
          .insert({
            usuario_id: 1,
            categoria: 'SOLICITACOES',
            canal: 'WEB_PUSH',
          })
          .returning(['id', 'habilitado']);

        if (prefDefaultConservador?.habilitado !== false) {
          throw new Error(
            `Comportamento conservador falhou: preferencias_notificacao.habilitado deveria iniciar como false por padrao, encontrado ${prefDefaultConservador?.habilitado}`
          );
        }

        await trx('preferencias_notificacao').insert({
          usuario_id: 1,
          categoria: 'VIAGENS',
          canal: 'WEB_PUSH',
          habilitado: true,
        });

        const bloqueouPreferenciaDuplicada = await esperarErroSql(trx, '23505', () =>
          trx('preferencias_notificacao').insert({
            usuario_id: 1,
            categoria: 'SOLICITACOES',
            canal: 'WEB_PUSH',
            habilitado: true,
          })
        );

        const bloqueouCategoriaMinusculaOuInvalida = await esperarErroSql(trx, '23514', () =>
          trx('preferencias_notificacao').insert({
            usuario_id: 1,
            categoria: 'viagens invalida',
            canal: 'WEB_PUSH',
            habilitado: true,
          })
        );

        const bloqueouCanalInAppDesativavel = await esperarErroSql(trx, '23514', () =>
          trx('preferencias_notificacao').insert({
            usuario_id: 1,
            categoria: 'ODOMETRO',
            canal: 'IN_APP',
            habilitado: false,
          })
        );

        if (
          !bloqueouPreferenciaDuplicada ||
          !bloqueouCategoriaMinusculaOuInvalida ||
          !bloqueouCanalInAppDesativavel
        ) {
          throw new Error('Falha nas constraints de preferencias_notificacao.');
        }

        // Marca uma assinatura como EXPIRADA (410 Gone) e outra como INVALIDA (404 Not Found) e valida query de expurgo
        const subsAtivas = await trx('push_subscriptions')
          .where({ usuario_id: 1, ativa: true })
          .orderBy('id', 'asc')
          .limit(2);

        const tsCriacaoAntiga = new Date('2026-09-15T10:00:00.000Z');
        const tsPassado = new Date('2026-10-01T10:00:00.000Z');
        await trx('push_subscriptions').where({ id: subsAtivas[0].id }).update({
          status: 'EXPIRADA',
          ativa: false,
          ultimo_status_http: 410,
          criado_em: tsCriacaoAntiga,
          ultimo_erro_em: tsPassado,
          expirada_em: tsPassado,
          atualizado_em: tsPassado,
        });

        await trx('push_subscriptions').where({ id: subsAtivas[1].id }).update({
          status: 'INVALIDA',
          ativa: false,
          ultimo_status_http: 404,
          criado_em: tsCriacaoAntiga,
          ultimo_erro_em: tsPassado,
          atualizado_em: tsPassado,
        });

        const { rows: elegiveisExpurgoPush } = await trx.raw(
          `SELECT id, status, ultimo_status_http
           FROM push_subscriptions
           WHERE ativa = false
             AND status IN ('REVOGADA', 'EXPIRADA', 'INVALIDA')
           ORDER BY id ASC`
        );

        if (elegiveisExpurgoPush.length !== 2) {
          throw new Error(
            `Query de expurgo de push_subscriptions deveria encontrar 2 assinaturas inativas (404/410), encontrou ${elegiveisExpurgoPush.length}`
          );
        }

        relatorio.push(
          '6. Preferencias por categoria/canal com padrao conservador (DEFAULT false, sem bloquear In-App) e expurgo 404/410: OK'
        );
      });

      // 3.5 Teste real dos privilegios da role da aplicacao dentro do schema isolado
      const appUser = process.env.POSTGRES_APP_USER;
      if (appUser) {
        const roleApp = await db('pg_roles').where({ rolname: appUser }).first('rolname');
        if (roleApp) {
          await db.raw('GRANT USAGE ON SCHEMA ?? TO ??', [schemaCiclo, appUser]);
          await db.raw('GRANT SELECT, UPDATE ON TABLE ??.usuarios TO ??', [schemaCiclo, appUser]);

          const { rows: privSchemaIsolado } = await db.raw(
            `SELECT
               has_table_privilege(?, ? || '.push_subscriptions', 'SELECT') AS push_select,
               has_table_privilege(?, ? || '.push_subscriptions', 'INSERT') AS push_insert,
               has_table_privilege(?, ? || '.push_subscriptions', 'UPDATE') AS push_update,
               has_table_privilege(?, ? || '.push_subscriptions', 'DELETE') AS push_delete,
               has_table_privilege(?, ? || '.preferencias_notificacao', 'SELECT') AS pref_select,
               has_table_privilege(?, ? || '.preferencias_notificacao', 'INSERT') AS pref_insert,
               has_table_privilege(?, ? || '.preferencias_notificacao', 'UPDATE') AS pref_update,
               has_table_privilege(?, ? || '.preferencias_notificacao', 'DELETE') AS pref_delete`,
            [
              appUser,
              schemaCiclo,
              appUser,
              schemaCiclo,
              appUser,
              schemaCiclo,
              appUser,
              schemaCiclo,
              appUser,
              schemaCiclo,
              appUser,
              schemaCiclo,
              appUser,
              schemaCiclo,
              appUser,
              schemaCiclo,
            ]
          );

          const p = privSchemaIsolado[0];
          if (
            !p?.push_select ||
            !p?.push_insert ||
            !p?.push_update ||
            !p?.push_delete ||
            !p?.pref_select ||
            !p?.pref_insert ||
            !p?.pref_update ||
            p?.pref_delete
          ) {
            throw new Error(
              `Permissoes incorretas para ${appUser} no schema isolado: ${JSON.stringify(p)}`
            );
          }

          if (process.env.POSTGRES_APP_PASSWORD) {
            const dbApp = knex(
              knexConfig.criarConfigKnex({
                ...process.env,
                DB_ROLE: 'app',
              })
            );
            try {
              const [subApp] = await dbApp
                .withSchema(schemaCiclo)
                .into('push_subscriptions')
                .insert({
                  usuario_id: 3,
                  endpoint: 'https://fcm.googleapis.com/fcm/send/app-role-test-u3',
                  p256dh: CHAVE_P256DH_VALIDA,
                  auth: CHAVE_AUTH_VALIDA,
                })
                .returning('id');

              await dbApp
                .withSchema(schemaCiclo)
                .from('push_subscriptions')
                .where({ id: subApp.id })
                .del();

              const [prefApp] = await dbApp
                .withSchema(schemaCiclo)
                .into('preferencias_notificacao')
                .insert({
                  usuario_id: 3,
                  categoria: 'SVO',
                  canal: 'WEB_PUSH',
                })
                .returning(['id', 'habilitado']);

              if (prefApp.habilitado !== false) {
                throw new Error('Insercao pela role da aplicacao deveria respeitar DEFAULT false.');
              }

              await dbApp
                .withSchema(schemaCiclo)
                .from('preferencias_notificacao')
                .where({ id: prefApp.id })
                .update({ habilitado: true, atualizado_em: dbApp.fn.now() });

              let deletePrefBloqueado = false;
              try {
                await dbApp
                  .withSchema(schemaCiclo)
                  .from('preferencias_notificacao')
                  .where({ id: prefApp.id })
                  .del();
              } catch (erroDelPref) {
                deletePrefBloqueado = erroDelPref && erroDelPref.code === '42501';
              }

              if (!deletePrefBloqueado) {
                throw new Error(
                  `Role ${appUser} nao deveria conseguir executar DELETE em preferencias_notificacao.`
                );
              }
            } finally {
              await dbApp.destroy();
            }
          }

          const estadoRole = await inspecionarEstadoRole(db, appUser);
          if (estadoRole) {
            validarEstadoMinimoPrivilegio(estadoRole);
          }

          relatorio.push(
            `7. Teste real da role "${appUser}" no schema isolado (push_subscriptions e preferencias_notificacao com DELETE bloqueado 42501 em preferencias): OK`
          );
        }
      }

      // 3.6 Testa protecao de rollback (down bloqueado com dados) e ciclo down/up limpo
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);

        let bloqueouDownComPush = false;
        try {
          await migrationScrum236.down(trx);
        } catch (e) {
          bloqueouDownComPush =
            /Rollback bloqueado: existem registros em push_subscriptions/i.test(e.message);
        }
        if (!bloqueouDownComPush) {
          throw new Error(
            'Migration down deveria ter bloqueado rollback com registros em push_subscriptions.'
          );
        }

        await trx('push_subscriptions').del();

        let bloqueouDownComPref = false;
        try {
          await migrationScrum236.down(trx);
        } catch (e) {
          bloqueouDownComPref =
            /Rollback bloqueado: existem registros em preferencias_notificacao/i.test(e.message);
        }
        if (!bloqueouDownComPref) {
          throw new Error(
            'Migration down deveria ter bloqueado rollback com registros em preferencias_notificacao.'
          );
        }

        await trx('preferencias_notificacao').del();
        await migrationScrum236.down(trx);
        await migrationScrum236.up(trx);

        relatorio.push(
          '8. Protecao contra rollback destrutivo em ambas as tabelas e ciclo completo down -> up idempotente: OK'
        );
      });
    } finally {
      await db.raw('DROP SCHEMA ?? CASCADE', [schemaCiclo]);
    }

    console.log('=== VALIDACAO MIGRATION SCRUM-236 CONCLUIDA COM SUCESSO ===');
    for (const item of relatorio) {
      console.log(` - ${item}`);
    }
  } finally {
    await db.destroy();
  }
}

module.exports = {
  executarValidacaoCompletaScrum236,
};

if (require.main === module) {
  executarValidacaoCompletaScrum236().catch((erro) => {
    console.error('Falha na validacao da migration SCRUM-236:', erro.message);
    process.exit(1);
  });
}
