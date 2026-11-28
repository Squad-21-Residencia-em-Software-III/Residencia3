const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const knex = require('knex');
const { criarConfigKnex } = require('../knexfile');
const { DADOS, CREDENCIAIS } = require('../database/privilegiosSolicitacoesExternasSvo.cjs');

const ORIGINAL = '20261127130000_scrum_263_solicitacoes_externas_svo.js';
const CORRECAO = '20261127140000_scrum_263_integridade_svo_externo.js';
const SVO = 'solicitacoes_svo';
const BASE = ['usuarios', SVO, 'ordens_svo', 'veiculos', 'motoristas', 'equipes_svo', 'notificacoes'];
const externalRoot = {
  canal_origem: 'EXTERNA', registrante_id: null, status: 'EM_TRIAGEM',
  local_ocorrencia: 'Rua Sintética, 42', dados_solicitante: 'Solicitação externa',
};
const externalDetails = {
  nome_solicitante: 'Pessoa Sintética', telefone_solicitante: '7900000000',
  email_solicitante: 'sintetico@example.invalid', cpf_solicitante: '01234567890',
  tipo_solicitante: 'PESSOA_FISICA', nome_falecido: 'Nome Sintético',
  numero_imovel: '42', descricao_ocorrencia: 'Ocorrência de teste automatizado',
  data_hora_ocorrencia: '2026-11-27T11:00:00Z', ciencia_aviso_privacidade: true,
  versao_aviso_privacidade: 'v1-teste',
};
const externalCredentials = {
  segredo_digest: 'a'.repeat(64), payload_criacao_digest: 'b'.repeat(64),
};

function executarNpm(env, script) {
  const saida = execFileSync(process.execPath, [process.env.npm_execpath, 'run', script], {
    cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8',
  });
  for (const linha of saida.split(/\r?\n/)) {
    if (/migrate:|Migration file| Batch |^Batch/.test(linha)) console.log(linha);
  }
}

async function comBanco(admin, env, rotulo, validar) {
  const nome = `svo_externo_${rotulo}_${randomBytes(6).toString('hex')}`;
  await admin.raw('CREATE DATABASE ??', [nome]);
  const contexto = { ...env, POSTGRES_DB: nome, DB_ROLE: 'migration' };
  const db = knex(criarConfigKnex(contexto));
  try {
    console.log(`solicitacoes externas svo / ${rotulo}`);
    await validar(db, contexto);
  } finally {
    await db.destroy();
    await admin.raw('DROP DATABASE ??', [nome]);
  }
}

async function inserirLegado(db) {
  async function usuario(perfil, tipo = perfil) {
    const [id] = await db('usuarios').insert({
      nome: perfil, email: `${perfil.toLowerCase()}@example.invalid`,
      senha: 'hash-sintetico', perfil, tipo_usuario: tipo,
    }).returning('id');
    return id.id;
  }

  const administrador = await usuario('ADMINISTRADOR');
  const gestor = await usuario('GESTOR_SVO');
  const usuarioMotorista = await usuario('MOTORISTA_SVO', 'MOTORISTA');
  const [{ id: veiculo }] = await db('veiculos').insert({
    placa: 'TST1A01', modelo: 'Veículo sintético', tipo_frota: 'SVO',
    capacidade_maxima: 2, lotacao_cabine: 3, status: 'DISPONIVEL',
  }).returning('id');
  const [{ id: motorista }] = await db('motoristas').insert({
    usuario_id: usuarioMotorista, numero_cnh: '00000000001', categoria_cnh: 'B',
    validade_cnh: '2030-01-01', tipo_motorista: 'SVO',
  }).returning('id');
  const [{ id: equipe }] = await db('equipes_svo').insert({
    nome_equipe: 'Equipe sintética',
  }).returning('id');
  const solicitacoes = await db(SVO).insert([
    { registrante_id: administrador, dados_solicitante: 'Legado em triagem', local_ocorrencia: 'Rua A',
      material_sensivel: true, status: 'EM_TRIAGEM' },
    { registrante_id: administrador, dados_solicitante: 'Legado confirmado', local_ocorrencia: 'Rua B',
      material_sensivel: false, status: 'CONFIRMADA', confirmado_por: gestor, confirmado_em: db.fn.now() },
    { registrante_id: gestor, dados_solicitante: 'Legado concluído', local_ocorrencia: 'Rua C',
      material_sensivel: false, status: 'CONCLUIDA' },
  ]).returning('id');
  await db('ordens_svo').insert([
    { solicitacao_id: solicitacoes[1].id, status: 'AGUARDANDO_ALOCACAO', capacidade_utilizada: 1 },
    { solicitacao_id: solicitacoes[2].id, status: 'CONCLUIDA', veiculo_id: veiculo, motorista_id: motorista,
      equipe_id: equipe, capacidade_utilizada: 1, km_inicial: 10, km_final: 20 },
  ]);
  await db('notificacoes').insert({
    usuario_id: gestor, tipo: 'S1', titulo: 'Notificação de teste', mensagem: 'Nova solicitação',
    operacao: 'SVO', referencia_tipo: 'solicitacao_svo', referencia_id: solicitacoes[0].id,
    url_destino: '/triagem-svo', chave_idempotencia: 'fixture-svo-externo-s1',
  });
}

async function snapshot(db, migrado) {
  const dados = {};
  for (const tabela of BASE) {
    dados[tabela] = await db(tabela).orderBy('id');
    if (migrado && tabela === SVO) {
      for (const linha of dados[tabela]) {
        assert.equal(linha.canal_origem, 'INTERNA');
        assert.equal(linha.protocolo, null);
        delete linha.canal_origem;
        delete linha.protocolo;
      }
    }
  }
  return dados;
}

async function inserirExterna(db, protocolo, chave, opcoes = {}) {
  return db.transaction(async (trx) => {
    const [{ id }] = await trx(SVO).insert({ ...externalRoot, protocolo }).returning('id');
    if (opcoes.semDados) return id;
    await trx(DADOS).insert({ solicitacao_id: id, ...externalDetails, ...opcoes.dados });
    if (opcoes.semCredencial) return id;
    await trx(CREDENCIAIS).insert({ solicitacao_id: id, ...externalCredentials,
      chave_idempotencia_criacao: chave, ...opcoes.credenciais });
    return id;
  });
}

async function validarOperacao(db, app) {
  const falha = (fn, code = '23514') => assert.rejects(fn, { code });
  await falha(() => inserirExterna(app, 'SVO-TESTE-INCOMPLETO-01', 'teste-incompleto-01', { semDados: true }));
  await falha(() => inserirExterna(app, 'SVO-TESTE-INCOMPLETO-02', 'teste-incompleto-02', { semCredencial: true }));
  assert.equal(await app(SVO).whereIn('protocolo', ['SVO-TESTE-INCOMPLETO-01', 'SVO-TESTE-INCOMPLETO-02']).first(), undefined);
  await falha(() => inserirExterna(app, 'SVO-TESTE-SEM-CHAVE', null), '23502');
  await falha(() => inserirExterna(app, 'SVO-TESTE-SEM-PAYLOAD', 'sem-payload', { credenciais: { payload_criacao_digest: null } }), '23502');
  await falha(() => inserirExterna(app, 'SVO-TESTE-COORDENADA', 'teste-coord', { dados: { latitude_ocorrencia: -10.9 } }));
  await falha(() => inserirExterna(app, 'SVO-TESTE-METADADOS', 'teste-meta', { dados: { preservacao_legal: true } }), '42501');

  const id = await inserirExterna(app, 'SVO-TESTE-VALIDO-01', 'tentativa-valida-01');
  assert.equal((await app.raw('SELECT current_user AS role')).rows[0].role, process.env.POSTGRES_APP_USER);
  const mudarDados = (valores) => app(DADOS).where({ solicitacao_id: id }).update(valores);
  const mudarCredencial = (valores) => app(CREDENCIAIS).where({ solicitacao_id: id }).update(valores);
  await app.transaction(async (trx) => {
    await trx(SVO).where({ id }).update({ local_ocorrencia: 'Rua Sintética corrigida, 12' });
    await trx(DADOS).where({ solicitacao_id: id }).update({
      numero_imovel: '12', telefone_solicitante: '7900000001', versao_dados: 2,
    });
  });
  assert.equal((await app(SVO).where({ id }).first()).local_ocorrencia, 'Rua Sintética corrigida, 12');
  assert.equal(await db.schema.hasColumn(DADOS, 'endereco_ocorrencia'), false);
  assert.equal(await db.schema.hasColumn(CREDENCIAIS, 'envelope_recuperacao'), false);

  for (const coluna of ['cpf_solicitante', 'nome_solicitante', 'nome_falecido', 'retencao_ate',
    'preservacao_legal', 'anonimizado_em', 'expurgado_em', 'ciencia_registrada_em']) {
    await falha(() => mudarDados({ [coluna]: null }), '42501');
  }
  for (const coluna of ['segredo_digest', 'chave_idempotencia_criacao', 'payload_criacao_digest',
    'prova_tentativa_digest', 'emitida_em', 'versao_credencial']) {
    await falha(() => mudarCredencial({ [coluna]: null }), '42501');
  }
  for (const tabela of [DADOS, CREDENCIAIS]) {
    await falha(() => app(tabela).where({ solicitacao_id: id }).del(), '42501');
    await falha(() => app.raw('TRUNCATE TABLE ??', [tabela]), '42501');
  }
  await falha(() => db(CREDENCIAIS).where({ solicitacao_id: id }).del());
  await falha(() => app(SVO).where({ id }).update({ protocolo: 'SVO-TESTE-TROCA-01' }));
  await falha(() => mudarDados({ encerrado_operacional_em: app.fn.now() }));
  await falha(() => mudarDados({ cancelamento_motivo: 'Pedido sem estado sintético' }));
  await falha(() => mudarDados({ consulta_publica_expira_em: app.fn.now() }), '428C9');

  await app.transaction(async (trx) => {
    await trx(SVO).where({ id }).update({ status: 'RECUSADA', motivo_recusa: 'Razão interna sintética' });
    await trx(DADOS).where({ solicitacao_id: id }).update({
      encerrado_operacional_em: trx.fn.now(), motivo_recusa_publico: 'Justificativa pública sintética',
    });
  });
  const fechado = await app(DADOS).where({ solicitacao_id: id }).first();
  assert.equal(fechado.consulta_publica_expira_em - fechado.encerrado_operacional_em, 30 * 86400_000);
  await falha(() => mudarDados({ encerrado_operacional_em: null }));
  await falha(() => db(DADOS).where({ solicitacao_id: id }).update({ anonimizado_em: db.fn.now() }));
  await mudarCredencial({ revogada_em: app.fn.now(), revogada_motivo: 'Revogação sintética' });
  await falha(() => mudarCredencial({ revogada_em: null, revogada_motivo: null }));
  assert.ok((await app(CREDENCIAIS).where({ solicitacao_id: id }).first()).revogada_em);

  for (const disputa of ['protocolo', 'chave']) {
    const resultados = await Promise.allSettled([1, 2].map((indice) =>
      inserirExterna(app, `SVO-CONCORRENCIA-${disputa.toUpperCase()}-${disputa === 'protocolo' ? 'A' : indice}`,
        `concorrencia-${disputa}-${disputa === 'chave' ? 'A' : indice}`)));
    assert.equal(resultados.filter((resultado) => resultado.status === 'fulfilled').length, 1);
    assert.equal(resultados.find((resultado) => resultado.status === 'rejected').reason.code, '23505');
  }
  console.log('Integridade e role real: criação atômica, alteração permitida, grants negativos, 30 dias, retenção, revogação e concorrência de protocolo e idempotência OK.');
}

async function validarSchemaSolicitacoesExternasSvo() {
  const env = process.env;
  if (env.SOLICITACOES_EXTERNAS_SVO_DB_DESCARTAVEL !== '1' || !['127.0.0.1', 'localhost', '::1'].includes(env.POSTGRES_HOST) ||
      !env.POSTGRES_APP_USER || !env.POSTGRES_APP_PASSWORD || !env.npm_execpath) {
    throw new Error('Use npm run db:validar-solicitacoes-externas-svo em PostgreSQL local descartável com SOLICITACOES_EXTERNAS_SVO_DB_DESCARTAVEL=1 e role de aplicação provisionada.');
  }
  const admin = knex(criarConfigKnex({ ...env, DB_ROLE: 'migration' }));
  try {
    require('tsx/cjs');
    const { VIAGENS_UNIFICADAS_SQL } = require('../src/models/viagemModel.ts');
    const { rows: [servidor] } = await admin.raw("SELECT current_user AS migration_role, current_setting('server_version') AS versao");
    console.log(`PostgreSQL ${servidor.versao} em loopback; migration: ${servidor.migration_role}; aplicação: ${env.POSTGRES_APP_USER}.`);

    await comBanco(admin, env, 'vazio', async (db, contexto) => {
      executarNpm(contexto, 'migrate:status');
      executarNpm(contexto, 'migrate');
      executarNpm(contexto, 'migrate:status');
      const [, pendentes] = await db.migrate.list();
      assert.deepEqual(pendentes, []);
      for (const tabela of BASE) assert.equal((await db(tabela).count('* as n').first()).n, '0');
    });

    await comBanco(admin, env, 'upgrade', async (db, contexto) => {
      const [, pendentes] = await db.migrate.list();
      const anteriores = pendentes.slice(0, pendentes.findIndex(({ file }) => file === ORIGINAL));
      assert.ok(anteriores.length > 0);
      for (const { file } of anteriores) await db.migrate.up({ name: file });
      await inserirLegado(db);
      const antes = await snapshot(db, false);
      const viagens = async () => (await db.raw(`SELECT * FROM (${VIAGENS_UNIFICADAS_SQL}) AS resultado ORDER BY tipo_operacao, id`)).rows;
      const viagensAntes = await viagens();
      assert.ok(viagensAntes.some((viagem) => viagem.tipo_operacao === 'SVO'));
      await db.migrate.up({ name: ORIGINAL });

      // As duas estruturas adulteradas passam pelas verificações nominais do catálogo histórico.
      await db.raw('ALTER TABLE solicitacoes_svo DISABLE TRIGGER trg_proteger_integridade_canal_solicitacao_svo');
      await assert.rejects(() => db.migrate.up({ name: CORRECAO }), /catálogo anterior incompatível/);
      await db.raw('ALTER TABLE solicitacoes_svo ENABLE TRIGGER trg_proteger_integridade_canal_solicitacao_svo');
      await db.raw("ALTER TABLE solicitacoes_svo ALTER COLUMN canal_origem SET DEFAULT 'EXTERNA'");
      await assert.rejects(() => db.migrate.up({ name: CORRECAO }), /catálogo anterior incompatível/);
      await db.raw("ALTER TABLE solicitacoes_svo ALTER COLUMN canal_origem SET DEFAULT 'INTERNA'");

      const roleAnterior = env.POSTGRES_APP_USER;
      try {
        env.POSTGRES_APP_USER = 'role_inexistente_svo_externo_qa';
        await assert.rejects(() => db.migrate.up({ name: CORRECAO }), /role de login separada/);
      } finally {
        env.POSTGRES_APP_USER = roleAnterior;
      }

      await db.raw('GRANT pg_read_all_data TO ??', [env.POSTGRES_APP_USER]);
      try {
        await assert.rejects(() => db.migrate.up({ name: CORRECAO }), /role de login separada/);
      } finally {
        await db.raw('REVOKE pg_read_all_data FROM ??', [env.POSTGRES_APP_USER]);
      }

      await db.migrate.down({ name: ORIGINAL });
      // A migration deve remover os grants que as novas tabelas herdam dos default privileges.
      await db.raw('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT UPDATE, DELETE ON TABLES TO PUBLIC');
      executarNpm(contexto, 'migrate:status');
      executarNpm(contexto, 'migrate');
      executarNpm(contexto, 'migrate:status');
      assert.deepEqual(await snapshot(db, true), antes);
      assert.deepEqual(await viagens(), viagensAntes);
      console.log('Legado antes/depois: ' + BASE.map((tabela) => `${tabela}=${antes[tabela].length}/${antes[tabela].length}`).join(', '));

      const reg = antes.usuarios[0].id;
      await assert.rejects(() => db(SVO).insert({ ...externalRoot, canal_origem: 'INTERNA' }), { code: '23514' });
      await assert.rejects(() => db(SVO).insert({ ...externalRoot, canal_origem: 'INTERNA', registrante_id: -1 }), { code: '23503' });
      await assert.rejects(() => db(SVO).where({ registrante_id: reg }).update({ material_sensivel: null }), { code: '23502' });
      await assert.rejects(() => db(SVO).where({ registrante_id: reg }).update({ status: 'INVALIDO' }), { code: '23514' });
      await assert.rejects(() => db('usuarios').where({ id: reg }).del(),
        (erro) => ['23001', '23503'].includes(erro.code));

      await db.migrate.down({ name: CORRECAO });
      await db.migrate.down({ name: ORIGINAL });
      assert.deepEqual(await snapshot(db, false), antes);
      await db.migrate.up({ name: ORIGINAL });
      executarNpm(contexto, 'migrate');
      // Um grant por coluna anterior precisa ser removido também no reprovisionamento.
      await db.raw('GRANT UPDATE (cpf_solicitante) ON ?? TO ??', [DADOS, env.POSTGRES_APP_USER]);
      executarNpm(contexto, 'db:provisionar-app-user');
      console.log('Rollback das duas migrations com somente legado e reaplicação: OK.');

      const app = knex(criarConfigKnex({ ...contexto, DB_ROLE: 'app' }));
      try {
        await validarOperacao(db, app);
      } finally {
        await app.destroy();
      }
      await assert.rejects(() => db.migrate.down({ name: CORRECAO }), /Rollback bloqueado/);
      console.log('Rollback com registros externos: bloqueado.');
    });
  } finally {
    await admin.destroy();
  }
}

module.exports = { validarSchemaSolicitacoesExternasSvo };
