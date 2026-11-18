const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');
const migrationScrum210 = require('../database/migrations/20261118121000_scrum_210_evidencias_odometro_e_deslocamentos_svo');
const {
  inspecionarEstadoRole,
  validarEstadoMinimoPrivilegio,
} = require('./provisionar-usuario-app.cjs');

async function esperarErroSql(trx, codigoEsperado, acao) {
  await trx.raw('SAVEPOINT sp_teste_negativo_210');
  try {
    await acao();
    return false;
  } catch (e) {
    await trx.raw('ROLLBACK TO SAVEPOINT sp_teste_negativo_210');
    await trx.raw('RELEASE SAVEPOINT sp_teste_negativo_210');
    return e && e.code === codigoEsperado;
  }
}

async function criarBaseIsoladaScrum210(trx, schema) {
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
      ativo BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE veiculos (
      id SERIAL PRIMARY KEY,
      placa VARCHAR(10) NOT NULL UNIQUE,
      modelo VARCHAR(100) NOT NULL,
      tipo_frota VARCHAR(20) NOT NULL,
      capacidade_maxima INTEGER NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'DISPONIVEL'
    );

    CREATE TABLE motoristas (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      numero_cnh VARCHAR(20) NOT NULL UNIQUE,
      categoria_cnh VARCHAR(5) NOT NULL,
      validade_cnh DATE NOT NULL,
      tipo_motorista VARCHAR(20) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'DISPONIVEL'
    );

    CREATE TABLE auditorias (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      acao VARCHAR(255) NOT NULL,
      modulo VARCHAR(100) NOT NULL,
      data_hora TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE viagens_frota (
      id SERIAL PRIMARY KEY,
      veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE RESTRICT,
      motorista_id INTEGER NOT NULL REFERENCES motoristas(id) ON DELETE RESTRICT,
      km_inicial INTEGER NULL,
      km_final INTEGER NULL,
      data_hora_efetiva_saida TIMESTAMPTZ NULL,
      data_hora_efetiva_chegada TIMESTAMPTZ NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'AGENDADA'
    );

    CREATE TABLE ordens_svo (
      id SERIAL PRIMARY KEY,
      veiculo_id INTEGER NULL REFERENCES veiculos(id) ON DELETE RESTRICT,
      motorista_id INTEGER NULL REFERENCES motoristas(id) ON DELETE RESTRICT,
      capacidade_utilizada INTEGER NOT NULL DEFAULT 1,
      km_inicial INTEGER NULL,
      km_final INTEGER NULL,
      data_hora_saida TIMESTAMPTZ NULL,
      data_hora_conclusao TIMESTAMPTZ NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'ALOCADA'
    );

    INSERT INTO usuarios (id, nome, email, senha, tipo_usuario, perfil)
    VALUES
      (1, 'Gestor Frota', 'gestor.frota@exemplo.invalid', 'hash', 'GESTOR_FROTA', 'GESTOR_FROTA'),
      (2, 'Gestor SVO', 'gestor.svo@exemplo.invalid', 'hash', 'GESTOR_SVO', 'GESTOR_SVO'),
      (3, 'Motorista Frota', 'mot.frota@exemplo.invalid', 'hash', 'MOTORISTA', 'MOTORISTA_FROTA'),
      (4, 'Motorista SVO', 'mot.svo@exemplo.invalid', 'hash', 'MOTORISTA', 'MOTORISTA_SVO');
    SELECT setval(pg_get_serial_sequence('usuarios', 'id'), 4, true);

    INSERT INTO veiculos (id, placa, modelo, tipo_frota, capacidade_maxima)
    VALUES
      (1, 'ADM0001', 'Sedan Adm', 'ADMINISTRATIVA', 5),
      (2, 'SVO0002', 'Furgao SVO', 'SVO', 4);
    SELECT setval(pg_get_serial_sequence('veiculos', 'id'), 2, true);

    INSERT INTO motoristas (id, usuario_id, numero_cnh, categoria_cnh, validade_cnh, tipo_motorista)
    VALUES
      (1, 3, '11111111111', 'B', '2099-12-31', 'FROTA'),
      (2, 4, '22222222222', 'D', '2099-12-31', 'SVO');
    SELECT setval(pg_get_serial_sequence('motoristas', 'id'), 2, true);

    INSERT INTO auditorias (id, usuario_id, acao, modulo)
    VALUES
      (1, 3, 'INICIOU_VIAGEM_FROTA id=1', 'VIAGENS'),
      (2, 2, 'TRANSICAO_AUTORIZADA_SEM_FOTO ordem_svo=1', 'VIAGENS');
    SELECT setval(pg_get_serial_sequence('auditorias', 'id'), 2, true);

    -- Viagem administrativa id=1 e Ordens SVO id=1 e id=2 (IDs coincidentes com viagens_frota)
    INSERT INTO viagens_frota (id, veiculo_id, motorista_id, km_inicial, status)
    VALUES (1, 1, 1, 1000, 'EM_ANDAMENTO');
    SELECT setval(pg_get_serial_sequence('viagens_frota', 'id'), 1, true);

    INSERT INTO ordens_svo (id, veiculo_id, motorista_id, capacidade_utilizada, status)
    VALUES
      (1, 2, 2, 1, 'EM_DESLOCAMENTO'),
      (2, 2, 2, 1, 'EM_DESLOCAMENTO');
    SELECT setval(pg_get_serial_sequence('ordens_svo', 'id'), 2, true);
  `);
}

async function executarValidacaoCompletaScrum210() {
  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });
  const db = knex(configMigration);
  const relatorio = [];

  try {
    // 1. Rejeicao de estrutura preexistente incompativel no UP
    const schemaIncomp = `val210_inc_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsoladaScrum210(trx, schemaIncomp);
        await trx.raw(`
          CREATE TABLE deslocamentos_svo (
            id SERIAL PRIMARY KEY,
            veiculo_id TEXT NOT NULL
          )
        `);

        let bloqueouIncompativel = false;
        try {
          await migrationScrum210.up(trx);
        } catch (e) {
          bloqueouIncompativel = /Estrutura incompativel em deslocamentos_svo/i.test(e.message);
        }
        if (!bloqueouIncompativel) {
          throw new Error(
            'Migration up deveria ter rejeitado tabela deslocamentos_svo preexistente incompativel.'
          );
        }
        throw new Error('ROLLBACK_ISOLADO');
      })
      .catch((e) => {
        if (e.message !== 'ROLLBACK_ISOLADO') throw e;
      });
    relatorio.push('1. Bloqueio de estrutura preexistente incompativel no up: OK');

    // 2. Ciclo completo: UP -> IDs coincidentes e deslocamento SVO compartilhado -> Constraints -> Retencao 12m -> EXPLAIN -> Rollback
    const schemaCiclo = `val210_ciclo_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsoladaScrum210(trx, schemaCiclo);
        await migrationScrum210.up(trx);
        relatorio.push('2. Aplicacao limpa da migration SCRUM-210 (up) e validacao de catalogo: OK');

        // 2.1 Cria deslocamento fisico compartilhado SVO (id=1) englobando ordens_svo id=1 e id=2
        const [deslocamento] = await trx('deslocamentos_svo')
          .insert({
            veiculo_id: 2,
            motorista_id: 2,
            iniciado_por: 4,
            km_inicial: 5000,
            data_hora_saida: new Date('2025-01-10T08:00:00Z'),
            status: 'EM_CURSO',
          })
          .returning('*');

        // Bloqueia segundo deslocamento EM_CURSO simultaneo para o mesmo veiculo
        const bloqueouDeslocamentoSimultaneo = await esperarErroSql(trx, '23505', () =>
          trx('deslocamentos_svo').insert({
            veiculo_id: 2,
            motorista_id: 2,
            iniciado_por: 4,
            km_inicial: 5010,
            status: 'EM_CURSO',
          })
        );
        if (!bloqueouDeslocamentoSimultaneo) {
          throw new Error('Deveria bloquear dois deslocamentos SVO EM_CURSO para o mesmo veiculo.');
        }

        await trx('deslocamentos_svo_ordens').insert([
          { deslocamento_svo_id: deslocamento.id, ordem_svo_id: 1, vinculado_por: 4 },
          { deslocamento_svo_id: deslocamento.id, ordem_svo_id: 2, vinculado_por: 4 },
        ]);

        // Bloqueia vincular a mesma ordem_svo a outro deslocamento
        const bloqueouOrdemDuplicada = await esperarErroSql(trx, '23505', () =>
          trx('deslocamentos_svo_ordens').insert({
            deslocamento_svo_id: deslocamento.id,
            ordem_svo_id: 1,
            vinculado_por: 4,
          })
        );
        if (!bloqueouOrdemDuplicada) {
          throw new Error('Deveria bloquear vinculo duplicado da mesma ordem_svo.');
        }

        // 2.2 Registra foto SAIDA para viagem_frota id=1 e foto SAIDA compartilhada para deslocamento_svo id=1
        const hashSaidaAdm = 'a'.repeat(64);
        const hashSaidaSvo = 'b'.repeat(64);

        const [evAdmSaida] = await trx('evidencias_odometro')
          .insert({
            tipo_operacao: 'ADMINISTRATIVA',
            fase: 'SAIDA',
            viagem_frota_id: 1,
            veiculo_id: 1,
            motorista_id: 1,
            motorista_usuario_id: 3,
            km_registrado: 1000,
            modalidade: 'FOTO',
            status: 'ATIVA',
            storage_key: 'odometro/adm/2025/01/viagem-1-saida.jpg',
            mime_type: 'image/jpeg',
            tamanho_bytes: 245000,
            sha256: hashSaidaAdm,
            registrado_por: 3,
            auditoria_id: 1,
          })
          .returning('*');

        const [evSvoSaida] = await trx('evidencias_odometro')
          .insert({
            tipo_operacao: 'SVO',
            fase: 'SAIDA',
            deslocamento_svo_id: deslocamento.id,
            veiculo_id: 2,
            motorista_id: 2,
            motorista_usuario_id: 4,
            km_registrado: 5000,
            modalidade: 'FOTO',
            status: 'ATIVA',
            storage_key: 'odometro/svo/2025/01/deslocamento-1-saida.webp',
            mime_type: 'image/webp',
            tamanho_bytes: 180000,
            sha256: hashSaidaSvo,
            registrado_por: 4,
          })
          .returning('*');

        if (evAdmSaida.viagem_frota_id !== 1 || evSvoSaida.deslocamento_svo_id !== 1) {
          throw new Error('Falha na distincao entre viagem administrativa id=1 e deslocamento SVO id=1.');
        }

        // Verifica que ambas as ordens SVO (1 e 2) compartilham a mesma evidencia de SAIDA sem duplicar blob
        const evidenciasCompartilhadas = await trx('deslocamentos_svo_ordens as dso')
          .join('evidencias_odometro as eo', 'eo.deslocamento_svo_id', 'dso.deslocamento_svo_id')
          .whereIn('dso.ordem_svo_id', [1, 2])
          .andWhere({ 'eo.fase': 'SAIDA', 'eo.status': 'ATIVA' })
          .select('dso.ordem_svo_id', 'eo.id as evidencia_id', 'eo.storage_key');
        if (
          evidenciasCompartilhadas.length !== 2 ||
          evidenciasCompartilhadas[0].evidencia_id !== evidenciasCompartilhadas[1].evidencia_id
        ) {
          throw new Error(
            'Ordens SVO do mesmo deslocamento fisico deveriam compartilhar a mesma evidencia sem duplicar arquivo.'
          );
        }
        relatorio.push(
          '3. Distincao entre viagens_frota(id=1) e deslocamentos_svo(id=1) e compartilhamento entre ordens SVO: OK'
        );

        // 2.3 Testa bloqueios de duplicidade de fase ativa, reutilizacao de storage_key, base64/traversal e excecao forjada
        const bloqueouDuplicadaFaseAdm = await esperarErroSql(trx, '23505', () =>
          trx('evidencias_odometro').insert({
            tipo_operacao: 'ADMINISTRATIVA',
            fase: 'SAIDA',
            viagem_frota_id: 1,
            veiculo_id: 1,
            motorista_id: 1,
            motorista_usuario_id: 3,
            km_registrado: 1000,
            modalidade: 'FOTO',
            status: 'ATIVA',
            storage_key: 'odometro/adm/2025/01/viagem-1-saida-dup.jpg',
            mime_type: 'image/jpeg',
            tamanho_bytes: 200000,
            sha256: 'c'.repeat(64),
            registrado_por: 3,
          })
        );

        const bloqueouStorageKeyReutilizada = await esperarErroSql(trx, '23505', () =>
          trx('evidencias_odometro').insert({
            tipo_operacao: 'ADMINISTRATIVA',
            fase: 'CHEGADA',
            viagem_frota_id: 1,
            veiculo_id: 1,
            motorista_id: 1,
            motorista_usuario_id: 3,
            km_registrado: 1050,
            modalidade: 'FOTO',
            status: 'ATIVA',
            storage_key: 'odometro/adm/2025/01/viagem-1-saida.jpg',
            mime_type: 'image/jpeg',
            tamanho_bytes: 245000,
            sha256: hashSaidaAdm,
            registrado_por: 3,
          })
        );

        const bloqueouPathTraversal = await esperarErroSql(trx, '23514', () =>
          trx('evidencias_odometro').insert({
            tipo_operacao: 'ADMINISTRATIVA',
            fase: 'CHEGADA',
            viagem_frota_id: 1,
            veiculo_id: 1,
            motorista_id: 1,
            motorista_usuario_id: 3,
            km_registrado: 1050,
            modalidade: 'FOTO',
            status: 'ATIVA',
            storage_key: 'odometro/../../etc/passwd',
            mime_type: 'image/jpeg',
            tamanho_bytes: 1000,
            sha256: 'd'.repeat(64),
            registrado_por: 3,
          })
        );

        const bloqueouBase64 = await esperarErroSql(trx, '23514', () =>
          trx('evidencias_odometro').insert({
            tipo_operacao: 'ADMINISTRATIVA',
            fase: 'CHEGADA',
            viagem_frota_id: 1,
            veiculo_id: 1,
            motorista_id: 1,
            motorista_usuario_id: 3,
            km_registrado: 1050,
            modalidade: 'FOTO',
            status: 'ATIVA',
            storage_key: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
            mime_type: 'image/jpeg',
            tamanho_bytes: 1000,
            sha256: 'e'.repeat(64),
            registrado_por: 3,
          })
        );

        // Excecao forjada pelo proprio motorista (excecao_aprovada_por = motorista_usuario_id = 4)
        const bloqueouExcecaoProprioMotorista = await esperarErroSql(trx, '23514', () =>
          trx('evidencias_odometro').insert({
            tipo_operacao: 'SVO',
            fase: 'CHEGADA',
            deslocamento_svo_id: deslocamento.id,
            veiculo_id: 2,
            motorista_id: 2,
            motorista_usuario_id: 4,
            km_registrado: 5040,
            modalidade: 'EXCECAO_GESTOR',
            status: 'ATIVA',
            excecao_aprovada_por: 4,
            excecao_aprovada_em: new Date('2025-01-10T09:00:00Z'),
            excecao_justificativa: 'Sem sinal de rede movel no retorno a unidade SVO.',
            registrado_por: 4,
          })
        );

        // Excecao valida aprovada pelo gestor SVO (usuario 2 != motorista 4)
        await trx('evidencias_odometro').insert({
          tipo_operacao: 'SVO',
          fase: 'CHEGADA',
          deslocamento_svo_id: deslocamento.id,
          veiculo_id: 2,
          motorista_id: 2,
          motorista_usuario_id: 4,
          km_registrado: 5040,
          modalidade: 'EXCECAO_GESTOR',
          status: 'ATIVA',
          excecao_aprovada_por: 2,
          excecao_aprovada_em: new Date('2025-01-10T09:00:00Z'),
          excecao_justificativa: 'Camera do dispositivo avariada; chegada conferida presencialmente pelo gestor.',
          registrado_por: 2,
          auditoria_id: 2,
        });

        if (
          !bloqueouDuplicadaFaseAdm ||
          !bloqueouStorageKeyReutilizada ||
          !bloqueouPathTraversal ||
          !bloqueouBase64 ||
          !bloqueouExcecaoProprioMotorista
        ) {
          throw new Error(
            'Falha nas constraints de unicidade, seguranca de storage_key ou aprovacao de excecao por gestor distinto.'
          );
        }
        relatorio.push(
          '4. Constraints de unicidade por (operacao, fase), anti-traversal/base64 e excecao aprovada por gestor distinto: OK'
        );

        // 2.4 Testa retencao de 12 meses a partir da conclusao efetiva, preservacao legal e expurgo rastreavel
        const conclusaoReal = new Date('2025-01-10T09:00:00Z');
        const retencao11Meses = new Date('2025-12-10T09:00:00Z');
        const retencao12Meses = new Date('2026-01-10T09:00:00Z');

        const bloqueouRetencaoMenor12Meses = await esperarErroSql(trx, '23514', () =>
          trx('evidencias_odometro')
            .where({ id: evSvoSaida.id })
            .update({
              conclusao_operacao_em: conclusaoReal,
              retencao_ate: retencao11Meses,
            })
        );

        await trx('evidencias_odometro')
          .where({ id: evSvoSaida.id })
          .update({
            conclusao_operacao_em: conclusaoReal,
            retencao_ate: retencao12Meses,
            preservacao_legal: true,
            preservacao_motivo: 'Solicitacao formal de auditoria interna',
          });

        // Bloqueia expurgo enquanto preservacao_legal = true
        const bloqueouExpurgoComPreservacaoLegal = await esperarErroSql(trx, '23514', () =>
          trx('evidencias_odometro')
            .where({ id: evSvoSaida.id })
            .update({
              status: 'EXPURGADA_RETENCAO',
              storage_key: null,
              expurgado_em: new Date('2026-02-01T00:00:00Z'),
              expurgo_motivo: 'EXPURGO_RETENCAO_12_MESES',
            })
        );

        // Libera preservacao legal e testa bloqueio antes de vencer os 12 meses
        await trx('evidencias_odometro')
          .where({ id: evSvoSaida.id })
          .update({ preservacao_legal: false, preservacao_motivo: null });

        const bloqueouExpurgoAntesDoPrazo = await esperarErroSql(trx, '23514', () =>
          trx('evidencias_odometro')
            .where({ id: evSvoSaida.id })
            .update({
              status: 'EXPURGADA_RETENCAO',
              storage_key: null,
              expurgado_em: new Date('2025-06-01T00:00:00Z'),
              expurgo_motivo: 'EXPURGO_RETENCAO_12_MESES',
            })
        );

        // Expurgo valido apos 12 meses da conclusao real (preservando metadados, hash e ordens SVO)
        await trx('evidencias_odometro')
          .where({ id: evSvoSaida.id })
          .update({
            status: 'EXPURGADA_RETENCAO',
            storage_key: null,
            expurgado_em: new Date('2026-01-11T00:00:00Z'),
            expurgado_por: 2,
            expurgo_motivo: 'EXPURGO_POLITICA_RETENCAO_12_MESES',
          });

        const aposExpurgo = await trx('evidencias_odometro').where({ id: evSvoSaida.id }).first();
        if (
          !bloqueouRetencaoMenor12Meses ||
          !bloqueouExpurgoComPreservacaoLegal ||
          !bloqueouExpurgoAntesDoPrazo ||
          aposExpurgo.status !== 'EXPURGADA_RETENCAO' ||
          aposExpurgo.sha256 !== hashSaidaSvo
        ) {
          throw new Error('Falha nas regras de retencao de 12 meses, preservacao legal ou expurgo rastreavel.');
        }
        relatorio.push(
          '5. Retencao de 12 meses apos conclusao real, bloqueio por preservacao legal e expurgo mantendo metadados: OK'
        );

        // 2.5 Planos EXPLAIN
        await trx.raw('SET LOCAL enable_seqscan = off');
        const explainAdm = await trx.raw(
          `EXPLAIN (FORMAT JSON)
           SELECT id, storage_key, sha256
           FROM evidencias_odometro
           WHERE tipo_operacao = 'ADMINISTRATIVA'
             AND viagem_frota_id = 1
             AND fase = 'SAIDA'
             AND status IN ('ATIVA', 'EXPURGADA_RETENCAO')`
        );
        const idxAdm = explainAdm.rows[0]['QUERY PLAN'][0].Plan['Index Name'];
        if (idxAdm !== 'uq_evidencias_odometro_viagem_frota_fase_ativa') {
          throw new Error(
            `Indice esperado uq_evidencias_odometro_viagem_frota_fase_ativa, obtido: ${idxAdm}`
          );
        }
        relatorio.push(
          '6. Plano de execucao EXPLAIN (uq_evidencias_odometro_viagem_frota_fase_ativa): OK'
        );

        // 2.6 Protecao contra rollback destrutivo (evidencias -> vinculos de ordens -> deslocamentos)
        let bloqueouDownEvidencias = false;
        try {
          await migrationScrum210.down(trx);
        } catch (e) {
          bloqueouDownEvidencias = /existem registros em evidencias_odometro/i.test(e.message);
        }
        await trx('evidencias_odometro').del();

        let bloqueouDownVinculos = false;
        try {
          await migrationScrum210.down(trx);
        } catch (e) {
          bloqueouDownVinculos = /existem vinculos registrados em deslocamentos_svo_ordens/i.test(
            e.message
          );
        }
        await trx('deslocamentos_svo_ordens').del();

        let bloqueouDownDeslocamentos = false;
        try {
          await migrationScrum210.down(trx);
        } catch (e) {
          bloqueouDownDeslocamentos = /existem deslocamentos registrados em deslocamentos_svo/i.test(
            e.message
          );
        }
        await trx('deslocamentos_svo').del();

        if (!bloqueouDownEvidencias || !bloqueouDownVinculos || !bloqueouDownDeslocamentos) {
          throw new Error('Falha na protecao contra rollback destrutivo da SCRUM-210.');
        }
        relatorio.push(
          '7. Protecao contra rollback destrutivo (evidencias_odometro, deslocamentos_svo_ordens e deslocamentos_svo): OK'
        );

        // 2.7 Rollback limpo (down) e reaplicacao (up)
        await migrationScrum210.down(trx);
        const { rows: restantes } = await trx.raw(
          `SELECT table_name
           FROM information_schema.tables
           WHERE table_schema = ?
             AND table_name IN ('deslocamentos_svo', 'deslocamentos_svo_ordens', 'evidencias_odometro')`,
          [schemaCiclo]
        );
        if (restantes.length !== 0) {
          throw new Error('Tabelas da SCRUM-210 deveriam ter sido removidas apos down limpo.');
        }

        await migrationScrum210.up(trx);
        relatorio.push(
          '8. Ciclo completo de rollback limpo (down estrito) e reaplicacao (up) preservando viagens e ordens: OK'
        );

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
        `9. Validacao de minimo privilegio da role da aplicacao (rolsuper=${estadoRole.rolsuper}, rolinherit=${estadoRole.rolinherit}, podeDeletarEvidenciasOdometro=${estadoRole.podeDeletarEvidenciasOdometro}): OK`
      );
    }

    console.log('Validacao da migration SCRUM-210 concluida com sucesso:');
    for (const linha of relatorio) {
      console.log(`  - ${linha}`);
    }
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  executarValidacaoCompletaScrum210().catch((erro) => {
    console.error('Falha na validacao da migration SCRUM-210:', erro.message);
    process.exit(1);
  });
}

module.exports = { executarValidacaoCompletaScrum210 };
