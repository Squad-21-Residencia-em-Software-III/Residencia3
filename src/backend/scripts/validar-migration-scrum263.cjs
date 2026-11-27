const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const knex = require('knex');
const knexConfig = require('../knexfile');
const migrationScrum263 = require('../database/migrations/20261127130000_scrum_263_solicitacoes_externas_svo');
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

async function criarBaseIsoladaSvo(trx, schema, { popularLegado = false } = {}) {
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

    CREATE TABLE solicitacoes_svo (
      id SERIAL PRIMARY KEY,
      registrante_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      dados_solicitante TEXT NOT NULL,
      local_ocorrencia VARCHAR(255) NOT NULL,
      material_sensivel BOOLEAN NOT NULL DEFAULT false,
      status VARCHAR(30) NOT NULL DEFAULT 'EM_TRIAGEM',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      observacoes TEXT NULL,
      motivo_recusa TEXT NULL,
      confirmado_por INTEGER NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
      confirmado_em TIMESTAMPTZ NULL,
      CONSTRAINT chk_solicitacoes_svo_status
        CHECK (status IN ('EM_TRIAGEM', 'CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'RECUSADA', 'CANCELADA'))
    );

    CREATE INDEX solicitacoes_svo_registrante_id_index
      ON solicitacoes_svo (registrante_id);

    CREATE INDEX idx_solicitacoes_svo_status_id
      ON solicitacoes_svo (status, id DESC);

    INSERT INTO usuarios (id, nome, email, senha, tipo_usuario, perfil)
    VALUES
      (1, 'Administrador FSPH', 'admin.svo@exemplo.invalid', 'hash', 'ADMINISTRADOR', 'ADMINISTRADOR'),
      (2, 'Gestor SVO Plantao', 'gestor.svo@exemplo.invalid', 'hash', 'GESTOR_SVO', 'GESTOR_SVO'),
      (3, 'Motorista SVO', 'motorista.svo@exemplo.invalid', 'hash', 'MOTORISTA', 'MOTORISTA_SVO');
    SELECT setval(pg_get_serial_sequence('usuarios', 'id'), 3, true);
  `);

  if (popularLegado) {
    await trx.raw(`
      INSERT INTO solicitacoes_svo (
        id,
        registrante_id,
        dados_solicitante,
        local_ocorrencia,
        material_sensivel,
        status,
        observacoes,
        confirmado_por,
        confirmado_em
      )
      VALUES
        (
          10,
          2,
          'Hospital de Urgencia de Sergipe - (79) 3216-0000',
          'Av. Tancredo Neves, 7501 - Capucho, Aracaju/SE',
          false,
          'CONFIRMADA',
          'Chamado interno legado antes da Fase 3',
          2,
          CURRENT_TIMESTAMP
        ),
        (
          11,
          1,
          'UPA Zona Norte - Plantao Social',
          'Rua Acre, 120 - Siqueira Campos, Aracaju/SE',
          false,
          'EM_TRIAGEM',
          NULL,
          NULL,
          NULL
        );
      SELECT setval(pg_get_serial_sequence('solicitacoes_svo', 'id'), 11, true);
    `);
  }
}

async function executarValidacaoCompletaScrum263() {
  const configMigration = knexConfig.criarConfigKnex({
    ...process.env,
    DB_ROLE: 'migration',
  });
  const db = knex(configMigration);
  const relatorio = [];

  try {
    // 1. Bloqueio quando tabelas base (usuarios, solicitacoes_svo) nao existem no schema
    const schemaSemBase = `val263_sem_base_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await trx.raw('CREATE SCHEMA ??', [schemaSemBase]);
        await trx.raw('SET LOCAL search_path TO ??', [schemaSemBase]);

        let bloqueouSemBase = false;
        try {
          await migrationScrum263.up(trx);
        } catch (e) {
          bloqueouSemBase = /tabelas base \(usuarios, solicitacoes_svo\) ausentes/i.test(e.message);
        }
        if (!bloqueouSemBase) {
          throw new Error(
            'Migration up deveria ter bloqueado schema sem tabelas base usuarios e solicitacoes_svo.'
          );
        }
        throw new Error('ROLLBACK_ISOLADO');
      })
      .catch((e) => {
        if (e.message !== 'ROLLBACK_ISOLADO') throw e;
      });

    // 2. Bloqueio de estrutura preexistente incompativel no UP
    const schemaIncomp = `val263_inc_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsoladaSvo(trx, schemaIncomp);
        await trx.raw(`
          CREATE TABLE solicitacoes_svo_dados_externos (
            solicitacao_id INTEGER PRIMARY KEY,
            nome_solicitante TEXT
          )
        `);

        let bloqueouIncompativel = false;
        try {
          await migrationScrum263.up(trx);
        } catch (e) {
          bloqueouIncompativel = /Estrutura incompativel em solicitacoes_svo_dados_externos/i.test(
            e.message
          );
        }
        if (!bloqueouIncompativel) {
          throw new Error(
            'Migration up deveria ter rejeitado tabela solicitacoes_svo_dados_externos preexistente incompativel.'
          );
        }
        throw new Error('ROLLBACK_ISOLADO');
      })
      .catch((e) => {
        if (e.message !== 'ROLLBACK_ISOLADO') throw e;
      });

    relatorio.push(
      '1. Bloqueio de ausencia de tabelas base e estruturas preexistentes incompativeis no up: OK'
    );

    // 3. Teste em banco PostgreSQL vazio (schema isolado sem registros previos) + rollback limpo
    const schemaVazio = `val263_vazio_${Date.now()}`;
    await db
      .transaction(async (trx) => {
        await criarBaseIsoladaSvo(trx, schemaVazio, { popularLegado: false });
        await migrationScrum263.up(trx);
        await migrationScrum263.down(trx);
        await migrationScrum263.up(trx);
        throw new Error('ROLLBACK_ISOLADO');
      })
      .catch((e) => {
        if (e.message !== 'ROLLBACK_ISOLADO') throw e;
      });

    relatorio.push(
      '2. Aplicacao em banco vazio, validacao de catalogo e ciclo completo up -> down -> up: OK'
    );

    // 4. Upgrade em banco populado com chamados legados + testes de constraints, triggers, concorrencia e role real frotas_app
    const schemaCiclo = `val263_ciclo_${Date.now()}`;
    try {
      await db.transaction(async (trx) => {
        await criarBaseIsoladaSvo(trx, schemaCiclo, { popularLegado: true });
        await migrationScrum263.up(trx);
      });

      // 4.1 Verifica backfill dos chamados legados como INTERNA sem inventar protocolo ou dados externos
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);

        const legados = await trx('solicitacoes_svo').orderBy('id', 'asc');
        if (
          legados.length !== 2 ||
          legados[0].canal_origem !== 'INTERNA' ||
          legados[0].protocolo !== null ||
          legados[0].registrante_id !== 2 ||
          legados[1].canal_origem !== 'INTERNA' ||
          legados[1].protocolo !== null ||
          legados[1].registrante_id !== 1
        ) {
          throw new Error(
            `Backfill de chamados internos legados falhou: ${JSON.stringify(legados)}`
          );
        }

        // Consultas antigas (com LEFT JOIN usuarios ur ON ur.id = ss.registrante_id) continuam funcionando
        const { rows: unificadaRows } = await trx.raw(`
          SELECT ss.id, ss.canal_origem, ss.local_ocorrencia, ur.nome AS solicitante_nome
          FROM solicitacoes_svo ss
          LEFT JOIN usuarios ur ON ur.id = ss.registrante_id
          ORDER BY ss.id ASC
        `);
        if (
          unificadaRows.length !== 2 ||
          unificadaRows[0].solicitante_nome !== 'Gestor SVO Plantao'
        ) {
          throw new Error('Consulta legada com LEFT JOIN usuarios falhou apos upgrade.');
        }
      });

      relatorio.push(
        '3. Upgrade em banco populado: backfill de registros legados como INTERNA sem protocolo inventado e compatibilidade com consultas antigas: OK'
      );

      // 4.2 Testa regras de canal_origem, registrante_id, FK para usuarios e protocolo opaco unico em solicitacoes_svo
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);

        // Interno valido (com default canal_origem = 'INTERNA')
        const [internaNova] = await trx('solicitacoes_svo')
          .insert({
            registrante_id: 2,
            dados_solicitante: 'Familiar presencial na recepcao SVO',
            local_ocorrencia: 'Rua Lagarto, 450 - Centro, Aracaju/SE',
            material_sensivel: false,
            status: 'EM_TRIAGEM',
          })
          .returning('*');

        if (internaNova.canal_origem !== 'INTERNA' || internaNova.protocolo !== null) {
          throw new Error('Chamado interno novo deveria receber canal_origem=INTERNA e protocolo=NULL.');
        }

        // Interno sem registrante_id -> rejeitado (23514)
        const bloqueouInternoSemRegistrante = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo').insert({
            registrante_id: null,
            canal_origem: 'INTERNA',
            dados_solicitante: 'Interno invalido sem registrante',
            local_ocorrencia: 'Rua A, 10',
            material_sensivel: false,
            status: 'EM_TRIAGEM',
          })
        );

        // Interno com protocolo preenchido -> rejeitado (23514)
        const bloqueouInternoComProtocolo = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo').insert({
            registrante_id: 2,
            canal_origem: 'INTERNA',
            protocolo: 'SVO-20261127-ABCD1234EF56',
            dados_solicitante: 'Interno com protocolo indevido',
            local_ocorrencia: 'Rua A, 10',
            material_sensivel: false,
            status: 'EM_TRIAGEM',
          })
        );

        // Interno com FK registrante_id inexistente -> rejeitado pela FK preservada (23503)
        const bloqueouFkRegistranteInvalida = await esperarErroSql(trx, '23503', () =>
          trx('solicitacoes_svo').insert({
            registrante_id: 99999,
            canal_origem: 'INTERNA',
            dados_solicitante: 'Registrante inexistente',
            local_ocorrencia: 'Rua A, 10',
            material_sensivel: false,
            status: 'EM_TRIAGEM',
          })
        );

        // Canal invalido -> rejeitado (23514)
        const bloqueouCanalInvalido = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo').insert({
            registrante_id: 2,
            canal_origem: 'PORTAL_PUBLICO',
            dados_solicitante: 'Canal invalido',
            local_ocorrencia: 'Rua A, 10',
            material_sensivel: false,
            status: 'EM_TRIAGEM',
          })
        );

        // Externo com registrante_id preenchido -> rejeitado (23514)
        const bloqueouExternoComRegistrante = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo').insert({
            registrante_id: 2,
            canal_origem: 'EXTERNA',
            protocolo: 'SVO-20261127-ABCD1234EF56',
            dados_solicitante: 'Externo com registrante',
            local_ocorrencia: 'Rua A, 10',
            material_sensivel: false,
            status: 'EM_TRIAGEM',
          })
        );

        // Externo sem protocolo ou com protocolo curto/malformado -> rejeitado (23514)
        const bloqueouExternoSemProtocolo = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo').insert({
            registrante_id: null,
            canal_origem: 'EXTERNA',
            protocolo: null,
            dados_solicitante: 'Externo sem protocolo',
            local_ocorrencia: 'Rua A, 10',
            material_sensivel: false,
            status: 'EM_TRIAGEM',
          })
        );

        const bloqueouProtocoloMalformado = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo').insert({
            registrante_id: null,
            canal_origem: 'EXTERNA',
            protocolo: 'curto 123',
            dados_solicitante: 'Externo protocolo invalido',
            local_ocorrencia: 'Rua A, 10',
            material_sensivel: false,
            status: 'EM_TRIAGEM',
          })
        );

        // Externo valido sem registrante_id e com protocolo opaco unico
        const [externaValida] = await trx('solicitacoes_svo')
          .insert({
            registrante_id: null,
            canal_origem: 'EXTERNA',
            protocolo: 'SVO-20261127-9F8E7D6C5B4A',
            dados_solicitante: 'Solicitacao externa via Portal SVO (protocolo SVO-20261127-9F8E7D6C5B4A)',
            local_ocorrencia: 'Av. Beira Mar, 1500 - 13 de Julho, Aracaju/SE',
            material_sensivel: false,
            status: 'EM_TRIAGEM',
          })
          .returning('*');

        // Protocolo duplicado -> rejeitado (23505)
        const bloqueouProtocoloDuplicado = await esperarErroSql(trx, '23505', () =>
          trx('solicitacoes_svo').insert({
            registrante_id: null,
            canal_origem: 'EXTERNA',
            protocolo: 'SVO-20261127-9F8E7D6C5B4A',
            dados_solicitante: 'Outra solicitacao com mesmo protocolo',
            local_ocorrencia: 'Rua B, 20',
            material_sensivel: false,
            status: 'EM_TRIAGEM',
          })
        );

        // Tentativa de alterar canal_origem ou protocolo apos emissao -> bloqueado por trigger (23514)
        const bloqueouTrocaCanal = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo')
            .where({ id: externaValida.id })
            .update({ canal_origem: 'INTERNA', registrante_id: 2, protocolo: null })
        );

        const bloqueouTrocaProtocolo = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo')
            .where({ id: externaValida.id })
            .update({ protocolo: 'SVO-20261127-111122223333' })
        );

        if (
          !bloqueouInternoSemRegistrante ||
          !bloqueouInternoComProtocolo ||
          !bloqueouFkRegistranteInvalida ||
          !bloqueouCanalInvalido ||
          !bloqueouExternoComRegistrante ||
          !bloqueouExternoSemProtocolo ||
          !bloqueouProtocoloMalformado ||
          !bloqueouProtocoloDuplicado ||
          !bloqueouTrocaCanal ||
          !bloqueouTrocaProtocolo
        ) {
          throw new Error(
            'Falha nas validacoes de canal_origem, registrante_id, FK ou protocolo em solicitacoes_svo.'
          );
        }
      });

      relatorio.push(
        '4. Regras de solicitacoes_svo (INTERNA exige registrante e proibe protocolo; EXTERNA exige registrante NULL e protocolo opaco unico; imutabilidade de canal/protocolo): OK'
      );

      // 4.3 Testa tabelas protegidas solicitacoes_svo_dados_externos e solicitacoes_svo_credenciais_externas
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);

        const solicitacaoExterna = await trx('solicitacoes_svo')
          .where({ protocolo: 'SVO-20261127-9F8E7D6C5B4A' })
          .first();

        // Tentativa de vincular dados externos ou credenciais a uma solicitacao INTERNA -> bloqueada por trigger (23514)
        const bloqueouDadosEmInterna = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo_dados_externos').insert({
            solicitacao_id: 10,
            nome_solicitante: 'Cidadao Sintetico',
            telefone_solicitante: '(79) 99911-2233',
            email_solicitante: 'cidadao.sintetico@exemplo.invalid',
            cpf_solicitante: '12345678909',
            tipo_solicitante: 'PESSOA_FISICA',
            nome_falecido: 'Falecido Sintetico',
            endereco_ocorrencia: 'Av. Beira Mar',
            numero_imovel: '1500',
            sem_numero_imovel: false,
            descricao_ocorrencia: 'Obito domiciliar natural relatado por familiar.',
            data_hora_ocorrencia: new Date('2026-11-27T10:30:00.000Z'),
            ciencia_aviso_privacidade: true,
            versao_aviso_privacidade: 'v1.0-2026',
          })
        );

        const bloqueouCredencialEmInterna = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo_credenciais_externas').insert({
            solicitacao_id: 10,
            segredo_digest: 'a'.repeat(64),
            algoritmo_digest: 'SHA-256',
          })
        );

        // Testa constraints condicionais de solicitacoes_svo_dados_externos:
        // a) INSTITUICAO sem nome_instituicao -> 23514
        const bloqueouInstituicaoSemNome = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo_dados_externos').insert({
            solicitacao_id: solicitacaoExterna.id,
            nome_solicitante: 'Representante Hospitalar',
            telefone_solicitante: '(79) 3210-0000',
            email_solicitante: 'plantao@hospital.invalid',
            cpf_solicitante: '12345678909',
            tipo_solicitante: 'INSTITUICAO',
            nome_instituicao: null,
            nome_falecido: 'Paciente Sintetico',
            endereco_ocorrencia: 'Av. Beira Mar',
            numero_imovel: '1500',
            sem_numero_imovel: false,
            descricao_ocorrencia: 'Ocorrencia institucional sintetica.',
            data_hora_ocorrencia: new Date('2026-11-27T10:30:00.000Z'),
            ciencia_aviso_privacidade: true,
            versao_aviso_privacidade: 'v1.0-2026',
          })
        );

        // b) PESSOA_FISICA com nome_instituicao preenchido -> 23514
        const bloqueouPessoaFisicaComInstituicao = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo_dados_externos').insert({
            solicitacao_id: solicitacaoExterna.id,
            nome_solicitante: 'Cidadao Sintetico',
            telefone_solicitante: '(79) 99911-2233',
            email_solicitante: 'cidadao@exemplo.invalid',
            cpf_solicitante: '12345678909',
            tipo_solicitante: 'PESSOA_FISICA',
            nome_instituicao: 'Hospital Indevido',
            nome_falecido: 'Falecido Sintetico',
            endereco_ocorrencia: 'Av. Beira Mar',
            numero_imovel: '1500',
            sem_numero_imovel: false,
            descricao_ocorrencia: 'Ocorrencia sintetica.',
            data_hora_ocorrencia: new Date('2026-11-27T10:30:00.000Z'),
            ciencia_aviso_privacidade: true,
            versao_aviso_privacidade: 'v1.0-2026',
          })
        );

        // c) sem_numero_imovel=false sem numero_imovel -> 23514
        const bloqueouSemNumeroFalsoVazio = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo_dados_externos').insert({
            solicitacao_id: solicitacaoExterna.id,
            nome_solicitante: 'Cidadao Sintetico',
            telefone_solicitante: '(79) 99911-2233',
            email_solicitante: 'cidadao@exemplo.invalid',
            cpf_solicitante: '12345678909',
            tipo_solicitante: 'PESSOA_FISICA',
            nome_falecido: 'Falecido Sintetico',
            endereco_ocorrencia: 'Av. Beira Mar',
            numero_imovel: null,
            sem_numero_imovel: false,
            descricao_ocorrencia: 'Ocorrencia sintetica.',
            data_hora_ocorrencia: new Date('2026-11-27T10:30:00.000Z'),
            ciencia_aviso_privacidade: true,
            versao_aviso_privacidade: 'v1.0-2026',
          })
        );

        // d) Coordenadas despareadas (apenas latitude sem longitude) ou fora de faixa -> 23514
        const bloqueouCoordenadaDespareada = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo_dados_externos').insert({
            solicitacao_id: solicitacaoExterna.id,
            nome_solicitante: 'Cidadao Sintetico',
            telefone_solicitante: '(79) 99911-2233',
            email_solicitante: 'cidadao@exemplo.invalid',
            cpf_solicitante: '12345678909',
            tipo_solicitante: 'PESSOA_FISICA',
            nome_falecido: 'Falecido Sintetico',
            endereco_ocorrencia: 'Av. Beira Mar',
            numero_imovel: '1500',
            sem_numero_imovel: false,
            latitude_ocorrencia: -10.9472,
            longitude_ocorrencia: null,
            descricao_ocorrencia: 'Ocorrencia sintetica.',
            data_hora_ocorrencia: new Date('2026-11-27T10:30:00.000Z'),
            ciencia_aviso_privacidade: true,
            versao_aviso_privacidade: 'v1.0-2026',
          })
        );

        // e) CPF com digitos repetidos ou formato invalido -> 23514
        const bloqueouCpfRepetido = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo_dados_externos').insert({
            solicitacao_id: solicitacaoExterna.id,
            nome_solicitante: 'Cidadao Sintetico',
            telefone_solicitante: '(79) 99911-2233',
            email_solicitante: 'cidadao@exemplo.invalid',
            cpf_solicitante: '11111111111',
            tipo_solicitante: 'PESSOA_FISICA',
            nome_falecido: 'Falecido Sintetico',
            endereco_ocorrencia: 'Av. Beira Mar',
            numero_imovel: '1500',
            sem_numero_imovel: false,
            descricao_ocorrencia: 'Ocorrencia sintetica.',
            data_hora_ocorrencia: new Date('2026-11-27T10:30:00.000Z'),
            ciencia_aviso_privacidade: true,
            versao_aviso_privacidade: 'v1.0-2026',
          })
        );

        // f) ciencia_aviso_privacidade = false -> 23514
        const bloqueouSemCienciaPrivacidade = await esperarErroSql(trx, '23514', () =>
          trx('solicitacoes_svo_dados_externos').insert({
            solicitacao_id: solicitacaoExterna.id,
            nome_solicitante: 'Cidadao Sintetico',
            telefone_solicitante: '(79) 99911-2233',
            email_solicitante: 'cidadao@exemplo.invalid',
            cpf_solicitante: '12345678909',
            tipo_solicitante: 'PESSOA_FISICA',
            nome_falecido: 'Falecido Sintetico',
            endereco_ocorrencia: 'Av. Beira Mar',
            numero_imovel: '1500',
            sem_numero_imovel: false,
            descricao_ocorrencia: 'Ocorrencia sintetica.',
            data_hora_ocorrencia: new Date('2026-11-27T10:30:00.000Z'),
            ciencia_aviso_privacidade: false,
            versao_aviso_privacidade: 'v1.0-2026',
          })
        );

        // g) Insercao valida de dados externos e credencial protegida
        await trx('solicitacoes_svo_dados_externos').insert({
          solicitacao_id: solicitacaoExterna.id,
          nome_solicitante: 'Hospital Sao Lucas Sintetico',
          telefone_solicitante: '(79) 3211-9988',
          email_solicitante: 'nir.sintetico@hospitalsaolucas.invalid',
          cpf_solicitante: '52998224725',
          tipo_solicitante: 'INSTITUICAO',
          nome_instituicao: 'Hospital Sao Lucas Sintetico - Unidade Aracaju',
          nome_falecido: 'Joao da Silva Sintetico',
          documento_falecido: 'RG 1234567 SSP/SE',
          endereco_ocorrencia: 'Av. Beira Mar, Bairro 13 de Julho, Aracaju/SE',
          numero_imovel: '1500',
          sem_numero_imovel: false,
          complemento_ocorrencia: 'Ala B, Enfermaria 3',
          ponto_referencia: 'Proximo ao Parque Augusto Franco',
          latitude_ocorrencia: -10.947246,
          longitude_ocorrencia: -37.073082,
          fora_area_cobertura: false,
          descricao_ocorrencia: 'Paciente em acompanhamento clinico evoluiu a obito sem sinais de violencia.',
          data_hora_ocorrencia: new Date('2026-11-27T09:15:00.000Z'),
          informacoes_medicas: 'Hipertensao arterial sistemica e diabetes mellitus tipo 2.',
          ciencia_aviso_privacidade: true,
          versao_aviso_privacidade: 'v1.0-2026-11',
        });

        await trx('solicitacoes_svo_credenciais_externas').insert({
          solicitacao_id: solicitacaoExterna.id,
          segredo_digest: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          algoritmo_digest: 'SHA-256',
          chave_idempotencia_criacao: 'idem-svo-ext-20261127-0001',
          payload_criacao_digest: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
          prova_tentativa_digest: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        });

        if (
          !bloqueouDadosEmInterna ||
          !bloqueouCredencialEmInterna ||
          !bloqueouInstituicaoSemNome ||
          !bloqueouPessoaFisicaComInstituicao ||
          !bloqueouSemNumeroFalsoVazio ||
          !bloqueouCoordenadaDespareada ||
          !bloqueouCpfRepetido ||
          !bloqueouSemCienciaPrivacidade
        ) {
          throw new Error(
            'Falha nas validacoes condicionais de solicitacoes_svo_dados_externos ou credenciais_externas.'
          );
        }
      });

      relatorio.push(
        '5. Constraints condicionais e triggers de solicitacoes_svo_dados_externos e solicitacoes_svo_credenciais_externas: OK'
      );

      // 4.4 Concorrencia real: duas transacoes simultaneas disputando o mesmo protocolo opaco
      let prontas = 0;
      let liberarBarreira;
      const barreira = new Promise((resolve) => {
        liberarBarreira = resolve;
      });

      const tentativaProtocoloConcorrente = async (indice) => {
        return db.transaction(async (trx) => {
          await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);
          prontas += 1;
          if (prontas === 2) {
            liberarBarreira();
          } else {
            await barreira;
          }

          await trx('solicitacoes_svo').insert({
            registrante_id: null,
            canal_origem: 'EXTERNA',
            protocolo: 'SVO-20261127-CONCORRENTE01',
            dados_solicitante: `Tentativa concorrente ${indice}`,
            local_ocorrencia: 'Rua Concorrencia, 100 - Aracaju/SE',
            material_sensivel: false,
            status: 'EM_TRIAGEM',
          });
          return 'INSERIDA';
        });
      };

      const resultadosConcorrentes = await Promise.allSettled([
        tentativaProtocoloConcorrente(1),
        tentativaProtocoloConcorrente(2),
      ]);

      const sucessos = resultadosConcorrentes.filter((r) => r.status === 'fulfilled');
      const falhasUnicidade = resultadosConcorrentes.filter(
        (r) => r.status === 'rejected' && r.reason && r.reason.code === '23505'
      );

      if (sucessos.length !== 1 || falhasUnicidade.length !== 1) {
        throw new Error(
          `Falha no teste de concorrencia real de protocolo: sucessos=${sucessos.length}, falhas23505=${falhasUnicidade.length}`
        );
      }

      relatorio.push(
        '6. Concorrencia real (duas transacoes simultaneas disputando o mesmo protocolo opaco): OK'
      );

      // 4.5 Bloqueio de rollback (down) quando existem dados externos / solicitacoes EXTERNA
      await db.transaction(async (trx) => {
        await trx.raw('SET LOCAL search_path TO ??', [schemaCiclo]);
        let bloqueouDownComDados = false;
        try {
          await migrationScrum263.down(trx);
        } catch (e) {
          bloqueouDownComDados = /Rollback bloqueado/i.test(e.message);
        }
        if (!bloqueouDownComDados) {
          throw new Error('Migration down deveria bloquear reversao quando ha dados externos.');
        }
      });

      relatorio.push(
        '7. Protecao de rollback (down bloqueado quando ha dados externos ou solicitacoes EXTERNA): OK'
      );

      // 4.6 Teste real com a role da aplicacao (frotas_app):
      //     - pode fazer SELECT e INSERT
      //     - pode atualizar contato/local/cancelamento permitido
      //     - NAO pode fazer DELETE nem alterar CPF/nome_falecido/segredo_digest
      const appUser = process.env.POSTGRES_APP_USER;
      const appPassword = process.env.POSTGRES_APP_PASSWORD;

      if (appUser && appPassword) {
        await db.raw('GRANT USAGE ON SCHEMA ?? TO ??', [schemaCiclo, appUser]);
        await db.raw(
          'GRANT SELECT, INSERT, UPDATE ON TABLE ??.usuarios, ??.solicitacoes_svo TO ??',
          [schemaCiclo, schemaCiclo, appUser]
        );
        await db.raw(
          'GRANT USAGE, SELECT ON SEQUENCE ??.usuarios_id_seq, ??.solicitacoes_svo_id_seq TO ??',
          [schemaCiclo, schemaCiclo, appUser]
        );

        const configApp = knexConfig.criarConfigKnex({
          ...process.env,
          DB_ROLE: 'app',
        });
        const dbApp = knex(configApp);

        try {
          await dbApp.transaction(async (trxApp) => {
            await trxApp.raw('SET LOCAL search_path TO ??', [schemaCiclo]);

            const solicitacaoExt = await trxApp('solicitacoes_svo')
              .where({ protocolo: 'SVO-20261127-9F8E7D6C5B4A' })
              .first();

            // UPDATE permitido em telefone_solicitante e versao_dados
            await trxApp('solicitacoes_svo_dados_externos')
              .where({ solicitacao_id: solicitacaoExt.id })
              .update({
                telefone_solicitante: '(79) 98877-6655',
                versao_dados: 2,
                atualizado_em: trxApp.fn.now(),
              });

            // UPDATE proibido em cpf_solicitante -> 42501 (insufficient_privilege)
            const bloqueouUpdateCpf = await esperarErroSql(trxApp, '42501', () =>
              trxApp('solicitacoes_svo_dados_externos')
                .where({ solicitacao_id: solicitacaoExt.id })
                .update({ cpf_solicitante: '12345678909' })
            );

            // UPDATE proibido em segredo_digest -> 42501 (insufficient_privilege)
            const bloqueouUpdateSegredo = await esperarErroSql(trxApp, '42501', () =>
              trxApp('solicitacoes_svo_credenciais_externas')
                .where({ solicitacao_id: solicitacaoExt.id })
                .update({ segredo_digest: 'b'.repeat(64) })
            );

            // DELETE proibido em solicitacoes_svo_dados_externos -> 42501
            const bloqueouDeleteDados = await esperarErroSql(trxApp, '42501', () =>
              trxApp('solicitacoes_svo_dados_externos')
                .where({ solicitacao_id: solicitacaoExt.id })
                .del()
            );

            // DELETE proibido em solicitacoes_svo_credenciais_externas -> 42501
            const bloqueouDeleteCredencial = await esperarErroSql(trxApp, '42501', () =>
              trxApp('solicitacoes_svo_credenciais_externas')
                .where({ solicitacao_id: solicitacaoExt.id })
                .del()
            );

            if (
              !bloqueouUpdateCpf ||
              !bloqueouUpdateSegredo ||
              !bloqueouDeleteDados ||
              !bloqueouDeleteCredencial
            ) {
              throw new Error(
                `Role ${appUser} nao deveria ter permissao para alterar CPF/segredo_digest nem executar DELETE nas tabelas protegidas.`
              );
            }
          });
        } finally {
          await dbApp.destroy();
        }

        const estadoRole = await inspecionarEstadoRole(db, appUser);
        validarEstadoMinimoPrivilegio(estadoRole);

        relatorio.push(
          `8. Validacao real da role ${appUser} (SELECT/INSERT e UPDATE granular permitidos; UPDATE em CPF/segredo_digest e DELETE bloqueados com 42501): OK`
        );
      }
    } finally {
      await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schemaCiclo]);
    }

    console.log('=== VALIDACAO COMPLETA SCRUM-263 CONCLUIDA COM SUCESSO ===');
    for (const item of relatorio) {
      console.log(`- ${item}`);
    }
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  executarValidacaoCompletaScrum263().catch((erro) => {
    console.error('Falha na validacao da migration SCRUM-263:', erro);
    process.exit(1);
  });
}

module.exports = { executarValidacaoCompletaScrum263 };
