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
      (3, 'Integrante SVO C', 'integrante.c@exemplo.invalid', 'hash', 'INTEGRANTE_SVO', 'INTEGRANTE_SVO');
    SELECT setval(pg_get_serial_sequence('usuarios', 'id'), 3, true);
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

    // 3. Ciclo completo em schema isolado: UP -> FK -> Idempotencia -> Constraints -> Paginacao por cursor com empate -> Retencao 30/90d -> Rollback protegido -> Down limpo -> Re-UP
    const schemaCiclo = `val225_ciclo_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsolada(trx, schemaCiclo);
        await migrationScrum225.up(trx);
        relatorio.push(
          '2. Aplicacao limpa da migration SCRUM-225 (up) e validacao de catalogo: OK'
        );

        // 3.1 Testa FK, idempotencia e constraints de dominio/seguranca
        const tsBase = new Date('2026-11-24T12:00:00.000Z');
        const [notif1] = await trx('notificacoes')
          .insert({
            usuario_id: 1,
            tipo: 'A2_SOLICITACAO_APROVADA',
            categoria: 'SOLICITACOES',
            titulo: 'Solicitacao aprovada',
            mensagem: 'Sua solicitacao #101 foi aprovada pela gestao.',
            severidade: 'SUCESSO',
            operacao: 'ADMINISTRATIVA',
            referencia_tipo: 'SOLICITACAO_VIAGEM',
            referencia_id: 101,
            url_destino: '/solicitacoes',
            chave_idempotencia: 'A2:SOLICITACAO_VIAGEM:101:v1',
            criado_em: tsBase,
          })
          .returning('*');

        // Mesma chave de evento para OUTRO destinatario (usuario 2) deve ser permitida
        await trx('notificacoes').insert({
          usuario_id: 2,
          tipo: 'A5_VIAGEM_AGENDADA',
          categoria: 'VIAGENS',
          titulo: 'Viagem agendada',
          mensagem: 'Voce foi alocado para a viagem #101.',
          severidade: 'INFO',
          operacao: 'ADMINISTRATIVA',
          referencia_tipo: 'VIAGEM_FROTA',
          referencia_id: 101,
          url_destino: '/viagens',
          chave_idempotencia: 'A2:SOLICITACAO_VIAGEM:101:v1',
          criado_em: tsBase,
        });

        // Mesma chave para o MESMO destinatario (usuario 1) deve ser bloqueada (23505)
        const bloqueouDuplicataMesmoUsuario = await esperarErroSql(trx, '23505', () =>
          trx('notificacoes').insert({
            usuario_id: 1,
            tipo: 'A2_SOLICITACAO_APROVADA',
            categoria: 'SOLICITACOES',
            titulo: 'Solicitacao aprovada duplicada',
            mensagem: 'Tentativa duplicada.',
            severidade: 'SUCESSO',
            operacao: 'ADMINISTRATIVA',
            referencia_tipo: 'SOLICITACAO_VIAGEM',
            referencia_id: 101,
            url_destino: '/solicitacoes',
            chave_idempotencia: 'A2:SOLICITACAO_VIAGEM:101:v1',
            criado_em: tsBase,
          })
        );

        // FK usuario inexistente (23503) e ON DELETE RESTRICT em usuario com notificacao (23503)
        const bloqueouUsuarioInexistente = await esperarErroSql(trx, '23503', () =>
          trx('notificacoes').insert({
            usuario_id: 9999,
            tipo: 'A1_NOVA_SOLICITACAO',
            categoria: 'SOLICITACOES',
            titulo: 'Nova solicitacao',
            mensagem: 'Pedido aguardando.',
            severidade: 'INFO',
            operacao: 'ADMINISTRATIVA',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'A1:9999:v1',
          })
        );

        const bloqueouDeleteUsuarioComNotificacao = await esperarErroSql(trx, '23503', () =>
          trx('usuarios').where({ id: 1 }).del()
        );

        // Protecao contra Open Redirect em url_destino (23514)
        const bloqueouUrlExternaHttp = await esperarErroSql(trx, '23514', () =>
          trx('notificacoes').insert({
            usuario_id: 1,
            tipo: 'A1_NOVA_SOLICITACAO',
            categoria: 'SOLICITACOES',
            titulo: 'Teste',
            mensagem: 'Mensagem',
            severidade: 'INFO',
            operacao: 'ADMINISTRATIVA',
            url_destino: 'https://malicioso.invalid/phishing',
            chave_idempotencia: 'url-ext-1',
          })
        );

        const bloqueouUrlProtocolRelative = await esperarErroSql(trx, '23514', () =>
          trx('notificacoes').insert({
            usuario_id: 1,
            tipo: 'A1_NOVA_SOLICITACAO',
            categoria: 'SOLICITACOES',
            titulo: 'Teste',
            mensagem: 'Mensagem',
            severidade: 'INFO',
            operacao: 'ADMINISTRATIVA',
            url_destino: '//malicioso.invalid/phishing',
            chave_idempotencia: 'url-ext-2',
          })
        );

        // Coerencia de referencia_tipo / referencia_id e ordem temporal lida_em >= criado_em
        const bloqueouReferenciaIncompleta = await esperarErroSql(trx, '23514', () =>
          trx('notificacoes').insert({
            usuario_id: 1,
            tipo: 'A1_NOVA_SOLICITACAO',
            categoria: 'SOLICITACOES',
            titulo: 'Teste',
            mensagem: 'Mensagem',
            severidade: 'INFO',
            operacao: 'ADMINISTRATIVA',
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
          !bloqueouDuplicataMesmoUsuario ||
          !bloqueouUsuarioInexistente ||
          !bloqueouDeleteUsuarioComNotificacao ||
          !bloqueouUrlExternaHttp ||
          !bloqueouUrlProtocolRelative ||
          !bloqueouReferenciaIncompleta ||
          !bloqueouLeituraAnteriorCriacao
        ) {
          throw new Error(
            'Falha na validacao de FK, idempotencia, open-redirect ou constraints de notificacoes.'
          );
        }

        relatorio.push(
          '3. Integridade de FK, unicidade idempotente por destinatario e bloqueio de open-redirect: OK'
        );

        // 3.2 Testa paginacao estavel por cursor (criado_em DESC, id DESC) com timestamps empatados
        await trx('notificacoes').del();
        const tsEmpate = new Date('2026-11-24T15:00:00.000Z');
        const tsMaisAntigo = new Date('2026-11-24T14:00:00.000Z');

        const inseridas = [];
        for (let i = 1; i <= 5; i += 1) {
          const [item] = await trx('notificacoes')
            .insert({
              usuario_id: 1,
              tipo: `EVENTO_${i}`,
              categoria: 'SOLICITACOES',
              titulo: `Notificacao ${i}`,
              mensagem: `Corpo ${i}`,
              severidade: 'INFO',
              operacao: 'ADMINISTRATIVA',
              referencia_tipo: 'SOLICITACAO_VIAGEM',
              referencia_id: i,
              url_destino: '/solicitacoes',
              chave_idempotencia: `cursor-empate-${i}`,
              criado_em: i === 1 ? tsMaisAntigo : tsEmpate,
            })
            .returning(['id', 'criado_em']);
          inseridas.push(item);
        }

        // Pagina 1 (limit 2)
        const pagina1 = await trx('notificacoes')
          .where({ usuario_id: 1 })
          .orderBy([
            { column: 'criado_em', order: 'desc' },
            { column: 'id', order: 'desc' },
          ])
          .limit(2);

        const cursor1 = pagina1[pagina1.length - 1];
        // Pagina 2 (limit 2) usando cursor composto (criado_em, id) < (cursor.criado_em, cursor.id)
        const pagina2 = await trx('notificacoes')
          .where({ usuario_id: 1 })
          .andWhereRaw('(criado_em, id) < (?, ?)', [cursor1.criado_em, cursor1.id])
          .orderBy([
            { column: 'criado_em', order: 'desc' },
            { column: 'id', order: 'desc' },
          ])
          .limit(2);

        const cursor2 = pagina2[pagina2.length - 1];
        // Pagina 3 (limit 2)
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
          '4. Paginacao estavel por cursor (criado_em DESC, id DESC) com timestamps empatados: OK'
        );

        // 3.3 Testa compatibilidade com retencao 30 dias (lidas) e 90 dias (nao lidas) - limiares 29/30/31 e 89/90/91
        await trx('notificacoes').del();
        const agoraRef = new Date('2026-11-24T18:00:00.000Z');
        const diasAtras = (d) => new Date(agoraRef.getTime() - d * 24 * 60 * 60 * 1000);

        await trx('notificacoes').insert([
          {
            usuario_id: 1,
            tipo: 'LIDA_29D',
            categoria: 'GERAL',
            titulo: 'Lida 29d',
            mensagem: 'Mantem',
            severidade: 'INFO',
            operacao: 'ADMINISTRATIVA',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-lida-29',
            criado_em: diasAtras(29),
            lida_em: diasAtras(29),
          },
          {
            usuario_id: 1,
            tipo: 'LIDA_30D_EXATO',
            categoria: 'GERAL',
            titulo: 'Lida 30d',
            mensagem: 'Mantem no limite exato (> 30d)',
            severidade: 'INFO',
            operacao: 'ADMINISTRATIVA',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-lida-30',
            criado_em: diasAtras(30),
            lida_em: diasAtras(30),
          },
          {
            usuario_id: 1,
            tipo: 'LIDA_31D',
            categoria: 'GERAL',
            titulo: 'Lida 31d',
            mensagem: 'Expurga',
            severidade: 'INFO',
            operacao: 'ADMINISTRATIVA',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-lida-31',
            criado_em: diasAtras(31),
            lida_em: diasAtras(31),
          },
          {
            usuario_id: 1,
            tipo: 'NAO_LIDA_89D',
            categoria: 'GERAL',
            titulo: 'Nao lida 89d',
            mensagem: 'Mantem',
            severidade: 'INFO',
            operacao: 'ADMINISTRATIVA',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-nlida-89',
            criado_em: diasAtras(89),
            lida_em: null,
          },
          {
            usuario_id: 1,
            tipo: 'NAO_LIDA_90D_EXATO',
            categoria: 'GERAL',
            titulo: 'Nao lida 90d',
            mensagem: 'Mantem no limite exato (> 90d)',
            severidade: 'INFO',
            operacao: 'ADMINISTRATIVA',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-nlida-90',
            criado_em: diasAtras(90),
            lida_em: null,
          },
          {
            usuario_id: 1,
            tipo: 'NAO_LIDA_91D',
            categoria: 'GERAL',
            titulo: 'Nao lida 91d',
            mensagem: 'Expurga',
            severidade: 'INFO',
            operacao: 'ADMINISTRATIVA',
            url_destino: '/solicitacoes',
            chave_idempotencia: 'ret-nlida-91',
            criado_em: diasAtras(91),
            lida_em: null,
          },
        ]);

        const { rows: elegiveisExpurgo } = await trx.raw(
          `SELECT chave_idempotencia
           FROM notificacoes
           WHERE (lida_em IS NOT NULL AND criado_em < ?::timestamptz - INTERVAL '30 days')
              OR (lida_em IS NULL AND criado_em < ?::timestamptz - INTERVAL '90 days')
           ORDER BY chave_idempotencia`,
          [agoraRef.toISOString(), agoraRef.toISOString()]
        );

        const chavesExpurgadas = elegiveisExpurgo.map((r) => r.chave_idempotencia);
        if (JSON.stringify(chavesExpurgadas) !== JSON.stringify(['ret-lida-31', 'ret-nlida-91'])) {
          throw new Error(
            `Limiares de retencao 30/90 dias incorretos: obtido ${JSON.stringify(chavesExpurgadas)}`
          );
        }

        relatorio.push(
          '5. Compatibilidade com retencao 30 dias (lidas) e 90 dias (nao lidas) nos limiares 29/30/31 e 89/90/91: OK'
        );

        // 3.4 Testa protecao de rollback (down bloqueado com dados) e ciclo down/up limpo
        let bloqueouDownComDados = false;
        try {
          await migrationScrum225.down(trx);
        } catch (e) {
          bloqueouDownComDados = /Rollback bloqueado: existem registros em notificacoes/i.test(
            e.message
          );
        }
        if (!bloqueouDownComDados) {
          throw new Error('Migration down deveria ter bloqueado rollback com notificacoes existentes.');
        }

        await trx('notificacoes').del();
        await migrationScrum225.down(trx);
        await migrationScrum225.up(trx);

        relatorio.push(
          '6. Protecao contra rollback destrutivo e ciclo completo down -> up idempotente: OK'
        );

        throw new Error('ROLLBACK_ISOLADO');
      })
      .catch((e) => {
        if (e.message !== 'ROLLBACK_ISOLADO') throw e;
      });

    // 4. Verifica estado da role da aplicacao se configurada no ambiente
    const appUser = process.env.POSTGRES_APP_USER;
    if (appUser) {
      const estadoRole = await inspecionarEstadoRole(db, appUser);
      if (estadoRole) {
        validarEstadoMinimoPrivilegio(estadoRole);
        relatorio.push(`7. Validacao de minimo privilegio da role "${appUser}": OK`);
      }
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
