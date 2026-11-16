const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');

const CONSULTAS_CRITICAS = [
  {
    codigo: 'Q1_AUDITORIAS_PAGINACAO',
    descricao: 'Paginacao de auditorias ordenada por data_hora DESC, id DESC',
    indiceAlvo: 'idx_auditorias_data_hora_id',
    sql: `
      SELECT id, usuario_id, acao, modulo, data_hora
      FROM auditorias
      ORDER BY data_hora DESC, id DESC
      LIMIT 20 OFFSET 0
    `,
  },
  {
    codigo: 'Q2_SOLICITACOES_VIAGEM_STATUS',
    descricao: 'Listagem paginada de solicitacoes de viagem por status e data_saida_desejada',
    indiceAlvo: 'idx_solicitacoes_viagem_status_saida_id',
    sql: `
      SELECT sv.*, un.nome AS unidade_nome, u.nome AS solicitante_nome
      FROM solicitacoes_viagem sv
      LEFT JOIN unidades un ON un.id = sv.unidade_id
      INNER JOIN usuarios u ON u.id = sv.solicitante_id
      WHERE sv.status = 'PENDENTE_APROVACAO'
      ORDER BY sv.data_saida_desejada ASC, sv.id ASC
      LIMIT 20 OFFSET 0
    `,
  },
  {
    codigo: 'Q3_SOLICITACOES_DO_SOLICITANTE_LATERAL',
    descricao: 'Historico de solicitacoes de um solicitante com LEFT JOIN LATERAL da viagem ativa',
    indiceAlvo: 'idx_solicitacoes_viagem_solicitante_saida_id / idx_viagens_frota_solicitacao_ativa_id',
    sql: `
      SELECT sv.id, sv.status, viagem.id AS viagem_id, viagem.status AS viagem_status
      FROM solicitacoes_viagem sv
      LEFT JOIN LATERAL (
        SELECT vf.id, vf.status
        FROM viagens_frota vf
        WHERE vf.solicitacao_id = sv.id AND vf.status <> 'CANCELADA'
        ORDER BY vf.id DESC
        LIMIT 1
      ) AS viagem ON TRUE
      WHERE sv.solicitante_id = 1
      ORDER BY sv.data_saida_desejada DESC, sv.id DESC
      LIMIT 20 OFFSET 0
    `,
  },
  {
    codigo: 'Q4_OCUPACAO_VEICULOS_SVO',
    descricao: 'Agregacao de capacidade utilizada dos veiculos SVO em ordens ativas',
    indiceAlvo: 'idx_veiculos_frota_status / idx_ordens_svo_veiculo_status_ativo',
    sql: `
      SELECT
        v.id,
        v.placa,
        v.capacidade_maxima,
        COALESCE(SUM(o.capacidade_utilizada), 0)::integer AS capacidade_utilizada
      FROM veiculos v
      LEFT JOIN ordens_svo o
        ON o.veiculo_id = v.id
        AND o.status IN ('ALOCADA', 'EM_DESLOCAMENTO')
      WHERE v.tipo_frota = 'SVO'
        AND v.status IN ('DISPONIVEL', 'RESERVADO')
      GROUP BY v.id, v.placa, v.capacidade_maxima
      ORDER BY v.id
    `,
  },
  {
    codigo: 'Q5_HISTORICO_MANUTENCOES_VEICULO',
    descricao: 'Historico de manutencoes por veiculo com limite explicito e ordenacao temporal',
    indiceAlvo: 'idx_manutencoes_veiculo_data_id',
    sql: `
      SELECT m.*, v.placa AS veiculo_placa, f.nome AS fornecedor_nome
      FROM manutencoes m
      LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
      LEFT JOIN veiculos v ON m.veiculo_id = v.id
      WHERE m.veiculo_id = 1
      ORDER BY m.data_manutencao DESC, m.id DESC
      LIMIT 200
    `,
  },
];

async function avaliarPlanosETesteCarga() {
  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });
  const dbAdmin = knex(configMigration);

  const configApp = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'app',
  });
  const dbApp = knex(configApp);

  try {
    const { rows: indicesRows } = await dbAdmin.raw(`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname
    `);

    console.log(`Indices customizados ativos no schema public: ${indicesRows.length}`);

    const resultadosPlanos = [];

    // Avalia os planos de execucao em uma transacao com volume sintetico (revertida com ROLLBACK ao final)
    // para demonstrar o comportamento real do otimizador de custos do PostgreSQL sob carga acumulada.
    await dbAdmin.transaction(async (trx) => {
      const { rows: userRows } = await trx.raw('SELECT id FROM usuarios ORDER BY id LIMIT 1');
      const usuarioId = userRows[0]?.id || 1;

      const { rows: veicRows } = await trx.raw('SELECT id FROM veiculos ORDER BY id LIMIT 1');
      const veiculoId = veicRows[0]?.id || 1;

      // Insere massa sintetica temporaria (sera desfeita pelo ROLLBACK)
      await trx.raw(
        `
        INSERT INTO auditorias (usuario_id, acao, modulo, data_hora)
        SELECT ?, 'ACAO_BENCHMARK_' || g, 'USUARIOS', NOW() - (g || ' minutes')::interval
        FROM generate_series(1, 3000) AS g
      `,
        [usuarioId]
      );

      await trx.raw(
        `
        INSERT INTO solicitacoes_viagem (solicitante_id, origem, destino, finalidade, data_saida_desejada, status)
        SELECT
          ?,
          'Origem ' || g,
          'Destino ' || g,
          'Finalidade ' || g,
          NOW() + (g || ' hours')::interval,
          CASE WHEN g % 5 = 0 THEN 'PENDENTE_APROVACAO' ELSE 'CONCLUIDA' END
        FROM generate_series(1, 1500) AS g
      `,
        [usuarioId]
      );

      await trx.raw(
        `
        INSERT INTO manutencoes (veiculo_id, tipo_manutencao, data_manutencao, descricao, custo, status)
        SELECT
          ?,
          'PREVENTIVA',
          CURRENT_DATE - (g % 365),
          'Manutencao sintetica ' || g,
          250.00,
          'CONCLUIDA'
        FROM generate_series(1, 1200) AS g
      `,
        [veiculoId]
      );

      await trx.raw('ANALYZE auditorias');
      await trx.raw('ANALYZE solicitacoes_viagem');
      await trx.raw('ANALYZE viagens_frota');
      await trx.raw('ANALYZE ordens_svo');
      await trx.raw('ANALYZE veiculos');
      await trx.raw('ANALYZE manutencoes');

      for (const item of CONSULTAS_CRITICAS) {
        await trx.raw('SET LOCAL enable_indexscan = off');
        await trx.raw('SET LOCAL enable_bitmapscan = off');
        await trx.raw('SET LOCAL enable_indexonlyscan = off');
        const semIndiceRes = await trx.raw(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${item.sql}`);
        const planoSemIndice = semIndiceRes.rows[0]['QUERY PLAN'][0];

        await trx.raw('SET LOCAL enable_indexscan = on');
        await trx.raw('SET LOCAL enable_bitmapscan = on');
        await trx.raw('SET LOCAL enable_indexonlyscan = on');
        const comIndiceRes = await trx.raw(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${item.sql}`);
        const planoComIndice = comIndiceRes.rows[0]['QUERY PLAN'][0];

        resultadosPlanos.push({
          codigo: item.codigo,
          descricao: item.descricao,
          indiceAlvo: item.indiceAlvo,
          semIndice: {
            noRaiz: planoSemIndice.Plan['Node Type'],
            custoTotal: planoSemIndice.Plan['Total Cost'],
            tempoExecucaoMs: planoSemIndice['Execution Time'],
          },
          comIndice: {
            noRaiz: planoComIndice.Plan['Node Type'],
            custoTotal: planoComIndice.Plan['Total Cost'],
            tempoExecucaoMs: planoComIndice['Execution Time'],
          },
        });
      }

      // Reverte a massa sintetica para manter o banco intacto
      throw new Error('ROLLBACK_BENCHMARK_INTENCIONAL');
    }).catch((err) => {
      if (err.message !== 'ROLLBACK_BENCHMARK_INTENCIONAL') {
        throw err;
      }
    });

    console.log('\nComparativo de Planos de Execucao (EXPLAIN ANALYZE sob massa de teste):');
    for (const r of resultadosPlanos) {
      console.log(
        `  [${r.codigo}] ${r.descricao}\n` +
          `    Sem indice: ${r.semIndice.noRaiz} | Custo=${r.semIndice.custoTotal} | Tempo=${r.semIndice.tempoExecucaoMs.toFixed(3)} ms\n` +
          `    Com indice: ${r.comIndice.noRaiz} | Custo=${r.comIndice.custoTotal} | Tempo=${r.comIndice.tempoExecucaoMs.toFixed(3)} ms (${r.indiceAlvo})`
      );
    }

    // Teste de carga concorrente sobre o pool da aplicacao (POSTGRES_APP_USER, max=10)
    const totalRequisicoesConcorrentes = 30;
    const latenciasMs = [];
    const inicioCarga = Date.now();

    const promessas = Array.from({ length: totalRequisicoesConcorrentes }, async (_, idx) => {
      const t0 = Date.now();
      const consultaEscolhida = CONSULTAS_CRITICAS[idx % CONSULTAS_CRITICAS.length];
      await dbApp.raw(consultaEscolhida.sql);
      latenciasMs.push(Date.now() - t0);
    });

    await Promise.all(promessas);
    const duracaoTotalCargaMs = Date.now() - inicioCarga;
    latenciasMs.sort((a, b) => a - b);

    const p50 = latenciasMs[Math.floor(latenciasMs.length * 0.5)];
    const p95 = latenciasMs[Math.floor(latenciasMs.length * 0.95)];
    const maxLatencia = latenciasMs[latenciasMs.length - 1];

    console.log('\nTeste de Carga Concorrente no Pool (conta de minimo privilegio):');
    console.log(`  Pool configurado      : min=${configApp.pool.min}, max=${configApp.pool.max}, acquireTimeout=${configApp.pool.acquireTimeoutMillis}ms`);
    console.log(`  Consultas simultaneas : ${totalRequisicoesConcorrentes} (3x o limite max do pool, testando fila de aquisicao)`);
    console.log(`  Taxa de sucesso       : ${latenciasMs.length}/${totalRequisicoesConcorrentes} (100%)`);
    console.log(`  Tempo total da bateria: ${duracaoTotalCargaMs} ms`);
    console.log(`  Latencia p50 / p95 / max: ${p50} ms / ${p95} ms / ${maxLatencia} ms`);

    return {
      indicesAtivos: indicesRows.length,
      resultadosPlanos,
      cargaPool: {
        poolMin: configApp.pool.min,
        poolMax: configApp.pool.max,
        acquireTimeoutMillis: configApp.pool.acquireTimeoutMillis,
        requisicoesSimultaneas: totalRequisicoesConcorrentes,
        sucesso: latenciasMs.length,
        duracaoTotalCargaMs,
        p50Ms: p50,
        p95Ms: p95,
        maxMs: maxLatencia,
      },
    };
  } finally {
    await dbApp.destroy();
    await dbAdmin.destroy();
  }
}

module.exports = {
  CONSULTAS_CRITICAS,
  avaliarPlanosETesteCarga,
};

if (require.main === module) {
  avaliarPlanosETesteCarga().catch((erro) => {
    console.error('Falha ao avaliar consultas e pool:', erro.message);
    process.exit(1);
  });
}
