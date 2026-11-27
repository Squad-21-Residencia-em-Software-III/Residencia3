const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');
const migrationAlertasSvoEMaterialSensivel = require('../database/migrations/20261117172500_scrum_183_fila_alertas_svo_e_material_sensivel');
const {
  inspecionarEstadoRole,
  validarEstadoMinimoPrivilegio,
} = require('./provisionar-usuario-app.cjs');

async function criarBaseIsolada(trx, schema) {
  await trx.raw('CREATE SCHEMA ??', [schema]);
  await trx.raw('SET LOCAL search_path TO ??', [schema]);

  await trx.raw(`
    CREATE TABLE ordens_svo (
      id SERIAL PRIMARY KEY,
      status VARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO_ALOCACAO',
      capacidade_utilizada INTEGER NOT NULL DEFAULT 1,
      inicio_previsto TIMESTAMPTZ NULL,
      fim_previsto TIMESTAMPTZ NULL,
      CONSTRAINT chk_ordens_svo_periodo_previsto CHECK (
        (inicio_previsto IS NULL AND fim_previsto IS NULL)
        OR (inicio_previsto IS NOT NULL AND fim_previsto IS NOT NULL AND fim_previsto > inicio_previsto)
      )
    );

    CREATE INDEX idx_ordens_svo_periodo_previsto
      ON ordens_svo (inicio_previsto, fim_previsto)
      WHERE status IN ('ALOCADA', 'EM_DESLOCAMENTO');

    CREATE TABLE solicitacoes_viagem (
      id SERIAL PRIMARY KEY,
      origem VARCHAR(255) NOT NULL,
      destino VARCHAR(255) NOT NULL,
      finalidade TEXT NOT NULL,
      data_saida_desejada TIMESTAMPTZ NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE_APROVACAO'
    );

    INSERT INTO ordens_svo (id, status, capacidade_utilizada) VALUES (1, 'ALOCADA', 1), (2, 'ALOCADA', 1);
    INSERT INTO solicitacoes_viagem (id, origem, destino, finalidade, data_saida_desejada)
    VALUES (1, 'Unidade Central', 'Laboratorio', 'Transporte administrativo', NOW() + interval '2 hours');
  `);
}

async function executarValidacaoCompleta() {
  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });
  const db = knex(configMigration);
  const relatorio = [];

  try {
    // 1. Teste de rejeicao de estrutura preexistente incompativel no UP
    const schemaIncompativel = `val_incomp_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsolada(trx, schemaIncompativel);
        // Cria liberada_em com tipo incorreto (TEXT em vez de TIMESTAMPTZ)
        await trx.raw('ALTER TABLE ordens_svo ADD COLUMN liberada_em TEXT NULL');

        let falhouComoEsperado = false;
        try {
          await migrationAlertasSvoEMaterialSensivel.up(trx);
        } catch (erro) {
          falhouComoEsperado = /Estrutura incompativel/i.test(erro.message);
        }
        if (!falhouComoEsperado) {
          throw new Error('Migration up deveria ter rejeitado coluna liberada_em preexistente com tipo TEXT.');
        }
        relatorio.push('1. Bloqueio de estrutura preexistente incompativel no up: OK');
        throw new Error('ROLLBACK_ISOLADO');
      })
      .catch((e) => {
        if (e.message !== 'ROLLBACK_ISOLADO') throw e;
      });

    // 2. Teste completo de UP -> Constraints/EXPLAIN -> Bloqueio de DOWN com dados -> DOWN limpo -> Re-UP
    const schemaCiclo = `val_ciclo_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsolada(trx, schemaCiclo);

        // 2.1 Aplicacao limpa (UP)
        await migrationAlertasSvoEMaterialSensivel.up(trx);
        relatorio.push('2. Aplicacao limpa da migration (up) e validacao de catalogo: OK');

        // 2.2 Teste de constraints e EXPLAIN
        await trx('alertas_atraso_svo').insert({ ordem_em_atraso_id: 1, ordem_afetada_id: 2 });

        await trx.raw('SAVEPOINT sp_validacao');
        let bloqueouDuplicado = false;
        try {
          await trx('alertas_atraso_svo').insert({ ordem_em_atraso_id: 1, ordem_afetada_id: 2 });
        } catch (e) {
          bloqueouDuplicado = e.code === '23505';
          await trx.raw('ROLLBACK TO SAVEPOINT sp_validacao');
        }

        let bloqueouParIgual = false;
        try {
          await trx('alertas_atraso_svo').insert({ ordem_em_atraso_id: 1, ordem_afetada_id: 1 });
        } catch (e) {
          bloqueouParIgual = e.code === '23514';
          await trx.raw('ROLLBACK TO SAVEPOINT sp_validacao');
        }

        let bloqueouFkInexistente = false;
        try {
          await trx('alertas_atraso_svo').insert({ ordem_em_atraso_id: 9999, ordem_afetada_id: 2 });
        } catch (e) {
          bloqueouFkInexistente = e.code === '23503';
          await trx.raw('ROLLBACK TO SAVEPOINT sp_validacao');
        }

        if (!bloqueouDuplicado || !bloqueouParIgual || !bloqueouFkInexistente) {
          throw new Error('Falha na verificacao de constraints de alertas_atraso_svo.');
        }

        await trx.raw('SET LOCAL enable_seqscan = off');
        const explainAbertos = await trx.raw(`
          EXPLAIN (FORMAT JSON)
          SELECT id FROM alertas_atraso_svo WHERE ordem_afetada_id = 2 AND resolvido_em IS NULL
        `);
        const indiceUsado = explainAbertos.rows[0]['QUERY PLAN'][0].Plan['Index Name'];
        if (indiceUsado !== 'idx_alertas_atraso_svo_abertos') {
          throw new Error(`Indice esperado idx_alertas_atraso_svo_abertos, obtido: ${indiceUsado}`);
        }
        relatorio.push(
          '3. Constraints (23505 UNIQUE, 23514 CHECK, 23503 FK) e EXPLAIN (idx_alertas_atraso_svo_abertos): OK'
        );

        // 2.3 Bloqueio de rollback destrutivo enquanto houver alerta registrado
        let bloqueouDownComAlerta = false;
        try {
          await migrationAlertasSvoEMaterialSensivel.down(trx);
        } catch (e) {
          bloqueouDownComAlerta = /Rollback bloqueado: existem registros em alertas_atraso_svo/i.test(
            e.message
          );
        }
        if (!bloqueouDownComAlerta) {
          throw new Error('Migration down deveria ter bloqueado a remocao com alertas existentes.');
        }

        // Limpa alerta e testa bloqueio com liberada_em preenchido
        await trx('alertas_atraso_svo').del();
        await trx('ordens_svo').where({ id: 1 }).update({ liberada_em: trx.fn.now() });

        let bloqueouDownComLiberada = false;
        try {
          await migrationAlertasSvoEMaterialSensivel.down(trx);
        } catch (e) {
          bloqueouDownComLiberada = /Rollback bloqueado: existem ordens em ordens_svo com liberada_em/i.test(
            e.message
          );
        }
        if (!bloqueouDownComLiberada) {
          throw new Error('Migration down deveria ter bloqueado a remocao com liberada_em preenchido.');
        }

        // Limpa liberada_em e testa bloqueio com material_sensivel = true
        await trx('ordens_svo').where({ id: 1 }).update({ liberada_em: null });
        await trx('solicitacoes_viagem').where({ id: 1 }).update({ material_sensivel: true });

        let bloqueouDownComMaterial = false;
        try {
          await migrationAlertasSvoEMaterialSensivel.down(trx);
        } catch (e) {
          bloqueouDownComMaterial = /Rollback bloqueado: existem solicitacoes em solicitacoes_viagem com material_sensivel/i.test(
            e.message
          );
        }
        if (!bloqueouDownComMaterial) {
          throw new Error(
            'Migration down deveria ter bloqueado a remocao com material_sensivel = true.'
          );
        }
        relatorio.push(
          '4. Protecao contra rollback destrutivo (alertas, liberada_em e material_sensivel): OK'
        );

        // 2.4 Reconcilia e executa rollback limpo (DOWN) seguido de reaplicacao (UP)
        await trx('solicitacoes_viagem').where({ id: 1 }).update({ material_sensivel: false });
        await migrationAlertasSvoEMaterialSensivel.down(trx);

        const { rows: tabelaAposDown } = await trx.raw(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = 'alertas_atraso_svo'`,
          [schemaCiclo]
        );
        if (tabelaAposDown.length !== 0) {
          throw new Error('Tabela alertas_atraso_svo deveria ter sido removida apos down limpo.');
        }

        const ordensPreservadas = await trx('ordens_svo').count({ total: '*' }).first();
        if (Number(ordensPreservadas.total) !== 2) {
          throw new Error('Registros base de ordens_svo nao foram preservados apos o rollback.');
        }

        await migrationAlertasSvoEMaterialSensivel.up(trx);
        relatorio.push('5. Ciclo completo de rollback limpo (down) e reaplicacao (up) sem perda de dados: OK');

        throw new Error('ROLLBACK_ISOLADO');
      })
      .catch((e) => {
        if (e.message !== 'ROLLBACK_ISOLADO') throw e;
      });

    // 3. Validacao da role de minimo privilegio no ambiente atual
    if (process.env.POSTGRES_APP_USER) {
      const estadoRole = await inspecionarEstadoRole(db, process.env.POSTGRES_APP_USER);
      validarEstadoMinimoPrivilegio(estadoRole);
      relatorio.push(
        `6. Validacao de minimo privilegio da role da aplicacao (rolsuper=${estadoRole.rolsuper}, rolinherit=${estadoRole.rolinherit}, rolesHerdadas=${estadoRole.rolesHerdadas.length}): OK`
      );
    }

    console.log('Validacao da migration alertas svo e material sensivel e privilegios concluida com sucesso:');
    for (const linha of relatorio) {
      console.log(`  - ${linha}`);
    }
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  executarValidacaoCompleta().catch((erro) => {
    console.error('Falha na validacao da migration alertas svo e material sensivel:', erro.message);
    process.exit(1);
  });
}

module.exports = { executarValidacaoCompleta };
