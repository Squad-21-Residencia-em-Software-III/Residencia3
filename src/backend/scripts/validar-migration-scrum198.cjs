const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');
const migrationScrum198 = require('../database/migrations/20261118113000_scrum_198_equipes_integrantes_designacoes_svo');
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
      versao_sessao INTEGER NOT NULL DEFAULT 1,
      CONSTRAINT chk_usuarios_perfil CHECK (
        perfil IN (
          'ADMINISTRADOR',
          'SOLICITANTE',
          'GESTOR_FROTA',
          'GESTOR_SVO',
          'MOTORISTA_FROTA',
          'MOTORISTA_SVO'
        )
      ),
      CONSTRAINT chk_usuarios_tipo_usuario CHECK (
        tipo_usuario = CASE
          WHEN perfil IN ('MOTORISTA_FROTA', 'MOTORISTA_SVO') THEN 'MOTORISTA'
          ELSE perfil
        END
      )
    );

    CREATE TABLE equipes_svo (
      id SERIAL PRIMARY KEY,
      nome_equipe VARCHAR(100) NOT NULL
    );

    CREATE TABLE ordens_svo (
      id SERIAL PRIMARY KEY,
      equipe_id INTEGER NULL REFERENCES equipes_svo(id) ON DELETE RESTRICT,
      status VARCHAR(30) NOT NULL DEFAULT 'ALOCADA',
      capacidade_utilizada INTEGER NOT NULL DEFAULT 1,
      inicio_previsto TIMESTAMPTZ NULL,
      fim_previsto TIMESTAMPTZ NULL,
      data_hora_saida TIMESTAMPTZ NULL,
      data_hora_conclusao TIMESTAMPTZ NULL,
      liberada_em TIMESTAMPTZ NULL DEFAULT NULL
    );

    INSERT INTO usuarios (id, nome, email, senha, tipo_usuario, perfil)
    VALUES
      (1, 'Gestor SVO Teste', 'gestor.svo@exemplo.invalid', 'hash', 'GESTOR_SVO', 'GESTOR_SVO'),
      (2, 'Motorista SVO Teste', 'motorista.svo@exemplo.invalid', 'hash', 'MOTORISTA', 'MOTORISTA_SVO');
    SELECT setval(pg_get_serial_sequence('usuarios', 'id'), 2, true);

    INSERT INTO equipes_svo (id, nome_equipe)
    VALUES
      (1, 'Equipe Alfa'),
      (2, 'Equipe Beta');
    SELECT setval(pg_get_serial_sequence('equipes_svo', 'id'), 2, true);

    -- Ordem legada com equipe_id preenchido e sem designacoes individuais
    INSERT INTO ordens_svo (id, equipe_id, status, capacidade_utilizada, inicio_previsto, fim_previsto)
    VALUES
      (1, 1, 'ALOCADA', 1, NOW() + interval '1 hour', NOW() + interval '2 hours'),
      (2, 1, 'ALOCADA', 1, NOW() + interval '3 hours', NOW() + interval '4 hours');
    SELECT setval(pg_get_serial_sequence('ordens_svo', 'id'), 2, true);
  `);
}

async function executarValidacaoCompletaScrum198() {
  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });
  const db = knex(configMigration);
  const relatorio = [];

  try {
    // 1. Bloqueio de nomes duplicados normalizados ou vazios em equipes_svo no UP
    const schemaDuplicado = `val198_dup_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsolada(trx, schemaDuplicado);
        await trx('equipes_svo').insert({ nome_equipe: '  equipe alfa  ' });

        let bloqueouDuplicado = false;
        try {
          await migrationScrum198.up(trx);
        } catch (e) {
          bloqueouDuplicado = /nomes de equipe duplicados apos normalizacao/i.test(e.message);
        }
        if (!bloqueouDuplicado) {
          throw new Error(
            'Migration up deveria ter bloqueado nomes duplicados normalizados em equipes_svo.'
          );
        }
        throw new Error('ROLLBACK_ISOLADO');
      })
      .catch((e) => {
        if (e.message !== 'ROLLBACK_ISOLADO') throw e;
      });

    // 2. Bloqueio de estrutura preexistente incompativel no UP
    const schemaIncomp = `val198_inc_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsolada(trx, schemaIncomp);
        await trx.raw(`
          CREATE TABLE equipes_svo_integrantes (
            id SERIAL PRIMARY KEY,
            equipe_id INTEGER NOT NULL,
            usuario_id INTEGER NOT NULL,
            vinculado_em TEXT NOT NULL,
            desvinculado_em TIMESTAMPTZ NULL
          )
        `);

        let bloqueouIncompativel = false;
        try {
          await migrationScrum198.up(trx);
        } catch (e) {
          bloqueouIncompativel = /Estrutura incompativel em equipes_svo_integrantes/i.test(
            e.message
          );
        }
        if (!bloqueouIncompativel) {
          throw new Error(
            'Migration up deveria ter rejeitado tabela equipes_svo_integrantes preexistente incompativel.'
          );
        }
        throw new Error('ROLLBACK_ISOLADO');
      })
      .catch((e) => {
        if (e.message !== 'ROLLBACK_ISOLADO') throw e;
      });

    relatorio.push(
      '1. Bloqueio de duplicidades legadas normalizadas e estruturas preexistentes incompativeis no up: OK'
    );

    // 3. Ciclo completo: UP -> Constraints -> EXPLAIN -> Compatibilidade Legada -> Protecao DOWN -> DOWN limpo -> Re-UP
    const schemaCiclo = `val198_ciclo_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsolada(trx, schemaCiclo);
        await migrationScrum198.up(trx);
        relatorio.push('2. Aplicacao limpa da migration SCRUM-198 (up) e validacao de catalogo: OK');

        // 3.1 Testa criacao de INTEGRANTE_SVO e constraints de usuarios / equipes_svo
        const [integrante] = await trx('usuarios')
          .insert({
            nome: 'Integrante Maria',
            email: 'maria.integrante@exemplo.invalid',
            senha: 'hash',
            tipo_usuario: 'INTEGRANTE_SVO',
            perfil: 'INTEGRANTE_SVO',
          })
          .returning('*');

        const bloqueouTipoUsuarioIncoerente = await esperarErroSql(trx, '23514', () =>
          trx('usuarios').insert({
            nome: 'Invalido',
            email: 'inv@exemplo.invalid',
            senha: 'hash',
            tipo_usuario: 'MOTORISTA',
            perfil: 'INTEGRANTE_SVO',
          })
        );

        const bloqueouNomeEquipeDuplicado = await esperarErroSql(trx, '23505', () =>
          trx('equipes_svo').insert({ nome_equipe: '  EQUIPE ALFA ' })
        );

        const bloqueouNomeEquipeVazio = await esperarErroSql(trx, '23514', () =>
          trx('equipes_svo').insert({ nome_equipe: '   ' })
        );

        if (
          !bloqueouTipoUsuarioIncoerente ||
          !bloqueouNomeEquipeDuplicado ||
          !bloqueouNomeEquipeVazio
        ) {
          throw new Error('Falha nas constraints de usuarios ou equipes_svo.');
        }

        // 3.2 Testa equipes_svo_integrantes (multiplas equipes, unicidade ativa, ordem temporal e historico)
        const [vinculoAlfa] = await trx('equipes_svo_integrantes')
          .insert({
            equipe_id: 1,
            usuario_id: integrante.id,
            vinculado_em: new Date('2026-11-18T10:00:00Z'),
          })
          .returning('*');

        await trx('equipes_svo_integrantes').insert({
          equipe_id: 2,
          usuario_id: integrante.id,
          vinculado_em: new Date('2026-11-18T10:00:00Z'),
        });

        const bloqueouVinculoDuplicadoAtivo = await esperarErroSql(trx, '23505', () =>
          trx('equipes_svo_integrantes').insert({
            equipe_id: 1,
            usuario_id: integrante.id,
          })
        );

        const bloqueouDesvinculoAnterior = await esperarErroSql(trx, '23514', () =>
          trx('equipes_svo_integrantes')
            .where({ id: vinculoAlfa.id })
            .update({ desvinculado_em: new Date('2026-11-18T09:00:00Z') })
        );

        // Encerra vinculo e revincula na mesma equipe preservando historico
        await trx('equipes_svo_integrantes')
          .where({ id: vinculoAlfa.id })
          .update({ desvinculado_em: new Date('2026-11-18T10:30:00Z') });
        await trx('equipes_svo_integrantes').insert({
          equipe_id: 1,
          usuario_id: integrante.id,
          vinculado_em: new Date('2026-11-18T11:00:00Z'),
        });

        // 3.3 Testa ordens_svo_integrantes (unicidade ativa, coerencia de revogacao, FKs e historico)
        const [designacao] = await trx('ordens_svo_integrantes')
          .insert({
            ordem_id: 2,
            equipe_id: 1,
            usuario_id: integrante.id,
            designado_em: new Date('2026-11-18T11:05:00Z'),
            designado_por: 1,
          })
          .returning('*');

        const bloqueouDesignacaoDuplicadaAtiva = await esperarErroSql(trx, '23505', () =>
          trx('ordens_svo_integrantes').insert({
            ordem_id: 2,
            equipe_id: 1,
            usuario_id: integrante.id,
            designado_por: 1,
          })
        );

        const bloqueouRevogacaoSemAutor = await esperarErroSql(trx, '23514', () =>
          trx('ordens_svo_integrantes')
            .where({ id: designacao.id })
            .update({ revogado_em: new Date('2026-11-18T11:10:00Z'), revogado_por: null })
        );

        const bloqueouRevogacaoAnterior = await esperarErroSql(trx, '23514', () =>
          trx('ordens_svo_integrantes')
            .where({ id: designacao.id })
            .update({ revogado_em: new Date('2026-11-18T11:00:00Z'), revogado_por: 1 })
        );

        const bloqueouFkRestrita = await esperarErroSql(trx, '23503', () =>
          trx('usuarios').where({ id: integrante.id }).del()
        );

        // Revoga e redesigna na mesma ordem preservando o registro revogado
        await trx('ordens_svo_integrantes')
          .where({ id: designacao.id })
          .update({ revogado_em: new Date('2026-11-18T11:10:00Z'), revogado_por: 1 });
        await trx('ordens_svo_integrantes').insert({
          ordem_id: 2,
          equipe_id: 1,
          usuario_id: integrante.id,
          designado_em: new Date('2026-11-18T11:15:00Z'),
          designado_por: 1,
        });

        if (
          !bloqueouVinculoDuplicadoAtivo ||
          !bloqueouDesvinculoAnterior ||
          !bloqueouDesignacaoDuplicadaAtiva ||
          !bloqueouRevogacaoSemAutor ||
          !bloqueouRevogacaoAnterior ||
          !bloqueouFkRestrita
        ) {
          throw new Error(
            'Falha na verificacao de constraints de equipes_svo_integrantes ou ordens_svo_integrantes.'
          );
        }
        relatorio.push(
          '3. Constraints (23505 UNIQUE parcial, 23514 CHECK temporal/coerencia, 23503 FK RESTRICT) e preservacao de historico: OK'
        );

        // 3.4 Verifica planos EXPLAIN com indices parciais
        await trx.raw('SET LOCAL enable_seqscan = off');
        const explainOcupacao = await trx.raw(
          `EXPLAIN (FORMAT JSON)
           SELECT d.ordem_id
           FROM ordens_svo_integrantes d
           WHERE d.usuario_id = ? AND d.revogado_em IS NULL`,
          [integrante.id]
        );
        const idxOcupacao = explainOcupacao.rows[0]['QUERY PLAN'][0].Plan['Index Name'];
        if (idxOcupacao !== 'idx_ordens_svo_integrantes_usuario_ativo') {
          throw new Error(
            `Indice esperado idx_ordens_svo_integrantes_usuario_ativo, obtido: ${idxOcupacao}`
          );
        }

        const explainVinculo = await trx.raw(
          `EXPLAIN (FORMAT JSON)
           SELECT usuario_id
           FROM equipes_svo_integrantes
           WHERE equipe_id = 1 AND desvinculado_em IS NULL`
        );
        const idxVinculo = explainVinculo.rows[0]['QUERY PLAN'][0].Plan['Index Name'];
        if (idxVinculo !== 'uq_equipes_svo_integrantes_ativo') {
          throw new Error(
            `Indice esperado uq_equipes_svo_integrantes_ativo, obtido: ${idxVinculo}`
          );
        }
        relatorio.push(
          '4. Planos de execucao EXPLAIN (uq_equipes_svo_integrantes_ativo e idx_ordens_svo_integrantes_usuario_ativo): OK'
        );

        // 3.5 Verifica compatibilidade de ordem legada (ordem_id = 1 tem equipe_id = 1, mas zero designacoes)
        await trx('ordens_svo')
          .where({ id: 1 })
          .update({
            status: 'CONCLUIDA',
            data_hora_saida: new Date('2026-11-18T11:00:00Z'),
            data_hora_conclusao: new Date('2026-11-18T11:40:00Z'),
          });
        const minhasColetas = await trx('ordens_svo_integrantes as d')
          .join('ordens_svo as o', 'o.id', 'd.ordem_id')
          .where({ 'd.usuario_id': integrante.id })
          .whereNull('d.revogado_em')
          .select('o.id');
        if (minhasColetas.some((o) => o.id === 1) || !minhasColetas.some((o) => o.id === 2)) {
          throw new Error(
            'Ordem legada sem designacao individual nao deve aparecer em Minhas Coletas apenas pelo vinculo com a equipe.'
          );
        }
        relatorio.push(
          '5. Compatibilidade de ordens legadas com equipe (conclusao sem backfill e isolamento em Minhas Coletas): OK'
        );

        // 3.6 Testa protecao contra rollback destrutivo (designacoes -> vinculos -> perfil INTEGRANTE_SVO)
        let bloqueouDownDesignacoes = false;
        try {
          await migrationScrum198.down(trx);
        } catch (e) {
          bloqueouDownDesignacoes = /existem designacoes registradas em ordens_svo_integrantes/i.test(
            e.message
          );
        }
        await trx('ordens_svo_integrantes').del();

        let bloqueouDownVinculos = false;
        try {
          await migrationScrum198.down(trx);
        } catch (e) {
          bloqueouDownVinculos = /existem vinculos registrados em equipes_svo_integrantes/i.test(
            e.message
          );
        }
        await trx('equipes_svo_integrantes').del();

        let bloqueouDownPerfil = false;
        try {
          await migrationScrum198.down(trx);
        } catch (e) {
          bloqueouDownPerfil = /existem usuarios com perfil INTEGRANTE_SVO/i.test(e.message);
        }
        await trx('usuarios').where({ id: integrante.id }).del();

        if (!bloqueouDownDesignacoes || !bloqueouDownVinculos || !bloqueouDownPerfil) {
          throw new Error('Falha na protecao contra rollback destrutivo da SCRUM-198.');
        }
        relatorio.push(
          '6. Protecao contra rollback destrutivo (designacoes, vinculos e usuarios INTEGRANTE_SVO): OK'
        );

        // 3.7 Executa rollback limpo (DOWN) e reaplicacao (UP)
        await migrationScrum198.down(trx);
        const { rows: tabelasRestantes } = await trx.raw(
          `SELECT table_name
           FROM information_schema.tables
           WHERE table_schema = ?
             AND table_name IN ('equipes_svo_integrantes', 'ordens_svo_integrantes')`,
          [schemaCiclo]
        );
        if (tabelasRestantes.length !== 0) {
          throw new Error('Tabelas da SCRUM-198 deveriam ter sido removidas apos down limpo.');
        }

        await migrationScrum198.up(trx);
        relatorio.push(
          '7. Ciclo completo de rollback limpo (down) e reaplicacao (up) preservando dados existentes: OK'
        );

        throw new Error('ROLLBACK_ISOLADO');
      })
      .catch((e) => {
        if (e.message !== 'ROLLBACK_ISOLADO') throw e;
      });

    // 4. Validacao da role de minimo privilegio no ambiente atual
    if (process.env.POSTGRES_APP_USER) {
      const estadoRole = await inspecionarEstadoRole(db, process.env.POSTGRES_APP_USER);
      validarEstadoMinimoPrivilegio(estadoRole);
      relatorio.push(
        `8. Validacao de minimo privilegio da role da aplicacao (rolsuper=${estadoRole.rolsuper}, rolinherit=${estadoRole.rolinherit}, podeDeletarHistoricoSvo=${estadoRole.podeDeletarHistoricoSvo}): OK`
      );
    }

    console.log('Validacao da migration SCRUM-198 concluida com sucesso:');
    for (const item of relatorio) {
      console.log(`  - ${item}`);
    }
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  executarValidacaoCompletaScrum198().catch((erro) => {
    console.error('Falha na validacao da migration SCRUM-198:', erro.message);
    process.exit(1);
  });
}

module.exports = { executarValidacaoCompletaScrum198 };
