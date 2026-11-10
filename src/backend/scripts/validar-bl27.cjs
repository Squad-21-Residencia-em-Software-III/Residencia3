/* Validação isolada com PostgreSQL WASM. Não abre o banco configurado no projeto.
 * Uso, após npm run build: node scripts/validar-bl27.cjs <caminho-do-modulo-pglite>
 * PGlite é ferramenta opcional de QA, instalada fora das dependências do produto.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const knex = require('knex');
const ClientPg = require('knex/lib/dialects/postgres');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const request = require('supertest');

async function main() {
  const pg = new PGlite();
  // Uma conexão: executa o SQL real do dialeto PG e transações, mas não simula
  // locks entre conexões de um servidor PostgreSQL multiprocesso.
  class ClientTeste extends ClientPg {
    async acquireRawConnection() { return pg; }
    async destroyRawConnection() {}
    validateConnection() { return true; }
    async _query(conn, obj) {
      const resultados = obj.bindings?.length
        ? [await conn.query(obj.sql, obj.bindings)] : await conn.exec(obj.sql);
      const resultado = resultados.at(-1) || { rows: [] };
      obj.response = { ...resultado, rowCount: resultado.affectedRows ?? resultado.rows.length };
      return obj;
    }
  }
  const db = knex({ client: ClientTeste, connection: {}, pool: { min: 0, max: 1 } });
  const raiz = path.resolve(__dirname, '..');
  // Injeta somente neste processo de QA; todo o restante usa models/services reais.
  require.cache[require.resolve('../dist/config/database')] = {
    id: require.resolve('../dist/config/database'), filename: require.resolve('../dist/config/database'),
    loaded: true, exports: { db },
  };
  process.env.JWT_SECRET = 'bl27-qa-isolado';
  const { authService } = require('../dist/services/authService');
  let perfil = 'GESTOR_SVO';
  authService.usuarioDoToken = async () => ({ id: 1, perfil });
  const { app } = require('../dist/app');
  const { solicitacaoSvoService } = require('../dist/services/solicitacaoSvoService');
  const autor = { id: 1, perfil: 'GESTOR_SVO' };
  const token = 'Bearer qa';
  const criarSolicitacao = async (status = 'EM_TRIAGEM') => {
    const [s] = await db('solicitacoes_svo').insert({
      registrante_id: 1, dados_solicitante: 'Hospital QA', local_ocorrencia: 'Local QA', status,
    }).returning('*');
    return s;
  };
  const nomeMigration = '20261110120000_bl27_confirmacao_e_ordem_svo.js';
  const migrations = fs.readdirSync(path.join(raiz, 'database/migrations'))
    .filter((arquivo) => arquivo.endsWith('.js') && arquivo <= nomeMigration).sort();
  const ultima = require(path.join(raiz, 'database/migrations', nomeMigration));
  try {
    for (const arquivo of migrations) {
      await db.transaction((trx) => require(path.join(raiz, 'database/migrations', arquivo)).up(trx));
    }
    console.log(`OK: ${migrations.length} migrations aplicadas em banco vazio`);
    await db.transaction((trx) => ultima.down(trx));
    await db.transaction((trx) => ultima.up(trx));
    console.log('OK: rollback e reaplicação da migration BL27 sem dados');
    await db('usuarios').insert({ id: 1, nome: 'Gestor QA', email: 'qa@exemplo.com', senha: 'hash-qa',
      perfil: 'GESTOR_SVO', tipo_usuario: 'GESTOR_SVO' });
    await db('veiculos').insert({ id: 1, placa: 'QAA1A11', modelo: 'SVO QA', tipo_frota: 'SVO', capacidade_maxima: 4 });
    await db('motoristas').insert({ id: 1, usuario_id: 1, numero_cnh: '12345678901', categoria_cnh: 'B',
      validade_cnh: '2099-12-31', tipo_motorista: 'SVO' });

    // Migração de dados antigos e falha atômica quando já existem duplicatas.
    await db.transaction((trx) => ultima.down(trx));
    const legada = await criarSolicitacao();
    const [ordemLegada] = await db('ordens_svo').insert({
      solicitacao_id: legada.id, veiculo_id: 1, motorista_id: 1, status: 'ALOCADA',
    }).returning('*');
    const [duplicada] = await db('ordens_svo').insert({
      solicitacao_id: legada.id, veiculo_id: 1, motorista_id: 1, status: 'ALOCADA',
    }).returning('*');
    await assert.rejects(db.transaction((trx) => ultima.up(trx)), (erro) => erro.code === '23505');
    assert.equal((await db('solicitacoes_svo').where({ id: legada.id }).first()).status, 'EM_TRIAGEM');
    await db('ordens_svo').where({ id: duplicada.id }).delete();
    await db.transaction((trx) => ultima.up(trx));
    const migrada = await db('solicitacoes_svo').where({ id: legada.id }).first();
    assert.equal(migrada.status, 'EM_ANDAMENTO');
    assert.equal(migrada.confirmado_por, null);
    assert.equal(migrada.confirmado_em, null);
    assert.equal((await db('ordens_svo').where({ id: ordemLegada.id }).first()).status, 'ALOCADA');
    await db('ordens_svo').where({ id: ordemLegada.id }).delete();
    await db('solicitacoes_svo').where({ id: legada.id }).delete();
    console.log('OK: preservação de ordem legada e rollback da migration com duplicatas');

    const s = await criarSolicitacao();
    const listar = await request(app).get('/api/solicitacoes-svo?status=EM_TRIAGEM').set('Authorization', token);
    assert.equal(listar.status, 200);
    assert.equal(listar.body.paginacao.total, 1);
    const detalhe = await request(app).get(`/api/solicitacoes-svo/${s.id}`).set('Authorization', token);
    assert.equal(detalhe.body.solicitacao.local_ocorrencia, 'Local QA');
    assert.equal(detalhe.body.ordem, null);
    const respostas = await Promise.all([1, 2].map(() => request(app)
      .patch(`/api/solicitacoes-svo/${s.id}/confirmar`).set('Authorization', token)));
    assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 201]);
    assert.equal(respostas[0].body.ordem.id, respostas[1].body.ordem.id);
    const ordem = respostas[0].body.ordem;
    assert.equal(ordem.status, 'AGUARDANDO_ALOCACAO');
    assert.equal(ordem.veiculo_id, null);
    assert.equal(ordem.motorista_id, null);
    const persistida = await db('solicitacoes_svo').where({ id: s.id }).first();
    assert.equal(persistida.status, 'CONFIRMADA');
    assert.equal(persistida.confirmado_por, 1);
    assert.ok(persistida.confirmado_em);
    assert.equal((await db('ordens_svo').where({ solicitacao_id: s.id })).length, 1);
    assert.equal((await db('auditorias').where({ modulo: 'SVO' })).length, 1);
    console.log('OK: consulta, confirmação, persistência, repetição e auditoria pela API real');
    await assert.rejects(db('ordens_svo').insert({ solicitacao_id: s.id, status: 'AGUARDANDO_ALOCACAO' }),
      (erro) => erro.code === '23505');
    await assert.rejects(db.transaction((trx) => ultima.down(trx)), /antes do rollback BL27/);
    console.log('OK: unicidade no banco e proteção contra rollback com atendimentos pendentes');

    // Falhas no PostgreSQL, sem mocks: ambas devem desfazer também a confirmação.
    const falha = await criarSolicitacao();
    for (const registro of [
      { solicitacao_id: falha.id, status: 'ALOCADA' },
      { solicitacao_id: falha.id, status: 'EM_DESLOCAMENTO' },
      { solicitacao_id: falha.id, status: 'AGUARDANDO_ALOCACAO', veiculo_id: 1 },
    ]) {
      await assert.rejects(db('ordens_svo').insert(registro), (erro) => erro.code === '23514');
    }
    console.log('OK: constraints rejeitam ordens com recursos incompatíveis com o estado');
    for (const tabela of ['ordens_svo', 'auditorias']) {
      await db.raw(`CREATE FUNCTION falhar_bl27() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Falha QA BL27'; END $$;
        CREATE TRIGGER falhar_bl27 BEFORE INSERT ON ${tabela} FOR EACH ROW EXECUTE FUNCTION falhar_bl27();`);
      await assert.rejects(solicitacaoSvoService.confirmar(falha.id, autor), /Falha QA BL27/);
      assert.equal((await db('solicitacoes_svo').where({ id: falha.id }).first()).status, 'EM_TRIAGEM');
      assert.equal((await db('solicitacoes_svo').where({ id: falha.id }).first()).confirmado_por, null);
      assert.equal((await db('solicitacoes_svo').where({ id: falha.id }).first()).confirmado_em, null);
      assert.equal((await db('ordens_svo').where({ solicitacao_id: falha.id })).length, 0);
      await db.raw(`DROP TRIGGER falhar_bl27 ON ${tabela}; DROP FUNCTION falhar_bl27();`);
    }
    console.log('OK: rollback real da confirmação em falha na ordem e na auditoria');

    for (const status of ['CANCELADA', 'CONCLUIDA']) {
      const fechada = await criarSolicitacao(status);
      const resposta = await request(app).patch(`/api/solicitacoes-svo/${fechada.id}/confirmar`).set('Authorization', token);
      assert.equal(resposta.status, 409);
    }
    assert.equal((await request(app).patch('/api/solicitacoes-svo/9999/confirmar').set('Authorization', token)).status, 404);
    assert.equal((await request(app).get('/api/solicitacoes-svo')).status, 401);
    perfil = 'SOLICITANTE';
    assert.equal((await request(app).patch(`/api/solicitacoes-svo/${falha.id}/confirmar`).set('Authorization', token)).status, 403);
    perfil = 'GESTOR_SVO';
    console.log('OK: estados inválidos, inexistência e permissões');

    const alocar = (id) => request(app).post('/api/viagens').set('Authorization', token)
      .send({ tipo_operacao: 'SVO', solicitacao_id: id, veiculo_id: 1, motorista_id: 1 });
    assert.equal((await alocar(falha.id)).status, 409);
    const alocada = await alocar(s.id);
    assert.equal(alocada.status, 200, JSON.stringify(alocada.body));
    assert.equal(alocada.body.id, ordem.id);
    assert.equal((await db('ordens_svo').where({ solicitacao_id: s.id })).length, 1);
    assert.equal((await alocar(s.id)).status, 409);
    const pendente = await criarSolicitacao();
    await solicitacaoSvoService.confirmar(pendente.id, autor);
    const viagens = await request(app).get('/api/viagens').set('Authorization', token);
    assert.equal(viagens.status, 200);
    assert.equal(viagens.body.length, 1);
    const iniciar = await request(app).patch(`/api/viagens/${ordem.id}/iniciar`).set('Authorization', token)
      .send({ tipo_operacao: 'SVO', km_inicial: 0 });
    assert.equal(iniciar.status, 200, JSON.stringify(iniciar.body));
    const finalizar = await request(app).patch(`/api/viagens/${ordem.id}/finalizar`).set('Authorization', token)
      .send({ tipo_operacao: 'SVO', km_final: 20 });
    assert.equal(finalizar.status, 200, JSON.stringify(finalizar.body));
    assert.equal((await db('solicitacoes_svo').where({ id: s.id }).first()).status, 'CONCLUIDA');
    console.log('OK: confirmação → alocação da mesma ordem → início → conclusão; pendentes fora de viagens');

    const alocarPendente = await alocar(pendente.id);
    assert.equal(alocarPendente.status, 200);
    const cancelar = await request(app).patch(`/api/viagens/${alocarPendente.body.id}/cancelar`)
      .set('Authorization', token).send({ tipo_operacao: 'SVO' });
    assert.equal(cancelar.status, 200, JSON.stringify(cancelar.body));
    assert.equal((await db('solicitacoes_svo').where({ id: pendente.id }).first()).status, 'EM_TRIAGEM');
    const reconfirmar = await request(app).patch(`/api/solicitacoes-svo/${pendente.id}/confirmar`)
      .set('Authorization', token);
    assert.equal(reconfirmar.status, 201, JSON.stringify(reconfirmar.body));
    assert.notEqual(reconfirmar.body.ordem.id, alocarPendente.body.id);
    const historico = await db('ordens_svo').where({ solicitacao_id: pendente.id }).orderBy('id');
    assert.deepEqual(historico.map((o) => o.status), ['CANCELADA', 'AGUARDANDO_ALOCACAO']);
    console.log('OK: cancelamento e nova confirmação preservam a ordem cancelada no histórico');
  } finally {
    await db.destroy();
    await pg.close();
  }
}
main().catch((erro) => { console.error(erro); process.exitCode = 1; });
