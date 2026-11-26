'use strict';
// Validação de upgrade REAL. Não lê .env, não usa DATABASE_URL, não usa banco existente.
// Cria o próprio contêiner PostgreSQL 17, sem volumes, com porta efêmera no loopback.
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createECDH } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const knex = require('knex');
const ROOT = path.resolve(__dirname, '..');
const TARGET = '20261126143000_scrum_239_geracao_push.js';
const DB = 'frotas_teste';
const ROLE = 'fsph239_app';
const id = randomUUID();
const name = 'fsph239-' + id;
const password = randomBytes(24).toString('hex');
let container;
let db;

function command(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: ROOT, encoding: 'utf8', timeout: 120000, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${program} ${args[0]} falhou: ${result.error?.message || result.stderr || result.stdout || result.status}`);
  }
  return (result.stdout || '').trim();
}
const docker = (args, options) => command('docker', args, options);
function assertLocalDocker() {
  const ctx = docker(['context', 'show']);
  const info = JSON.parse(docker(['context', 'inspect', ctx]));
  const host = process.env.DOCKER_HOST || info[0]?.Endpoints?.docker?.Host || '';
  assert.match(host, /^(?:npipe:\/\/\/\/\.\/pipe\/|unix:\/\/\/)/i, 'Somente Docker local (npipe/unix).');
  if (process.env.DOCKER_HOST && process.env.DOCKER_CONTEXT) throw new Error('Contexto Docker ambíguo.');
}
function chave() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
}
const snapshot = (table) => db(table).select('*').orderBy('id');
const semGeracao = (rows) => rows.map(({ geracao_vinculo: _geracao, ...resto }) => resto);
async function iniciar() {
  assertLocalDocker();
  // Variável exportada somente ao subprocesso Docker; senha aleatória e descartável.
  container = docker(['run', '--detach', '--rm', '--pull=missing', '--name', name,
    '--label', `fsph.scrum239.disposable=${id}`, '--publish', '127.0.0.1::5432',
    '--env', 'POSTGRES_PASSWORD', '--env', `POSTGRES_DB=${DB}`, 'postgres:17'],
    { env: { ...process.env, POSTGRES_PASSWORD: password }, timeout: 240000 });
  assert.match(container, /^[0-9a-f]{64}$/i);
  const porta = docker(['port', container, '5432/tcp']);
  assert.match(porta, /^127\.0\.0\.1:\d+$/);
  const port = Number(porta.split(':')[1]);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
  const inicio = Date.now();
  while (true) {
    const check = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', DB], { timeout: 5000 });
    if (check.status === 0) break;
    if (Date.now() - inicio > 60000) throw new Error('PostgreSQL descartável não ficou pronto.');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  // Limpa configurações herdadas para que nenhum código de migration/teste use outro banco.
  for (const key of Object.keys(process.env)) {
    if (/^(POSTGRES_|PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SERVICE|SSLMODE|OPTIONS)|DATABASE_URL$|DB_ROLE$|VAPID_)/i.test(key)) delete process.env[key];
  }
  Object.assign(process.env, { POSTGRES_HOST: '127.0.0.1', POSTGRES_PORT: String(port), POSTGRES_DB: DB,
    POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: password, POSTGRES_SSL: 'false', POSTGRES_APP_USER: ROLE,
    NODE_ENV: 'test', JWT_SECRET: 'ci-test-only-secret-not-for-production' });
  db = knex({ client: 'pg', connection: { host: '127.0.0.1', port, database: DB, user: 'postgres', password,
    ssl: false, connectionTimeoutMillis: 5000 }, pool: { min: 0, max: 4 },
    migrations: { directory: path.join(ROOT, 'database/migrations'), tableName: 'knex_migrations' } });
  const result = await db.raw('SELECT current_database() AS db, current_user AS usuario, version() AS versao');
  assert.equal(result.rows[0].db, DB);
  assert.equal(result.rows[0].usuario, 'postgres');
  assert.match(result.rows[0].versao, /^PostgreSQL 17\./);
  assert.equal((await db.raw("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'")).rows[0].n, 0);
  console.log(`PostgreSQL 17 descartável: contêiner ${container.slice(0, 12)}, 127.0.0.1:${port}/${DB}.`);
  await db.raw('CREATE ROLE ?? NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE', [ROLE]);
  await db.raw('GRANT USAGE ON SCHEMA public TO ??', [ROLE]);
}

async function validar() {
  const names = fs.readdirSync(path.join(ROOT, 'database/migrations')).filter((n) => n.endsWith('.js')).sort();
  assert.ok(names.includes(TARGET), 'Migration alvo não encontrada.');
  const anteriores = names.filter((n) => n < TARGET);
  assert.ok(anteriores.includes('20261124203000_scrum_236_push_subscriptions_e_preferencias.js'));
  for (const migration of anteriores) await db.migrate.up({ name: migration });
  assert.deepEqual((await db('knex_migrations').orderBy('id').pluck('name')), anteriores);
  assert.equal(await db.schema.hasColumn('push_subscriptions', 'geracao_vinculo'), false);
  const [u] = await db('usuarios').insert({ nome: 'Fixture SCRUM-239', email: `${id}@testes.invalid`,
    senha: 'hash-de-teste', perfil: 'SOLICITANTE', tipo_usuario: 'SOLICITANTE', ativo: true }).returning('id');
  const pessoa = u.id;
  const endpoints = ['ativo', 'revogado', 'expirado'].map((v) => `https://fcm.googleapis.com/fcm/send/${id}-${v}`);
  const keys = endpoints.map(() => chave());
  const subs = await db('push_subscriptions').insert(endpoints.map((endpoint, i) => ({ usuario_id: pessoa, endpoint, ...keys[i] }))).returning('id');
  await db('push_subscriptions').where({ id: subs[1].id }).update({ ativa: false, status: 'REVOGADA', revogada_em: db.raw('clock_timestamp()') });
  await db('push_subscriptions').where({ id: subs[2].id }).update({ ativa: false, status: 'EXPIRADA', expirada_em: db.raw('clock_timestamp()') });
  await db('preferencias_notificacao').insert([
    { usuario_id: pessoa, categoria: 'VIAGENS', canal: 'WEB_PUSH', habilitado: true },
    { usuario_id: pessoa, categoria: 'SOLICITACOES', canal: 'WEB_PUSH', habilitado: false },
  ]);
  const antes = await snapshot('push_subscriptions');
  const prefs = await snapshot('preferencias_notificacao');
  const usuarios = await snapshot('usuarios');
  const verificarPreservacao = async () => {
    const depois = await snapshot('push_subscriptions');
    assert.deepEqual(semGeracao(depois), antes);
    assert.ok(depois.every((x) => x.geracao_vinculo === 1));
    assert.deepEqual(await snapshot('preferencias_notificacao'), prefs);
    assert.deepEqual(await snapshot('usuarios'), usuarios);
  };
  await db.migrate.up({ name: TARGET });
  await verificarPreservacao();
  console.log('Upgrade sobre schema real populado: assinaturas ativas/revogadas/expiradas, usuários e preferências preservados.');
  // Recuperação antes de a geração ser utilizada. Depois do rollout, manter a coluna aditiva
  // ao reverter o aplicativo; down/up após uso perderia o histórico da geração.
  await db.migrate.down({ name: TARGET });
  assert.equal(await db.schema.hasColumn('push_subscriptions', 'geracao_vinculo'), false);
  assert.deepEqual(await snapshot('push_subscriptions'), antes);
  assert.deepEqual(await snapshot('preferencias_notificacao'), prefs);
  await db.migrate.up({ name: TARGET });
  await verificarPreservacao();
  console.log('Recuperação down/up anterior ao uso da geração: preservação confirmada.');
  const sub = (i) => db('push_subscriptions').where({ id: subs[i].id });
  const gen = async (i) => (await sub(i).first('geracao_vinculo')).geracao_vinculo;
  // O SQL usado pelo código anterior continua funcionando sem referenciar a nova coluna.
  await db.raw(`INSERT INTO push_subscriptions (usuario_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`,
    [pessoa, endpoints[0], keys[0].p256dh, keys[0].auth]);
  assert.equal(await gen(0), 1);
  await sub(0).update(chave());
  assert.equal(await gen(0), 2);
  const novas = await sub(0).first('p256dh', 'auth');
  await sub(0).update(novas);
  assert.equal(await gen(0), 2);
  await sub(1).update({ ativa: true, status: 'ATIVA', revogada_em: null, expirada_em: null });
  assert.equal(await gen(1), 2);
  await sub(2).update({ ativa: true, status: 'ATIVA', revogada_em: null, expirada_em: null, ...chave() });
  assert.equal(await gen(2), 2); // reativação e troca na mesma ocorrência contam uma vez
  await db.raw('GRANT SELECT, UPDATE ON TABLE usuarios TO ??', [ROLE]);
  await db.transaction(async (trx) => {
    await trx.raw('SET LOCAL ROLE ??', [ROLE]);
    const alvo = await trx('push_subscriptions').where({ id: subs[0].id }).first();
    assert.equal(alvo.geracao_vinculo, 2);
    await trx('push_subscriptions').where({ id: alvo.id }).update(chave());
    assert.equal((await trx('push_subscriptions').where({ id: alvo.id }).first()).geracao_vinculo, 3);
    assert.equal((await trx.raw("SELECT has_table_privilege(current_user, 'preferencias_notificacao', 'DELETE') AS permitido")).rows[0].permitido, false);
    assert.equal((await trx.raw("SELECT has_table_privilege(current_user, 'push_subscriptions', 'TRIGGER') AS permitido")).rows[0].permitido, false);
  });
  const ultimo = await sub(0).first();
  await sub(0).del(); // apenas fixture gerada neste contêiner
  const [recriado] = await db('push_subscriptions').insert({ usuario_id: pessoa, endpoint: ultimo.endpoint,
    p256dh: ultimo.p256dh, auth: ultimo.auth }).returning(['id', 'geracao_vinculo']);
  assert.notEqual(recriado.id, ultimo.id);
  assert.equal(recriado.geracao_vinculo, 1);
  assert.deepEqual(await snapshot('preferencias_notificacao'), prefs);
  await db.migrate.latest();
  console.log('Geração, idempotência, reativação, troca de chaves, recriação, compatibilidade e role restrita: OK.');
  // Reutiliza o PostgreSQL sintético para a suíte HTTP real de Push e Badge S6/S7.
  delete process.env.POSTGRES_APP_USER;
  process.env.SCRUM237_POSTGRES_TESTS = '1';
  const teste = spawnSync(process.execPath, [path.join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run',
    'src/tests/pushPostgres.test.ts'], { cwd: ROOT, stdio: 'inherit', env: process.env, timeout: 300000 });
  assert.equal(teste.status, 0, teste.error?.message || 'Falha nos testes HTTP/PostgreSQL de Push.');
}

(async () => {
  try {
    await iniciar();
    await validar();
    console.log('SCRUM-239: validação de migration e HTTP/PostgreSQL concluída.');
  } catch (error) {
    console.error('SCRUM-239: falha na validação:', error.message);
    process.exitCode = 1;
  } finally {
    if (db) await db.destroy().catch(() => { process.exitCode = 1; });
    if (container && /^[0-9a-f]{64}$/i.test(container)) {
      try { docker(['stop', '--time', '5', container]); }
      catch { console.error(`Não foi possível parar o contêiner descartável ${container}.`); process.exitCode = 1; }
    }
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
