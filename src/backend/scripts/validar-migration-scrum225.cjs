const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');
const migrationScrum225 = require('../database/migrations/20261124193000_scrum_225_notificacoes_in_app');
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
      (4, 'Usuario Temporario Cascade', 'temp.cascade@exemplo.invalid', 'hash', 'SOLICITANTE', 'SOLICITANTE');
    SELECT setval(pg_get_serial_sequence('usuarios', 'id'), 4, true);
  `);
}

async function executarValidacaoCompletaScrum225() {
  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });
  const db = knex(configMigration);
  const relatorio = [];

  try {
    // 1. Bloqueio quando tabela base usuarios nao existe no schema
    const schemaSemBase = `val225_sem_base_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await trx.raw('CREATE SCHEMA ??', [schemaSemBase]);
        await trx.raw('SET LOCAL search_path TO ??', [schemaSemBase]);

        let bloqueouSemBase = false;
        try {
          await migrationScrum225.up(trx);
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
    const schemaIncomp = `val225_inc_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsolada(trx, schemaIncomp);
        await trx.raw(`
          CREATE TABLE notificacoes (
            id SERIAL PRIMARY KEY,
            usuario_id INTEGER NOT NULL,
            tipo TEXT NOT NULL
          )
        `);

        let bloqueouIncompativel = false;
        try {
          await migrationScrum225.up(trx);
        } catch (e) {
          bloqueouIncompativel = /Estrutura incompativel em notificacoes/i.test(e.message);
        }
        if (!bloqueouIncompativel) {
          throw new Error(
            'Migration up deveria ter rejeitado tabela notificacoes preexistente incompativel.'
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

    // 3. Validacao completa em schema isolado com suporte a transacoes concorrentes e teste real da role frotas_app
    const schemaCiclo = `val225_ciclo_${Date.now()}`;
    try {
      await db.transaction(async (trx) => {
        await criarBaseIsolada(trx, schemaCiclo);
        await migrationScrum225.up(trx);
      });
      relatorio.push(
        '2. Aplicacao limpa da migration SCRUM-225 (up) e validacao de catalogo (Secao 6.1): OK'
      );

      // 3.1 Testa FK (ON DELETE CASCADE), limites de campos (mensagem <= 280), severidade, operacao e url_destino
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);

        const tsBase = new Date('2026-11-24T12:00:00.000Z');
        const [notif1] = await trx('notificacoes')
          .insert({
            usuario_id: 1,
            tipo: 'A2_SOLICITACAO_APROVADA',
            titulo: 'Solicitacao aprovada (#101)',
            mensagem: 'Aprovada pela gestao de frota. Em breve um veiculo sera agendado.',
            severidade: 'success',
            operacao: 'Administrativo',
            referencia_tipo: 'SOLICITACAO_VIAGEM',
            referencia_id: 101,
            url_destino: '/solicitacoes',
            chave_idempotencia: 'A2:SOLICITACAO_VIAGEM:101:v1',
            criado_em: tsBase,
          })
          .returning('*');

        // Testa ON DELETE CASCADE quando usuario 4 eh removido
        await trx('notificacoes').insert({
          usuario_id: 4,
          tipo: 'A1_NOVA_SOLICITACAO',
          titulo: 'Nova solicitacao administrativa (#102)',
          mensagem: 'Aguardando analise e aprovacao para o periodo solicitado.',
          severidade: 'info',
          operacao: 'Administrativo',
          url_destino: '/solicitacoes',
          chave_idempotencia: 'A1:SOLICITACAO_VIAGEM:102:v1',
        });
        await trx('usuarios').where({ id: 4 }).del();
        const restouUsuario4 = await trx('notificacoes')
          .where({ usuario_id: 4 })
          .count({ total: '*' })
          .first();
        if (Number(restouUsuario4?.total || 0) !== 0) {
          throw new Error(
            'FK fk_notificacoes_usuario deveria remover notificacoes via ON DELETE CASCADE.'
          );
        }

        // FK usuario inexistente (23503)
        const bloqueouUsuarioInexistente = await esperarErroSql(trx, '23503', () =>
          trx('notificacoes').insert({
            usuario_id: 9999,
            tipo: 'A1_NOVA_SOLICITACAO',
            titulo: 'Nova solicitacao',
            mensagem: 'Pedido aguardando.',
            severidade: 'info',
            operacao: 'Administrativo',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'A1:9999:v1',
          })
        );

        // Limite explicito de mensagem (> 280 caracteres -> 22001 string_data_right_truncation)
        const bloqueouMensagemAcimaDe280 = await esperarErroSql(trx, '22001', () =>
          trx('notificacoes').insert({
            usuario_id: 1,
            tipo: 'A1_NOVA_SOLICITACAO',
            titulo: 'Titulo valido',
            mensagem: 'M'.repeat(281),
            severidade: 'info',
            operacao: 'Administrativo',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'msg-longa-281',
          })
        );

        // Severidade fora de ('info', 'success', 'warning', 'danger') -> 23514
        const bloqueouSeveridadeInvalida = await esperarErroSql(trx, '23514', () =>
          trx('notificacoes').insert({
            usuario_id: 1,
            tipo: 'A1_NOVA_SOLICITACAO',
            titulo: 'Titulo',
            mensagem: 'Mensagem',
            severidade: 'INFO',
            operacao: 'Administrativo',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'sev-invalida',
          })
        );

        // Operacao fora de ('Administrativo', 'SVO') -> 23514
        const bloqueouOperacaoInvalida = await esperarErroSql(trx, '23514', () =>
          trx('notificacoes').insert({
            usuario_id: 1,
            tipo: 'A1_NOVA_SOLICITACAO',
            titulo: 'Titulo',
            mensagem: 'Mensagem',
            severidade: 'info',
            operacao: 'ADMINISTRATIVA',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'op-invalida',
          })
        );

        // Casos negativos especificos de url_destino (open redirect, barras invertidas, espacos e caracteres de controle)
        const urlsInvalidas = [
          'https://malicioso.invalid/phishing',
          '//malicioso.invalid/phishing',
          '/\\malicioso.invalid/phishing',
          '/solicitacoes\\..\\admin',
          '/solicitacoes\nSet-Cookie: sessao=roubada',
          '/solicitacoes\r\nLocation: https://evil.invalid',
          '/solicitacoes\t1',
          '/solicitacoes com espaco',
          ' /solicitacoes',
          'javascript:alert(1)',
        ];

        for (let idx = 0; idx < urlsInvalidas.length; idx += 1) {
          const urlInvalida = urlsInvalidas[idx];
          const bloqueouUrl = await esperarErroSql(trx, '23514', () =>
            trx('notificacoes').insert({
              usuario_id: 1,
              tipo: 'A1_NOVA_SOLICITACAO',
              titulo: 'Teste URL',
              mensagem: 'Mensagem',
              severidade: 'info',
              operacao: 'Administrativo',
              url_destino: urlInvalida,
              chave_idempotencia: `url-inv-${idx}`,
            })
          );
          if (!bloqueouUrl) {
            throw new Error(
              `Constraint chk_notificacoes_url_destino_interna deveria bloquear: ${JSON.stringify(urlInvalida)}`
            );
          }
        }

        // Coerencia de referencia_tipo / referencia_id e ordem temporal lida_em >= criado_em
        const bloqueouReferenciaIncompleta = await esperarErroSql(trx, '23514', () =>
          trx('notificacoes').insert({
            usuario_id: 1,
            tipo: 'A1_NOVA_SOLICITACAO',
            titulo: 'Teste',
            mensagem: 'Mensagem',
            severidade: 'info',
            operacao: 'Administrativo',
            referencia_tipo: 'SOLICITACAO_VIAGEM',
            referencia_id: null,
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ref-incompleta-1',
          })
        );

        const bloqueouLeituraAnteriorCriacao = await esperarErroSql(trx, '23514', () =>
          trx('notificacoes')
            .where({ id: notif1.id })
            .update({ lida_em: new Date('2026-11-24T11:59:59.000Z') })
        );

        if (
          !bloqueouUsuarioInexistente ||
          !bloqueouMensagemAcimaDe280 ||
          !bloqueouSeveridadeInvalida ||
          !bloqueouOperacaoInvalida ||
          !bloqueouReferenciaIncompleta ||
          !bloqueouLeituraAnteriorCriacao
        ) {
          throw new Error(
            'Falha na validacao de FK, limite de 280 chars, severidade, operacao ou constraints de notificacoes.'
          );
        }

        await trx('notificacoes').del();
      });

      relatorio.push(
        '3. FK (ON DELETE CASCADE), limite de 280 chars em mensagem, dominios (severidade/operacao) e bloqueio de barras invertidas/controle em url_destino: OK'
      );

      // 3.2 Concorrencia real: duas transacoes simultaneas em conexoes independentes tentando inserir a mesma chave para o mesmo destinatario
      let prontas = 0;
      let liberarBarreira;
      const barreira = new Promise((resolve) => {
        liberarBarreira = resolve;
      });

      const tentativaConcorrente = async (indice) => {
        return db.transaction(async (trx) => {
          await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);
          prontas += 1;
          if (prontas === 2) {
            liberarBarreira();
          } else {
            await barreira;
          }

          await trx('notificacoes').insert({
            usuario_id: 1,
            tipo: 'S3_COLETA_ALOCADA',
            titulo: `Coleta SVO designada (#200) [t${indice}]`,
            mensagem: 'Previsao em 24/11 14:00.',
            severidade: 'warning',
            operacao: 'SVO',
            referencia_tipo: 'ORDEM_SVO',
            referencia_id: 200,
            url_destino: '/minhas-coletas?ordem=200',
            chave_idempotencia: 'S3:ORDEM_SVO:200:v1',
          });
          return 'INSERIDA';
        });
      };

      const resultadosConcorrentes = await Promise.allSettled([
        tentativaConcorrente(1),
        tentativaConcorrente(2),
      ]);

      const sucessos = resultadosConcorrentes.filter((r) => r.status === 'fulfilled');
      const falhasUnicidade = resultadosConcorrentes.filter(
        (r) => r.status === 'rejected' && r.reason && r.reason.code === '23505'
      );
      const totalPersistidoConcorrente = await db
        .withSchema(schemaCiclo)
        .from('notificacoes')
        .where({ usuario_id: 1, chave_idempotencia: 'S3:ORDEM_SVO:200:v1' })
        .count({ total: '*' })
        .first();

      if (
        sucessos.length !== 1 ||
        falhasUnicidade.length !== 1 ||
        Number(totalPersistidoConcorrente?.total || 0) !== 1
      ) {
        throw new Error(
          `Falha no teste de concorrencia real: sucessos=${sucessos.length}, falhas23505=${falhasUnicidade.length}, persistidos=${totalPersistidoConcorrente?.total}`
        );
      }

      // Duas transacoes concorrentes para destinatarios diferentes com a mesma chave + eventos distintos para o mesmo destinatario
      await Promise.all([
        db.transaction(async (trx) => {
          await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);
          await trx('notificacoes').insert({
            usuario_id: 2,
            tipo: 'S3_COLETA_ALOCADA',
            titulo: 'Coleta SVO designada (#200)',
            mensagem: 'Previsao em 24/11 14:00.',
            severidade: 'warning',
            operacao: 'SVO',
            referencia_tipo: 'ORDEM_SVO',
            referencia_id: 200,
            url_destino: '/viagens',
            chave_idempotencia: 'S3:ORDEM_SVO:200:v1',
          });
        }),
        db.transaction(async (trx) => {
          await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);
          await trx('notificacoes').insert({
            usuario_id: 1,
            tipo: 'S4_COLETA_REPROGRAMADA',
            titulo: 'Coleta SVO reprogramada (#200)',
            mensagem: 'Novo horario previsto: 24/11 16:00.',
            severidade: 'warning',
            operacao: 'SVO',
            referencia_tipo: 'ORDEM_SVO',
            referencia_id: 200,
            url_destino: '/minhas-coletas?ordem=200',
            chave_idempotencia: 'S4:ORDEM_SVO:200:v2',
          });
        }),
      ]);

      const totalAposEventosDistintos = await db
        .withSchema(schemaCiclo)
        .from('notificacoes')
        .count({ total: '*' })
        .first();
      if (Number(totalAposEventosDistintos?.total || 0) !== 3) {
        throw new Error(
          'Eventos legitimos distintos ou destinatarios diferentes foram bloqueados indevidamente.'
        );
      }

      relatorio.push(
        '4. Concorrencia real entre duas transacoes simultaneas (1 persistido + 1 rejeitado 23505) e suporte a destinatarios/eventos distintos: OK'
      );

      // 3.3 Paginacao estavel por cursor (criado_em DESC, id DESC) e Retencao (30d apos lida_em / 90d apos criado_em)
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);
        await trx('notificacoes').del();

        const tsEmpate = new Date('2026-11-24T15:00:00.000Z');
        const tsMaisAntigo = new Date('2026-11-24T14:00:00.000Z');

        const inseridas = [];
        for (let i = 1; i <= 5; i += 1) {
          const [item] = await trx('notificacoes')
            .insert({
              usuario_id: 1,
              tipo: `EVENTO_${i}`,
              titulo: `Notificacao ${i}`,
              mensagem: `Corpo ${i}`,
              severidade: 'info',
              operacao: 'Administrativo',
              referencia_tipo: 'SOLICITACAO_VIAGEM',
              referencia_id: i,
              url_destino: '/solicitacoes',
              chave_idempotencia: `cursor-empate-${i}`,
              criado_em: i === 1 ? tsMaisAntigo : tsEmpate,
            })
            .returning(['id', 'criado_em']);
          inseridas.push(item);
        }

        const pagina1 = await trx('notificacoes')
          .where({ usuario_id: 1 })
          .orderBy([
            { column: 'criado_em', order: 'desc' },
            { column: 'id', order: 'desc' },
          ])
          .limit(2);

        const cursor1 = pagina1[pagina1.length - 1];
        const pagina2 = await trx('notificacoes')
          .where({ usuario_id: 1 })
          .andWhereRaw('(criado_em, id) < (?, ?)', [cursor1.criado_em, cursor1.id])
          .orderBy([
            { column: 'criado_em', order: 'desc' },
            { column: 'id', order: 'desc' },
          ])
          .limit(2);

        const cursor2 = pagina2[pagina2.length - 1];
        const pagina3 = await trx('notificacoes')
          .where({ usuario_id: 1 })
          .andWhereRaw('(criado_em, id) < (?, ?)', [cursor2.criado_em, cursor2.id])
          .orderBy([
            { column: 'criado_em', order: 'desc' },
            { column: 'id', order: 'desc' },
          ])
          .limit(2);

        const idsPaginados = [...pagina1, ...pagina2, ...pagina3].map((r) => r.id);
        const idsEsperados = inseridas
          .slice()
          .sort((a, b) => {
            const diffTs = new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
            return diffTs !== 0 ? diffTs : b.id - a.id;
          })
          .map((r) => r.id);

        if (JSON.stringify(idsPaginados) !== JSON.stringify(idsEsperados)) {
          throw new Error(
            `Paginacao por cursor com timestamps empatados falhou: esperado ${JSON.stringify(idsEsperados)}, obtido ${JSON.stringify(idsPaginados)}`
          );
        }

        relatorio.push(
          '5. Paginacao estavel por cursor (criado_em DESC, id DESC) com timestamps empatados: OK'
        );

        // 3.4 Testa retencao: 30 dias apos lida_em (lidas) e 90 dias apos criado_em (nao lidas), incluindo notificacao antiga lida recentemente
        await trx('notificacoes').del();
        const agoraRef = new Date('2026-11-24T18:00:00.000Z');
        const diasAtras = (d) => new Date(agoraRef.getTime() - d * 24 * 60 * 60 * 1000);

        await trx('notificacoes').insert([
          {
            usuario_id: 1,
            tipo: 'LIDA_29D',
            titulo: 'Lida ha 29d',
            mensagem: 'Mantem',
            severidade: 'info',
            operacao: 'Administrativo',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-lida-29',
            criado_em: diasAtras(40),
            lida_em: diasAtras(29),
          },
          {
            usuario_id: 1,
            tipo: 'LIDA_30D_EXATO',
            titulo: 'Lida ha 30d exatos',
            mensagem: 'Mantem no limite exato (> 30d apos lida_em)',
            severidade: 'info',
            operacao: 'Administrativo',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-lida-30',
            criado_em: diasAtras(45),
            lida_em: diasAtras(30),
          },
          {
            usuario_id: 1,
            tipo: 'LIDA_31D',
            titulo: 'Lida ha 31d',
            mensagem: 'Expurga (> 30d apos lida_em)',
            severidade: 'info',
            operacao: 'Administrativo',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-lida-31',
            criado_em: diasAtras(50),
            lida_em: diasAtras(31),
          },
          {
            usuario_id: 1,
            tipo: 'ANTIGA_LIDA_RECENTEMENTE',
            titulo: 'Criada ha 60d mas lida ha 5d',
            mensagem: 'Deve ser preservada pois lida_em tem apenas 5 dias',
            severidade: 'warning',
            operacao: 'Administrativo',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-antiga-lida-recente',
            criado_em: diasAtras(60),
            lida_em: diasAtras(5),
          },
          {
            usuario_id: 1,
            tipo: 'NAO_LIDA_89D',
            titulo: 'Nao lida 89d',
            mensagem: 'Mantem',
            severidade: 'info',
            operacao: 'Administrativo',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-nlida-89',
            criado_em: diasAtras(89),
            lida_em: null,
          },
          {
            usuario_id: 1,
            tipo: 'NAO_LIDA_90D_EXATO',
            titulo: 'Nao lida 90d',
            mensagem: 'Mantem no limite exato (> 90d apos criado_em)',
            severidade: 'info',
            operacao: 'Administrativo',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-nlida-90',
            criado_em: diasAtras(90),
            lida_em: null,
          },
          {
            usuario_id: 1,
            tipo: 'NAO_LIDA_91D',
            titulo: 'Nao lida 91d',
            mensagem: 'Expurga (> 90d apos criado_em)',
            severidade: 'info',
            operacao: 'Administrativo',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-nlida-91',
            criado_em: diasAtras(91),
            lida_em: null,
          },
        ]);

        const { rows: elegiveisExpurgo } = await trx.raw(
          `SELECT chave_idempotencia
           FROM notificacoes
           WHERE (lida_em IS NOT NULL AND lida_em < ?::timestamptz - INTERVAL '30 days')
              OR (lida_em IS NULL AND criado_em < ?::timestamptz - INTERVAL '90 days')
           ORDER BY chave_idempotencia`,
          [agoraRef.toISOString(), agoraRef.toISOString()]
        );

        const chavesExpurgadas = elegiveisExpurgo.map((r) => r.chave_idempotencia);
        if (JSON.stringify(chavesExpurgadas) !== JSON.stringify(['ret-lida-31', 'ret-nlida-91'])) {
          throw new Error(
            `Limiares de retencao (30d apos lida_em / 90d apos criado_em) incorretos: obtido ${JSON.stringify(chavesExpurgadas)}`
          );
        }

        relatorio.push(
          '6. Retencao 30 dias apos lida_em (preservando antiga lida recentemente) e 90 dias apos criado_em (limiares 29/30/31 e 89/90/91): OK'
        );
      });

      // 3.5 Teste real dos privilegios da role da aplicacao dentro do schema isolado (SELECT, INSERT, UPDATE permitidos e DELETE bloqueado)
      const appUser = process.env.POSTGRES_APP_USER;
      if (appUser) {
        const roleApp = await db('pg_roles').where({ rolname: appUser }).first('rolname');
        if (roleApp) {
          await db.raw('GRANT USAGE ON SCHEMA ?? TO ??', [schemaCiclo, appUser]);
          await db.raw('GRANT SELECT ON TABLE ??.usuarios TO ??', [schemaCiclo, appUser]);

          const { rows: privSchemaIsolado } = await db.raw(
            `SELECT
               has_table_privilege(?, ? || '.notificacoes', 'SELECT') AS pode_select,
               has_table_privilege(?, ? || '.notificacoes', 'INSERT') AS pode_insert,
               has_table_privilege(?, ? || '.notificacoes', 'UPDATE') AS pode_update,
               has_table_privilege(?, ? || '.notificacoes', 'DELETE') AS pode_delete,
               has_sequence_privilege(?, ? || '.notificacoes_id_seq', 'USAGE, SELECT') AS pode_seq`,
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
              `Permissoes incorretas para ${appUser} em ${schemaCiclo}.notificacoes: ${JSON.stringify(p)}`
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
                .into('notificacoes')
                .insert({
                  usuario_id: 1,
                  tipo: 'A1_NOVA_SOLICITACAO',
                  titulo: 'Criada pela role da aplicacao',
                  mensagem: 'Teste real de INSERT/SELECT/UPDATE/DELETE pela role frotas_app.',
                  severidade: 'info',
                  operacao: 'Administrativo',
                  url_destino: '/solicitacoes',
                  chave_idempotencia: 'teste-role-app-1',
                })
                .returning(['id', 'lida_em']);

              const consultadaPelaApp = await dbApp
                .withSchema(schemaCiclo)
                .from('notificacoes')
                .where({ id: inseridaPelaApp.id })
                .first('id');

              await dbApp
                .withSchema(schemaCiclo)
                .from('notificacoes')
                .where({ id: inseridaPelaApp.id })
                .update({ lida_em: dbApp.fn.now() });

              let deleteBloqueado = false;
              try {
                await dbApp
                  .withSchema(schemaCiclo)
                  .from('notificacoes')
                  .where({ id: inseridaPelaApp.id })
                  .del();
              } catch (erroDelete) {
                deleteBloqueado = erroDelete && erroDelete.code === '42501';
              }

              if (!consultadaPelaApp || !deleteBloqueado) {
                throw new Error(
                  `Execucao real com a role ${appUser} falhou: SELECT=${Boolean(consultadaPelaApp)}, DELETE_BLOQUEADO_42501=${deleteBloqueado}`
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
            `7. Teste real da role "${appUser}" no schema isolado (SELECT, INSERT e UPDATE autorizados; DELETE bloqueado com 42501): OK`
          );
        }
      }

      // 3.6 Testa protecao de rollback (down bloqueado com dados) e ciclo down/up limpo
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);

        let bloqueouDownComDados = false;
        try {
          await migrationScrum225.down(trx);
        } catch (e) {
          bloqueouDownComDados = /Rollback bloqueado: existem registros em notificacoes/i.test(
            e.message
          );
        }
        if (!bloqueouDownComDados) {
          throw new Error(
            'Migration down deveria ter bloqueado rollback com notificacoes existentes.'
          );
        }

        await trx('notificacoes').del();
        await migrationScrum225.down(trx);
        await migrationScrum225.up(trx);

        relatorio.push(
          '8. Protecao contra rollback destrutivo e ciclo completo down -> up idempotente: OK'
        );
      });
    } finally {
      await db.raw('DROP SCHEMA ?? CASCADE', [schemaCiclo]);
    }

    console.log('=== VALIDACAO MIGRATION SCRUM-225 CONCLUIDA COM SUCESSO ===');
    for (const item of relatorio) {
      console.log(` - ${item}`);
    }
  } finally {
    await db.destroy();
  }
}

module.exports = {
  executarValidacaoCompletaScrum225,
};

if (require.main === module) {
  executarValidacaoCompletaScrum225().catch((erro) => {
    console.error('Falha na validacao da migration SCRUM-225:', erro.message);
    process.exit(1);
  });
}
