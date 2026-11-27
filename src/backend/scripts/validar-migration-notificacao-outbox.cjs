const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');
const migrationNotificacoesInApp = require('../database/migrations/20261124193000_scrum_225_notificacoes_in_app');
const migrationNotificacaoOutbox = require('../database/migrations/20261124200000_scrum_228_notificacao_outbox');
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
      (3, 'Usuario Cascade C', 'cascade.c@exemplo.invalid', 'hash', 'SOLICITANTE', 'SOLICITANTE');
    SELECT setval(pg_get_serial_sequence('usuarios', 'id'), 3, true);
  `);

  // Utiliza a migration real da notificacoes in app para garantir estrutura e constraints efetivas de notificacoes
  await migrationNotificacoesInApp.up(trx);
}

async function executarValidacaoNotificacaoOutbox() {
  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });
  const db = knex(configMigration);
  const relatorio = [];

  try {
    // 1. Bloqueio quando tabela base usuarios nao existe no schema
    const schemaSemBase = `val228_sem_base_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await trx.raw('CREATE SCHEMA ??', [schemaSemBase]);
        await trx.raw('SET LOCAL search_path TO ??', [schemaSemBase]);

        let bloqueouSemBase = false;
        try {
          await migrationNotificacaoOutbox.up(trx);
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
    const schemaIncomp = `val228_inc_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsolada(trx, schemaIncomp);
        await trx.raw(`
          CREATE TABLE notificacao_outbox (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER NOT NULL,
            payload_push TEXT NOT NULL
          )
        `);

        let bloqueouIncompativel = false;
        try {
          await migrationNotificacaoOutbox.up(trx);
        } catch (e) {
          bloqueouIncompativel = /Estrutura incompativel em notificacao_outbox/i.test(e.message);
        }
        if (!bloqueouIncompativel) {
          throw new Error(
            'Migration up deveria ter rejeitado tabela notificacao_outbox preexistente incompativel.'
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

    // 3. Ciclo completo em schema isolado com migration real da notificacoes in app, concorrencia real e teste real da role frotas_app
    const schemaCiclo = `val228_ciclo_${Date.now()}`;
    try {
      await db.transaction(async (trx) => {
        await criarBaseIsolada(trx, schemaCiclo);
        await migrationNotificacaoOutbox.up(trx);
      });
      relatorio.push(
        '2. Aplicacao limpa da migration notificacao outbox sobre a migration real da notificacoes in app e validacao de catalogo: OK'
      );

      // 3.1 Atomicidade transacional (NF-06), FK ON DELETE CASCADE e independencia de retencao de notificacao_id
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);

        // Testa ON DELETE CASCADE quando usuario 3 eh removido
        await trx('notificacao_outbox').insert({
          usuario_id: 3,
          evento_tipo: 'A2_SOLICITACAO_APROVADA',
          categoria: 'SOLICITACOES',
          operacao: 'Administrativo',
          referencia_tipo: 'SOLICITACAO_VIAGEM',
          referencia_id: 300,
          ocorrencia_versao: 'v1',
          chave_idempotencia: 'A2:SOL:300:v1',
          canal: 'WEB_PUSH',
        });
        await trx('usuarios').where({ id: 3 }).del();
        const restouOutbox3 = await trx('notificacao_outbox')
          .where({ usuario_id: 3 })
          .count({ total: '*' })
          .first();
        if (Number(restouOutbox3?.total || 0) !== 0) {
          throw new Error(
            'FK fk_notificacao_outbox_usuario deveria remover registros via ON DELETE CASCADE.'
          );
        }

        // Atomicidade transacional (NF-06): rollback da operacao de dominio desfaz In-App e Outbox juntos
        await trx.raw('SAVEPOINT sp_operacao_revertida');
        const [notifRevertida] = await trx('notificacoes')
          .insert({
            usuario_id: 2,
            tipo: 'A5_VIAGEM_AGENDADA',
            titulo: 'Nova viagem agendada (#50)',
            mensagem: 'Viagem #50 agendada para voce.',
            severidade: 'info',
            operacao: 'Administrativo',
            referencia_tipo: 'VIAGEM_FROTA',
            referencia_id: 50,
            url_destino: '/viagens',
            chave_idempotencia: 'A5:VIAGEM_FROTA:50:v1',
          })
          .returning('*');

        await trx('notificacao_outbox').insert({
          notificacao_id: notifRevertida.id,
          usuario_id: 2,
          evento_tipo: 'A5_VIAGEM_AGENDADA',
          categoria: 'VIAGENS',
          operacao: 'Administrativo',
          referencia_tipo: 'VIAGEM_FROTA',
          referencia_id: 50,
          ocorrencia_versao: 'v1',
          chave_idempotencia: 'A5:VIAGEM_FROTA:50:v1',
          canal: 'WEB_PUSH',
          payload_push: {
            titulo: 'Nova viagem agendada (#50)',
            mensagem: 'Voce foi escalado para uma viagem. Toque para abrir.',
            url: '/viagens',
            tag: 'viagem-50',
          },
        });

        await trx.raw('ROLLBACK TO SAVEPOINT sp_operacao_revertida');
        await trx.raw('RELEASE SAVEPOINT sp_operacao_revertida');

        const qtdInAppAposRollback = await trx('notificacoes').count({ total: '*' }).first();
        const qtdOutboxAposRollback = await trx('notificacao_outbox').count({ total: '*' }).first();
        if (
          Number(qtdInAppAposRollback?.total || 0) !== 0 ||
          Number(qtdOutboxAposRollback?.total || 0) !== 0
        ) {
          throw new Error(
            'Falha de atomicidade (NF-06): rollback da operacao deixou residuos em notificacoes ou notificacao_outbox.'
          );
        }

        relatorio.push(
          '3. FK (ON DELETE CASCADE) e atomicidade transacional (NF-06: rollback reverte In-App e Outbox juntos): OK'
        );

        // 3.2 Viagens e coletas distintas com o mesmo destinatario e mesma versao ('v1'), deduplicacao de retry e reprogramacao legitima (NF-08)
        const tsCriacao = new Date('2026-11-24T12:00:00.000Z');

        // Duas viagens distintas (#50 e #51) para o mesmo motorista (usuario 2) com a mesma ocorrencia_versao ('v1')
        await trx('notificacao_outbox').insert([
          {
            usuario_id: 2,
            evento_tipo: 'A5_VIAGEM_AGENDADA',
            categoria: 'VIAGENS',
            operacao: 'Administrativo',
            referencia_tipo: 'VIAGEM_FROTA',
            referencia_id: 50,
            ocorrencia_versao: 'v1',
            chave_idempotencia: 'A5:VIAGEM_FROTA:50:v1',
            canal: 'WEB_PUSH',
            criado_em: tsCriacao,
            atualizado_em: tsCriacao,
          },
          {
            usuario_id: 2,
            evento_tipo: 'A5_VIAGEM_AGENDADA',
            categoria: 'VIAGENS',
            operacao: 'Administrativo',
            referencia_tipo: 'VIAGEM_FROTA',
            referencia_id: 51,
            ocorrencia_versao: 'v1',
            chave_idempotencia: 'A5:VIAGEM_FROTA:51:v1',
            canal: 'WEB_PUSH',
            criado_em: tsCriacao,
            atualizado_em: tsCriacao,
          },
        ]);

        // Duas coletas SVO distintas (#101 e #102) para o mesmo destinatario (usuario 2) com a mesma ocorrencia_versao ('v1')
        await trx('notificacao_outbox').insert([
          {
            usuario_id: 2,
            evento_tipo: 'S3_COLETA_ALOCADA',
            categoria: 'SVO',
            operacao: 'SVO',
            referencia_tipo: 'ORDEM_SVO',
            referencia_id: 101,
            ocorrencia_versao: 'v1',
            chave_idempotencia: 'S3:ORDEM_SVO:101:v1',
            canal: 'WEB_PUSH',
            criado_em: tsCriacao,
            atualizado_em: tsCriacao,
          },
          {
            usuario_id: 2,
            evento_tipo: 'S3_COLETA_ALOCADA',
            categoria: 'SVO',
            operacao: 'SVO',
            referencia_tipo: 'ORDEM_SVO',
            referencia_id: 102,
            ocorrencia_versao: 'v1',
            chave_idempotencia: 'S3:ORDEM_SVO:102:v1',
            canal: 'WEB_PUSH',
            criado_em: tsCriacao,
            atualizado_em: tsCriacao,
          },
        ]);

        const [notifConfirmada] = await trx('notificacoes')
          .insert({
            usuario_id: 2,
            tipo: 'A6_VIAGEM_REPROGRAMADA',
            titulo: 'Viagem reprogramada (#55)',
            mensagem: 'Novo horario previsto: 25/11 10:00.',
            severidade: 'warning',
            operacao: 'Administrativo',
            referencia_tipo: 'VIAGEM_FROTA',
            referencia_id: 55,
            url_destino: '/viagens',
            chave_idempotencia: 'A6:VIAGEM_FROTA:55:2026-11-25T10:00Z',
            criado_em: tsCriacao,
          })
          .returning('*');

        const [outboxV1] = await trx('notificacao_outbox')
          .insert({
            notificacao_id: notifConfirmada.id,
            usuario_id: 2,
            evento_tipo: 'A6_VIAGEM_REPROGRAMADA',
            categoria: 'VIAGENS',
            operacao: 'Administrativo',
            referencia_tipo: 'VIAGEM_FROTA',
            referencia_id: 55,
            ocorrencia_versao: '2026-11-25T10:00Z',
            chave_idempotencia: 'A6:VIAGEM_FROTA:55:2026-11-25T10:00Z',
            canal: 'WEB_PUSH',
            payload_push: {
              titulo: 'Horario alterado - Viagem #55',
              mensagem: 'A viagem foi reprogramada. Toque para conferir o novo horario.',
              url: '/viagens',
              tag: 'viagem-55',
            },
            criado_em: tsCriacao,
            atualizado_em: tsCriacao,
          })
          .returning('*');

        // Retry duplicado com mesma chave_idempotencia para o mesmo usuario -> 23505
        const bloqueouRetryMesmaChave = await esperarErroSql(trx, '23505', () =>
          trx('notificacao_outbox').insert({
            usuario_id: 2,
            evento_tipo: 'A6_VIAGEM_REPROGRAMADA',
            categoria: 'VIAGENS',
            operacao: 'Administrativo',
            referencia_tipo: 'VIAGEM_FROTA',
            referencia_id: 55,
            ocorrencia_versao: 'outra-versao',
            chave_idempotencia: 'A6:VIAGEM_FROTA:55:2026-11-25T10:00Z',
            canal: 'WEB_PUSH',
          })
        );

        // Retry duplicado com mesma (evento_tipo, usuario_id, canal, referencia_tipo, referencia_id, ocorrencia_versao) -> 23505
        const bloqueouRetryMesmaOcorrencia = await esperarErroSql(trx, '23505', () =>
          trx('notificacao_outbox').insert({
            usuario_id: 2,
            evento_tipo: 'A6_VIAGEM_REPROGRAMADA',
            categoria: 'VIAGENS',
            operacao: 'Administrativo',
            referencia_tipo: 'VIAGEM_FROTA',
            referencia_id: 55,
            ocorrencia_versao: '2026-11-25T10:00Z',
            chave_idempotencia: 'A6:VIAGEM_FROTA:55:retry-distinto',
            canal: 'WEB_PUSH',
          })
        );

        // Mesmo evento, mesma referencia e mesma ocorrencia para outro destinatario (usuario 1 - solicitante) eh permitido
        await trx('notificacao_outbox').insert({
          usuario_id: 1,
          evento_tipo: 'A6_VIAGEM_REPROGRAMADA',
          categoria: 'VIAGENS',
          operacao: 'Administrativo',
          referencia_tipo: 'VIAGEM_FROTA',
          referencia_id: 55,
          ocorrencia_versao: '2026-11-25T10:00Z',
          chave_idempotencia: 'A6:VIAGEM_FROTA:55:2026-11-25T10:00Z',
          canal: 'WEB_PUSH',
          criado_em: tsCriacao,
          atualizado_em: tsCriacao,
        });

        // Reprogramacao legitima da mesma viagem #55 para novo horario (nova ocorrencia_versao) para o mesmo motorista eh permitida
        const [outboxV2] = await trx('notificacao_outbox')
          .insert({
            usuario_id: 2,
            evento_tipo: 'A6_VIAGEM_REPROGRAMADA',
            categoria: 'VIAGENS',
            operacao: 'Administrativo',
            referencia_tipo: 'VIAGEM_FROTA',
            referencia_id: 55,
            ocorrencia_versao: '2026-11-25T14:00Z',
            chave_idempotencia: 'A6:VIAGEM_FROTA:55:2026-11-25T14:00Z',
            canal: 'WEB_PUSH',
            max_tentativas: 3,
            criado_em: tsCriacao,
            atualizado_em: tsCriacao,
          })
          .returning('*');

        // Comprova que o expurgo da notificacao In-App (notificacoes) ocorre sem bloqueio de FK na outbox
        await trx('notificacoes').where({ id: notifConfirmada.id }).del();
        const outboxAposExpurgoInApp = await trx('notificacao_outbox')
          .where({ id: outboxV1.id })
          .first('id', 'notificacao_id');
        if (!outboxAposExpurgoInApp || outboxAposExpurgoInApp.notificacao_id !== notifConfirmada.id) {
          throw new Error(
            'Expurgo de notificacoes nao deveria bloquear nem corromper o registro em notificacao_outbox.'
          );
        }

        const bloqueouStatusTerminalSemProcessadoEm = await esperarErroSql(trx, '23514', () =>
          trx('notificacao_outbox')
            .where({ id: outboxV1.id })
            .update({ status: 'ENVIADO', processado_em: null })
        );

        const bloqueouPendenteComProcessadoEm = await esperarErroSql(trx, '23514', () =>
          trx('notificacao_outbox')
            .where({ id: outboxV1.id })
            .update({ status: 'PENDENTE', processado_em: new Date('2026-11-24T12:05:00.000Z') })
        );

        const bloqueouTentativasAcimaDoMaximo = await esperarErroSql(trx, '23514', () =>
          trx('notificacao_outbox').where({ id: outboxV2.id }).update({ tentativas: 4 })
        );

        const bloqueouPayloadArray = await esperarErroSql(trx, '23514', () =>
          trx('notificacao_outbox')
            .where({ id: outboxV1.id })
            .update({ payload_push: JSON.stringify(['invalido']) })
        );

        if (
          !bloqueouRetryMesmaChave ||
          !bloqueouRetryMesmaOcorrencia ||
          !outboxV2?.id ||
          !bloqueouStatusTerminalSemProcessadoEm ||
          !bloqueouPendenteComProcessadoEm ||
          !bloqueouTentativasAcimaDoMaximo ||
          !bloqueouPayloadArray
        ) {
          throw new Error(
            'Falha na deduplicacao de retry, reprogramacao legitima ou constraints de estado da outbox.'
          );
        }

        const tsProcessado = new Date('2026-11-24T12:10:00.000Z');
        await trx('notificacao_outbox').where({ id: outboxV1.id }).update({
          status: 'ENVIADO',
          tentativas: 1,
          ultimo_status_http: 201,
          processado_em: tsProcessado,
          atualizado_em: tsProcessado,
        });

        await trx('notificacao_outbox').where({ id: outboxV2.id }).update({
          status: 'FALHA_DEFINITIVA',
          tentativas: 3,
          ultimo_status_http: 503,
          ultimo_erro: 'MAX_RETRIES_EXCEEDED',
          processado_em: tsProcessado,
          atualizado_em: tsProcessado,
        });

        const { rows: elegiveisOutbox } = await trx.raw(
          `SELECT id, status
           FROM notificacao_outbox
           WHERE status IN ('ENVIADO', 'FALHA_DEFINITIVA', 'IGNORADO')
             AND processado_em <= ?::timestamptz
           ORDER BY id ASC`,
          [tsProcessado.toISOString()]
        );

        if (elegiveisOutbox.length !== 2) {
          throw new Error(
            `Filtro de retencao de estados terminais da outbox deveria retornar 2 registros, retornou ${elegiveisOutbox.length}`
          );
        }

        await trx('notificacao_outbox').del();
        await trx('notificacoes').del();
      });

      relatorio.push(
        '4. Viagens e coletas distintas com mesma versao sem colisao, deduplicacao de retry, reprogramacao legitima (NF-08) e retencao desacoplada: OK'
      );

      // 3.3 Concorrencia real: duas transacoes simultaneas tentando inserir o mesmo evento/referencia/ocorrencia para o mesmo destinatario + claim concorrente FOR UPDATE SKIP LOCKED
      let prontasInsert = 0;
      let liberarBarreiraInsert;
      const barreiraInsert = new Promise((resolve) => {
        liberarBarreiraInsert = resolve;
      });

      const tentativaOutboxConcorrente = async (indice) => {
        return db.transaction(async (trx) => {
          await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);
          prontasInsert += 1;
          if (prontasInsert === 2) {
            liberarBarreiraInsert();
          } else {
            await barreiraInsert;
          }

          await trx('notificacao_outbox').insert({
            usuario_id: 1,
            evento_tipo: 'S3_COLETA_ALOCADA',
            categoria: 'SVO',
            operacao: 'SVO',
            referencia_tipo: 'ORDEM_SVO',
            referencia_id: 90,
            ocorrencia_versao: 'alocada:v1',
            chave_idempotencia: `S3:ORDEM_SVO:90:v1:t${indice}`,
            canal: 'WEB_PUSH',
          });
          return 'INSERIDA';
        });
      };

      const resultadosInsertConc = await Promise.allSettled([
        tentativaOutboxConcorrente(1),
        tentativaOutboxConcorrente(2),
      ]);

      const sucessosInsert = resultadosInsertConc.filter((r) => r.status === 'fulfilled');
      const falhasInsert = resultadosInsertConc.filter(
        (r) => r.status === 'rejected' && r.reason && r.reason.code === '23505'
      );
      const totalPersistidoOutbox = await db
        .withSchema(schemaCiclo)
        .from('notificacao_outbox')
        .where({
          usuario_id: 1,
          evento_tipo: 'S3_COLETA_ALOCADA',
          referencia_tipo: 'ORDEM_SVO',
          referencia_id: 90,
          ocorrencia_versao: 'alocada:v1',
        })
        .count({ total: '*' })
        .first();

      if (
        sucessosInsert.length !== 1 ||
        falhasInsert.length !== 1 ||
        Number(totalPersistidoOutbox?.total || 0) !== 1
      ) {
        throw new Error(
          `Falha na deduplicacao concorrente da outbox: sucessos=${sucessosInsert.length}, falhas23505=${falhasInsert.length}`
        );
      }

      // Disputa concorrente de claim (FOR UPDATE SKIP LOCKED) sobre o item PENDENTE recem-inserido
      let prontasClaim = 0;
      let liberarBarreiraClaim;
      const barreiraClaim = new Promise((resolve) => {
        liberarBarreiraClaim = resolve;
      });

      const workerClaimConcorrente = async () => {
        return db.transaction(async (trx) => {
          await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);
          prontasClaim += 1;
          if (prontasClaim === 2) {
            liberarBarreiraClaim();
          } else {
            await barreiraClaim;
          }

          const { rows } = await trx.raw(
            `UPDATE notificacao_outbox
                SET status = 'PROCESSANDO',
                    bloqueado_ate = CURRENT_TIMESTAMP + INTERVAL '2 minutes',
                    atualizado_em = CURRENT_TIMESTAMP
              WHERE id IN (
                SELECT id
                  FROM notificacao_outbox
                 WHERE status = 'PENDENTE'
                   AND proxima_execucao_em <= CURRENT_TIMESTAMP
                 ORDER BY proxima_execucao_em ASC, id ASC
                 LIMIT 1
                 FOR UPDATE SKIP LOCKED
              )
              RETURNING id`
          );
          return rows.length;
        });
      };

      const claims = await Promise.all([workerClaimConcorrente(), workerClaimConcorrente()]);
      const totalClaimed = claims[0] + claims[1];
      if (totalClaimed !== 1) {
        throw new Error(
          `Claim concorrente (FOR UPDATE SKIP LOCKED) deveria alocar o item para exatamente 1 worker, alocou ${totalClaimed}`
        );
      }

      relatorio.push(
        '5. Concorrencia real entre duas transacoes simultaneas (deduplicacao 23505 e claim FOR UPDATE SKIP LOCKED por unico worker): OK'
      );

      // 3.4 Teste real dos privilegios da role da aplicacao dentro do schema isolado
      const appUser = process.env.POSTGRES_APP_USER;
      if (appUser) {
        const roleApp = await db('pg_roles').where({ rolname: appUser }).first('rolname');
        if (roleApp) {
          await db.raw('GRANT USAGE ON SCHEMA ?? TO ??', [schemaCiclo, appUser]);
          await db.raw('GRANT SELECT ON TABLE ??.usuarios TO ??', [schemaCiclo, appUser]);

          const { rows: privSchemaIsolado } = await db.raw(
            `SELECT
               has_table_privilege(?, ? || '.notificacao_outbox', 'SELECT') AS pode_select,
               has_table_privilege(?, ? || '.notificacao_outbox', 'INSERT') AS pode_insert,
               has_table_privilege(?, ? || '.notificacao_outbox', 'UPDATE') AS pode_update,
               has_table_privilege(?, ? || '.notificacao_outbox', 'DELETE') AS pode_delete,
               has_sequence_privilege(?, ? || '.notificacao_outbox_id_seq', 'USAGE, SELECT') AS pode_seq`,
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
            ]
          );

          const p = privSchemaIsolado[0];
          if (
            !p?.pode_select ||
            !p?.pode_insert ||
            !p?.pode_update ||
            p?.pode_delete ||
            !p?.pode_seq
          ) {
            throw new Error(
              `Permissoes incorretas para ${appUser} em ${schemaCiclo}.notificacao_outbox: ${JSON.stringify(p)}`
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
              const [inseridaPelaApp] = await dbApp
                .withSchema(schemaCiclo)
                .into('notificacao_outbox')
                .insert({
                  usuario_id: 1,
                  evento_tipo: 'A2_SOLICITACAO_APROVADA',
                  categoria: 'SOLICITACOES',
                  operacao: 'Administrativo',
                  referencia_tipo: 'SOLICITACAO_VIAGEM',
                  referencia_id: 777,
                  ocorrencia_versao: 'v1',
                  chave_idempotencia: 'teste-role-app-outbox-1',
                  canal: 'WEB_PUSH',
                })
                .returning('id');

              const consultadaPelaApp = await dbApp
                .withSchema(schemaCiclo)
                .from('notificacao_outbox')
                .where({ id: inseridaPelaApp.id })
                .first('id');

              await dbApp
                .withSchema(schemaCiclo)
                .from('notificacao_outbox')
                .where({ id: inseridaPelaApp.id })
                .update({
                  status: 'ENVIADO',
                  tentativas: 1,
                  processado_em: dbApp.fn.now(),
                  atualizado_em: dbApp.fn.now(),
                });

              let deleteBloqueado = false;
              try {
                await dbApp
                  .withSchema(schemaCiclo)
                  .from('notificacao_outbox')
                  .where({ id: inseridaPelaApp.id })
                  .del();
              } catch (erroDelete) {
                deleteBloqueado = erroDelete && erroDelete.code === '42501';
              }

              if (!consultadaPelaApp || !deleteBloqueado) {
                throw new Error(
                  `Execucao real com a role ${appUser} em notificacao_outbox falhou: SELECT=${Boolean(consultadaPelaApp)}, DELETE_BLOQUEADO_42501=${deleteBloqueado}`
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
            `6. Teste real da role "${appUser}" no schema isolado (SELECT, INSERT e UPDATE autorizados; DELETE bloqueado com 42501): OK`
          );
        }
      }

      // 3.5 Testa protecao de rollback (down bloqueado com dados) e ciclo down/up limpo
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);

        let bloqueouDownComDados = false;
        try {
          await migrationNotificacaoOutbox.down(trx);
        } catch (e) {
          bloqueouDownComDados =
            /Rollback bloqueado: existem registros em notificacao_outbox/i.test(e.message);
        }
        if (!bloqueouDownComDados) {
          throw new Error(
            'Migration down deveria ter bloqueado rollback com registros em notificacao_outbox.'
          );
        }

        await trx('notificacao_outbox').del();
        await migrationNotificacaoOutbox.down(trx);
        await migrationNotificacaoOutbox.up(trx);

        relatorio.push(
          '7. Protecao contra rollback destrutivo e ciclo completo down -> up idempotente: OK'
        );
      });
    } finally {
      await db.raw('DROP SCHEMA ?? CASCADE', [schemaCiclo]);
    }

    console.log('=== VALIDACAO MIGRATION notificacao outbox CONCLUIDA COM SUCESSO ===');
    for (const item of relatorio) {
      console.log(` - ${item}`);
    }
  } finally {
    await db.destroy();
  }
}

module.exports = {
  executarValidacaoNotificacaoOutbox,
};

if (require.main === module) {
  executarValidacaoNotificacaoOutbox().catch((erro) => {
    console.error('Falha na validacao da migration notificacao outbox:', erro.message);
    process.exit(1);
  });
}
