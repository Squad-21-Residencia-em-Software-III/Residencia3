const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const knex = require('knex');

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Informe a porta local do contêiner PostgreSQL descartável.');
}

const migration = '20261126180000_scrum_231_programacao_administrativa.js';
const directory = path.join(__dirname, '../database/migrations');
const role = 'scrum231_app_teste';
const db = knex({
  client: 'pg',
  connection: { host: '127.0.0.1', port, database: 'frotas_teste', user: 'postgres', ssl: false },
  migrations: { directory },
});

async function validar() {
  const { rows: [estado] } = await db.raw(`
    SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public') AS populado,
      current_setting('server_version_num')::integer / 10000 AS versao
  `);
  assert.deepEqual(estado, { populado: false, versao: 17 });
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.js') && name < migration).sort()) {
    await db.migrate.up({ name });
  }

  const [pedido] = await db('solicitacoes_viagem').insert({
    origem: 'Origem de teste', destino: 'Destino de teste', finalidade: 'Teste de upgrade',
    data_saida_desejada: '2026-11-26T02:00:00Z', status: 'APROVADA',
  }).returning('*');
  const [aprovacao] = await db('auditorias')
    .insert({ acao: `Aprovação de teste da solicitação ${pedido.id}`, modulo: 'SOLICITACAO_VIAGEM' })
    .returning('*');
  const [viagem] = await db('viagens_frota').insert({
    solicitacao_id: pedido.id, status: 'CONCLUIDA', km_inicial: 100, km_final: 120,
    data_hora_efetiva_saida: '2026-11-26T04:00:00Z',
    data_hora_efetiva_chegada: '2026-11-26T05:00:00Z',
  }).returning('*');
  const validarPreservacao = async () => {
    assert.deepEqual(await db('solicitacoes_viagem').where({ id: pedido.id }).first(), pedido);
    assert.deepEqual(await db('auditorias').where({ id: aprovacao.id }).first(), aprovacao);
    assert.deepEqual(await db('viagens_frota').select(Object.keys(viagem)).where({ id: viagem.id }).first(), viagem);
  };

  await db.raw('CREATE ROLE ?? NOLOGIN', [role]);
  process.env.POSTGRES_APP_USER = role;
  await db.migrate.up({ name: migration });
  await validarPreservacao();
  const campos = ['inicio_previsto', 'fim_previsto', 'versao_programacao'];
  const legado = { inicio_previsto: null, fim_previsto: null, versao_programacao: 0 };
  assert.deepEqual(await db('viagens_frota').select(campos).where({ id: viagem.id }).first(), legado);
  const { rows: [permissoes] } = await db.raw(`
    SELECT has_table_privilege(?, 'reprogramacoes_viagem_frota', 'SELECT') AS leitura,
           has_table_privilege(?, 'reprogramacoes_viagem_frota', 'INSERT') AS insercao,
           has_table_privilege(?, 'reprogramacoes_viagem_frota', 'UPDATE, DELETE, TRUNCATE') AS alteracao
  `, [role, role, role]);
  assert.deepEqual(permissoes, { leitura: true, insercao: true, alteracao: false });

  const [rollout] = await db('viagens_frota').insert({ status: 'AGENDADA' }).returning(campos);
  assert.deepEqual(rollout, legado);
  await db.migrate.down({ name: migration });
  await validarPreservacao();
  assert.equal(await db.schema.hasColumn('viagens_frota', 'versao_programacao'), false);
  assert.equal(await db.schema.hasTable('reprogramacoes_viagem_frota'), false);

  await db.migrate.up({ name: migration });
  const programacao = {
    inicio_previsto: '2026-11-27T10:00:00Z', fim_previsto: '2026-11-27T11:00:00Z',
  };
  await db('viagens_frota').where({ id: viagem.id }).update({ ...programacao, versao_programacao: 1 });
  await assert.rejects(db.migrate.down({ name: migration }), /programação em uso/);
  const comando = {
    viagem_id: viagem.id, chave: '3fe24d66-09c9-4147-932f-1ad41abfdc73', autor_id: 1,
    versao_esperada: 0, ...programacao,
  };
  await db('reprogramacoes_viagem_frota').insert(comando);
  await db('viagens_frota').where({ id: viagem.id }).update(legado);
  await assert.rejects(db.migrate.down({ name: migration }), /programação em uso/);
  assert.equal(await db('reprogramacoes_viagem_frota').where({ chave: comando.chave }).first('viagem_id')
    .then(row => row.viagem_id), viagem.id);
  await validarPreservacao();
  console.log('SCRUM-231: upgrade populado, privilégios, rollout e rollback validados em PostgreSQL 17.');
}

validar().finally(() => db.destroy()).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
