import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';

// Este arquivo só executa no banco descartável explicitamente identificado abaixo.
const habilitado = process.env.SCRUM166_POSTGRES_TESTS === '1';
const instante = (minutos: number) => new Date(Date.now() + minutos * 60_000);
const nonce = () => randomBytes(4).toString('hex');

async function usuario(perfil: 'GESTOR_SVO' | 'GESTOR_FROTA' | 'MOTORISTA_SVO' | 'MOTORISTA_FROTA') {
  const chave = nonce();
  const [u] = await db('usuarios').insert({
    nome: `Teste ${chave}`, email: `${chave}@testes.invalid`, senha: 'hash-de-teste',
    tipo_usuario: perfil.startsWith('MOTORISTA_') ? 'MOTORISTA' : perfil, perfil,
  }).returning('*');
  if (perfil === 'GESTOR_SVO') {
    const unidade = await db('unidades').where({ nome: 'SVO' }).first('id');
    await db('gestores_unidades').insert({ unidade_id: unidade.id, usuario_id: u.id });
  }
  const agora = Math.floor(Date.now() / 1000);
  const token = jwt.sign({ typ: 'access', perfil, sv: u.versao_sessao, sessao_exp: agora + 3600 }, env.jwtSecret, {
    algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web',
    subject: String(u.id), expiresIn: 1800,
  });
  return { ...u, token: `Bearer ${token}` };
}

async function recursos() {
  const gestor = await usuario('GESTOR_SVO');
  const condutor = await usuario('MOTORISTA_SVO');
  const chave = nonce();
  const [veiculo] = await db('veiculos').insert({
    placa: `T${chave}`, modelo: 'Veículo de teste', tipo_frota: 'SVO',
    capacidade_maxima: 4, lotacao_cabine: 3, status: 'DISPONIVEL',
  }).returning('*');
  const [motorista] = await db('motoristas').insert({
    usuario_id: condutor.id, numero_cnh: chave, categoria_cnh: 'B',
    validade_cnh: '2099-12-31', tipo_motorista: 'SVO', status: 'DISPONIVEL',
  }).returning('*');
  const [equipe] = await db('equipes_svo').insert({ nome_equipe: `Equipe ${chave}` }).returning('*');
  await db('escalas_svo').insert({ equipe_id: equipe.id, data_inicio: instante(-1440), data_fim: instante(14400) });
  return { gestor, condutor, veiculo, motorista, equipe };
}

async function pendente(autorId: number) {
  const [solicitacao] = await db('solicitacoes_svo').insert({
    registrante_id: autorId, dados_solicitante: 'Solicitante teste', local_ocorrencia: 'Local de teste',
    material_sensivel: false, status: 'CONFIRMADA', confirmado_por: autorId, confirmado_em: new Date(),
  }).returning('*');
  const [ordem] = await db('ordens_svo').insert({
    solicitacao_id: solicitacao.id, status: 'AGUARDANDO_ALOCACAO', capacidade_utilizada: 1,
  }).returning('*');
  return { solicitacao, ordem };
}

describe.skipIf(!habilitado)('SCRUM-166 com PostgreSQL isolado e HTTP autenticado', () => {
  beforeAll(async () => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_PORT !== '55432' ||
        process.env.POSTGRES_DB !== 'fsph_scrum166_teste') throw new Error('Banco de teste não autorizado');
    const resultado = await db.raw('SELECT current_database() AS db, inet_server_addr()::text AS endereco, inet_server_port() AS porta');
    const ip = process.env.POSTGRES_TEST_CONTAINER_IP ?? '127.0.0.1';
    if (!/^(127\.|172\.(1[6-9]|2\d|3[01])\.|10\.|192\.168\.)/.test(ip)) throw new Error('IP de teste não privado');
    expect(resultado.rows[0]).toMatchObject({ db: 'fsph_scrum166_teste', endereco: `${ip}/32`, porta: 55432 });
  });
  afterAll(async () => { await db.destroy(); });

  it('serializa reservas concorrentes do mesmo recurso e mantém uma ordem pendente', async () => {
    const r = await recursos();
    const [a, b] = await Promise.all([pendente(r.gestor.id), pendente(r.gestor.id)]);
    const corpo = { tipo_operacao: 'SVO', veiculo_id: r.veiculo.id, motorista_id: r.motorista.id,
      equipe_id: r.equipe.id, inicio_previsto: instante(120).toISOString(), fim_previsto: instante(180).toISOString() };
    const respostas = await Promise.all([a, b].map((item) => request(app).post('/api/viagens')
      .set('Authorization', r.gestor.token).send({ ...corpo, solicitacao_id: item.solicitacao.id })));
    expect(respostas.map((resp) => resp.status).sort()).toEqual([200, 409]);
    expect(respostas.find((resp) => resp.status === 409)?.body.codigo).toBe('CONFLITO_AGENDA');
    const ordens = await db('ordens_svo').whereIn('id', [a.ordem.id, b.ordem.id]);
    expect(ordens.map((o) => o.status).sort()).toEqual(['AGUARDANDO_ALOCACAO', 'ALOCADA']);
  });

  it('confirma triagem idempotentemente e lista ordens pendentes com paginação real', async () => {
    const r = await recursos();
    const [s] = await db('solicitacoes_svo').insert({ registrante_id: r.gestor.id,
      dados_solicitante: 'Solicitante teste', local_ocorrencia: 'Local de teste', material_sensivel: false,
      status: 'EM_TRIAGEM' }).returning('*');
    const respostas = await Promise.all([1, 2].map(() => request(app)
      .patch(`/api/solicitacoes-svo/${s.id}/confirmar`).set('Authorization', r.gestor.token)));
    expect(respostas.map((resp) => resp.status).sort()).toEqual([200, 201]);
    const ordens = await db('ordens_svo').where({ solicitacao_id: s.id });
    expect(ordens).toHaveLength(1);
    expect(ordens[0].status).toBe('AGUARDANDO_ALOCACAO');
    const pagina1 = await request(app).get('/api/viagens/ordens-svo/pendentes?pagina=1&limite=1').set('Authorization', r.gestor.token);
    const pagina2 = await request(app).get('/api/viagens/ordens-svo/pendentes?pagina=2&limite=1').set('Authorization', r.gestor.token);
    expect(pagina1.status).toBe(200);
    expect(pagina2.status).toBe(200);
    expect(pagina1.body.paginacao.limite).toBe(1);
    expect(pagina1.body.paginacao.total).toBeGreaterThanOrEqual(2);
    expect(pagina1.body.dados[0].ordem_id).not.toBe(pagina2.body.dados[0].ordem_id);
    expect(pagina1.body.dados[0]).not.toHaveProperty('dados_solicitante');
    expect(pagina1.body.dados[0]).toHaveProperty('solicitacao_id');
  });

  it('exige desafio para intervalo de 10 minutos e revalida antes de gravar', async () => {
    const r = await recursos();
    const a = await pendente(r.gestor.id);
    const b = await pendente(r.gestor.id);
    const inicioA = instante(120);
    const fimA = new Date(inicioA.getTime() + 60 * 60_000);
    const inicioB = new Date(fimA.getTime() + 10 * 60_000);
    const base = { tipo_operacao: 'SVO', veiculo_id: r.veiculo.id, motorista_id: r.motorista.id, equipe_id: r.equipe.id, capacidade_utilizada: 2 };
    const primeira = await request(app).post('/api/viagens').set('Authorization', r.gestor.token)
      .send({ ...base, solicitacao_id: a.solicitacao.id, inicio_previsto: inicioA.toISOString(), fim_previsto: fimA.toISOString() });
    expect(primeira.status).toBe(200);
    const corpoB = { ...base, solicitacao_id: b.solicitacao.id, inicio_previsto: inicioB.toISOString(),
      fim_previsto: new Date(inicioB.getTime() + 60 * 60_000).toISOString() };
    const aviso = await request(app).post('/api/viagens').set('Authorization', r.gestor.token).send(corpoB);
    expect(aviso.status).toBe(409);
    expect(aviso.body.codigo).toBe('CONFIRMACAO_INTERVALO_REDUZIDO');
    const semToken = await request(app).post('/api/viagens').set('Authorization', r.gestor.token)
      .send({ ...corpoB, confirmar_intervalo_reduzido: true });
    expect(semToken.status).toBe(409);
    const confirmada = await request(app).post('/api/viagens').set('Authorization', r.gestor.token)
      .send({ ...corpoB, confirmar_intervalo_reduzido: true, token_confirmacao: aviso.body.contexto.token_confirmacao });
    expect(confirmada.status).toBe(200);
    const auditoria = await db('auditorias').where('acao', 'like', `CONFIRMOU_INTERVALO_SVO ordem=${b.ordem.id}%`);
    expect(auditoria).toHaveLength(1);
  });

  it('alerta atraso e libera a ordem mais antiga após a conclusão sem iniciar a próxima', async () => {
    const r = await recursos();
    const [a, b, c] = await Promise.all([pendente(r.gestor.id), pendente(r.gestor.id), pendente(r.gestor.id)]);
    for (const item of [a, b, c]) await db('solicitacoes_svo').where({ id: item.solicitacao.id }).update({ status: 'EM_ANDAMENTO' });
    const comum = { veiculo_id: r.veiculo.id, motorista_id: r.motorista.id, equipe_id: r.equipe.id, capacidade_utilizada: 1 };
    await db('ordens_svo').where({ id: a.ordem.id }).update({ ...comum, status: 'EM_DESLOCAMENTO',
      inicio_previsto: instante(-120), fim_previsto: instante(-60), data_hora_saida: instante(-120), km_inicial: 10 });
    await db('ordens_svo').where({ id: b.ordem.id }).update({ ...comum, status: 'ALOCADA', inicio_previsto: instante(-40), fim_previsto: instante(-20) });
    await db('ordens_svo').where({ id: c.ordem.id }).update({ ...comum, status: 'ALOCADA', inicio_previsto: instante(-10), fim_previsto: instante(20) });
    const alertas = await request(app).get('/api/viagens/ordens-svo/alertas?limite=100').set('Authorization', r.gestor.token);
    expect(alertas.status).toBe(200);
    expect(alertas.body.dados.filter((x: { ordem_em_atraso_id: number }) => x.ordem_em_atraso_id === a.ordem.id)).toHaveLength(2);
    const saidaAntecipada = await request(app).patch(`/api/viagens/${b.ordem.id}/iniciar`)
      .set('Authorization', r.condutor.token).send({ tipo_operacao: 'SVO', km_inicial: 20 });
    expect(saidaAntecipada.status).toBe(409);
    const finalizacao = await request(app).patch(`/api/viagens/${a.ordem.id}/finalizar`).set('Authorization', r.condutor.token)
      .send({ tipo_operacao: 'SVO', km_final: 20 });
    expect(finalizacao.status).toBe(200);
    const proxima = await db('ordens_svo').where({ id: b.ordem.id }).first();
    const posterior = await db('ordens_svo').where({ id: c.ordem.id }).first();
    expect(proxima.liberada_em).not.toBeNull();
    expect(proxima.status).toBe('ALOCADA');
    expect(proxima.km_inicial).toBeNull();
    expect(proxima.data_hora_saida).toBeNull();
    expect(posterior.liberada_em).toBeNull();
    const saidaReal = await request(app).patch(`/api/viagens/${b.ordem.id}/iniciar`)
      .set('Authorization', r.condutor.token).send({ tipo_operacao: 'SVO', km_inicial: 20 });
    expect(saidaReal.status).toBe(200);
    const iniciada = await db('ordens_svo').where({ id: b.ordem.id }).first();
    expect(iniciada.status).toBe('EM_DESLOCAMENTO');
    expect(iniciada.km_inicial).toBe(20);
    expect(iniciada.data_hora_saida).not.toBeNull();
  });

  it('isola solicitações e viagens administrativas de usuários diferentes, inclusive por ID', async () => {
    const a = await usuario('GESTOR_SVO');
    const b = await usuario('GESTOR_SVO');
    const condutor = await usuario('MOTORISTA_FROTA');
    const chave = nonce();
    const [veiculo] = await db('veiculos').insert({ placa: `A${chave}`, modelo: 'Administrativo',
      tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 4, status: 'DISPONIVEL' }).returning('*');
    const [motorista] = await db('motoristas').insert({ usuario_id: condutor.id, numero_cnh: chave,
      categoria_cnh: 'B', validade_cnh: '2099-12-31', tipo_motorista: 'FROTA', status: 'DISPONIVEL' }).returning('*');
    const criadas = [];
    for (const dono of [a, b]) {
      const [solicitacao] = await db('solicitacoes_viagem').insert({ solicitante_id: dono.id,
        origem: 'Sede', destino: `Destino ${dono.id}`, finalidade: 'Teste de isolamento',
        data_saida_desejada: instante(120), data_chegada_desejada: instante(180), status: 'AGENDADA' }).returning('*');
      const [viagem] = await db('viagens_frota').insert({ solicitacao_id: solicitacao.id,
        veiculo_id: veiculo.id, motorista_id: motorista.id, status: 'AGENDADA' }).returning('*');
      criadas.push({ solicitacao, viagem });
    }
    const minhas = await request(app).get('/api/viagens/minhas').set('Authorization', a.token);
    expect(minhas.status).toBe(200);
    expect(minhas.body.dados.map((v: { id: number }) => v.id)).toContain(criadas[0].viagem.id);
    expect(minhas.body.dados.map((v: { id: number }) => v.id)).not.toContain(criadas[1].viagem.id);
    expect(minhas.body.dados[0]).not.toHaveProperty('motorista_nome');
    expect(minhas.body.dados[0]).not.toHaveProperty('km_inicial');
    const pedidos = await request(app).get('/api/solicitacoes-viagem/minhas').set('Authorization', a.token);
    expect(pedidos.status).toBe(200);
    expect(pedidos.body.dados.map((s: { id: number }) => s.id)).toContain(criadas[0].solicitacao.id);
    expect(pedidos.body.dados.map((s: { id: number }) => s.id)).not.toContain(criadas[1].solicitacao.id);
    expect(pedidos.body.dados[0]).not.toHaveProperty('motorista_nome');
    const idor = await request(app).patch(`/api/viagens/${criadas[1].viagem.id}/iniciar`)
      .set('Authorization', a.token).send({ tipo_operacao: 'ADMINISTRATIVA', km_inicial: 0 });
    expect(idor.status).toBe(403);
    const filtro = await request(app).get(`/api/viagens/minhas?usuario_id=${b.id}`).set('Authorization', a.token);
    expect(filtro.status).toBe(400);
  });

  it.each(['EM_DESLOCAMENTO', 'NO_LOCAL'])('conclusões simultâneas em %s liberam somente após todos os recursos ficarem livres', async (status) => {
    const r1 = await recursos();
    const r2 = await recursos();
    const [a, d, b] = await Promise.all([pendente(r1.gestor.id), pendente(r1.gestor.id), pendente(r1.gestor.id)]);
    for (const item of [a, d, b]) await db('solicitacoes_svo').where({ id: item.solicitacao.id }).update({ status: 'EM_ANDAMENTO' });
    await db('ordens_svo').where({ id: a.ordem.id }).update({ veiculo_id: r1.veiculo.id, motorista_id: r1.motorista.id,
      status, inicio_previsto: instante(-120), fim_previsto: instante(-60), data_hora_saida: instante(-120), km_inicial: 10 });
    await db('ordens_svo').where({ id: d.ordem.id }).update({ veiculo_id: r2.veiculo.id, motorista_id: r2.motorista.id,
      status, inicio_previsto: instante(-120), fim_previsto: instante(-60), data_hora_saida: instante(-120), km_inicial: 10 });
    await db('ordens_svo').where({ id: b.ordem.id }).update({ veiculo_id: r1.veiculo.id, motorista_id: r2.motorista.id,
      equipe_id: r1.equipe.id, status: 'ALOCADA', inicio_previsto: instante(-20), fim_previsto: instante(40) });
    const respostas = await Promise.all([a, d].map((item) =>
      request(app).patch(`/api/viagens/${item.ordem.id}/finalizar`).set('Authorization', item.ordem.id === a.ordem.id ? r1.condutor.token : r2.condutor.token)
        .send({ tipo_operacao: 'SVO', km_final: 20 })));
    expect(respostas.map((resp) => resp.status)).toEqual([200, 200]);
    const proxima = await db('ordens_svo').where({ id: b.ordem.id }).first();
    expect(proxima.liberada_em).not.toBeNull();
    expect(proxima.status).toBe('ALOCADA');
    expect(proxima.data_hora_saida).toBeNull();
    const auditorias = await db('auditorias').where({ acao: `LIBEROU_ORDEM_SVO id=${b.ordem.id}` });
    expect(auditorias).toHaveLength(1);
  });

  it('duas finalizações concorrentes da mesma ordem não duplicam conclusão ou liberação', async () => {
    const r = await recursos();
    const [a, b] = await Promise.all([pendente(r.gestor.id), pendente(r.gestor.id)]);
    for (const item of [a, b]) await db('solicitacoes_svo').where({ id: item.solicitacao.id }).update({ status: 'EM_ANDAMENTO' });
    const comum = { veiculo_id: r.veiculo.id, motorista_id: r.motorista.id, equipe_id: r.equipe.id };
    await db('ordens_svo').where({ id: a.ordem.id }).update({ ...comum, status: 'EM_DESLOCAMENTO',
      inicio_previsto: instante(-120), fim_previsto: instante(-60), data_hora_saida: instante(-120), km_inicial: 10 });
    await db('ordens_svo').where({ id: b.ordem.id }).update({ ...comum, status: 'ALOCADA',
      inicio_previsto: instante(-20), fim_previsto: instante(40) });
    const resultados = await Promise.all([1, 2].map(() => request(app)
      .patch(`/api/viagens/${a.ordem.id}/finalizar`).set('Authorization', r.condutor.token)
      .send({ tipo_operacao: 'SVO', km_final: 20 })));
    expect(resultados.map((resp) => resp.status).sort()).toEqual([200, 400]);
    expect(await db('auditorias').where({ acao: `LIBEROU_ORDEM_SVO id=${b.ordem.id}` })).toHaveLength(1);
    expect(await db('auditorias').where('acao', 'like', `FINALIZOU_VIAGEM tipo=SVO id=${a.ordem.id} %`)).toHaveLength(1);
  });

  it('impede motorista de iniciar coleta atribuída a outra pessoa', async () => {
    const r = await recursos();
    const terceiro = await usuario('MOTORISTA_SVO');
    const item = await pendente(r.gestor.id);
    await db('solicitacoes_svo').where({ id: item.solicitacao.id }).update({ status: 'EM_ANDAMENTO' });
    await db('ordens_svo').where({ id: item.ordem.id }).update({
      veiculo_id: r.veiculo.id, motorista_id: r.motorista.id, equipe_id: r.equipe.id,
      status: 'ALOCADA', inicio_previsto: instante(-10), fim_previsto: instante(50),
    });
    const resposta = await request(app).patch(`/api/viagens/${item.ordem.id}/iniciar`)
      .set('Authorization', terceiro.token).send({ tipo_operacao: 'SVO', km_inicial: 10 });
    expect(resposta.status).toBe(403);
    const ordem = await db('ordens_svo').where({ id: item.ordem.id }).first();
    expect(ordem.status).toBe('ALOCADA');
    expect(ordem.km_inicial).toBeNull();
    expect(ordem.data_hora_saida).toBeNull();
  });

  it('permite 20 minutos exatos e reprograma a ordem preservando a identidade e a capacidade', async () => {
    const r = await recursos();
    const a = await pendente(r.gestor.id);
    const b = await pendente(r.gestor.id);
    const inicioA = instante(120);
    const fimA = new Date(inicioA.getTime() + 60 * 60_000);
    const inicioB = new Date(fimA.getTime() + 20 * 60_000);
    const fimB = new Date(inicioB.getTime() + 60 * 60_000);
    const base = { tipo_operacao: 'SVO', veiculo_id: r.veiculo.id, motorista_id: r.motorista.id, equipe_id: r.equipe.id };
    expect((await request(app).post('/api/viagens').set('Authorization', r.gestor.token)
      .send({ ...base, solicitacao_id: a.solicitacao.id, inicio_previsto: inicioA.toISOString(), fim_previsto: fimA.toISOString() })).status).toBe(200);
    const marcada = await request(app).post('/api/viagens').set('Authorization', r.gestor.token)
      .send({ ...base, solicitacao_id: b.solicitacao.id, capacidade_utilizada: 2,
        inicio_previsto: inicioB.toISOString(), fim_previsto: fimB.toISOString() });
    expect(marcada.status).toBe(200);
    const alteracao = await request(app).post(`/api/viagens/ordens-svo/${b.ordem.id}/reprogramar`)
      .set('Authorization', r.gestor.token).send({ ...base, solicitacao_id: b.solicitacao.id, capacidade_utilizada: 2,
        inicio_previsto: instante(300).toISOString(), fim_previsto: instante(360).toISOString() });
    expect(alteracao.status).toBe(200);
    const ordemAtualizada = await db('ordens_svo').where({ id: b.ordem.id }).first();
    expect(ordemAtualizada).toMatchObject({ status: 'ALOCADA', capacidade_utilizada: 2, solicitacao_id: b.solicitacao.id });
    expect(await db('ordens_svo').where({ solicitacao_id: b.solicitacao.id })).toHaveLength(1);
    expect(await db('auditorias').where('acao', 'like', `REPROGRAMOU_SVO id=${b.ordem.id} %`)).toHaveLength(1);
  });

  it('rejeita capacidade excedida e permite equipe sem escala', async () => {
    const r = await recursos();
    const ordem = await pendente(r.gestor.id);
    await db('escalas_svo').where({ equipe_id: r.equipe.id }).delete();
    const corpo = { tipo_operacao: 'SVO', solicitacao_id: ordem.solicitacao.id, veiculo_id: r.veiculo.id,
      motorista_id: r.motorista.id, equipe_id: r.equipe.id, inicio_previsto: instante(120).toISOString(),
      fim_previsto: instante(180).toISOString() };
    const semCapacidade = await request(app).post('/api/viagens').set('Authorization', r.gestor.token)
      .send({ ...corpo, capacidade_utilizada: 5 });
    expect(semCapacidade.status).toBe(400);
    expect((await db('ordens_svo').where({ id: ordem.ordem.id }).first()).status).toBe('AGUARDANDO_ALOCACAO');
    const semEscala = await request(app).post('/api/viagens').set('Authorization', r.gestor.token).send(corpo);
    expect(semEscala.status).toBe(200);
  });

  it('não soma reservas futuras à ocupação atual e mantém coleta atrasada como ocupada', async () => {
    const r = await recursos();
    const a = await pendente(r.gestor.id);
    const b = await pendente(r.gestor.id);
    const base = { tipo_operacao: 'SVO', veiculo_id: r.veiculo.id, motorista_id: r.motorista.id, equipe_id: r.equipe.id, capacidade_utilizada: 2 };
    for (const [item, inicio, fim] of [[a, 120, 180], [b, 210, 270]] as const) {
      const resp = await request(app).post('/api/viagens').set('Authorization', r.gestor.token)
        .send({ ...base, solicitacao_id: item.solicitacao.id, inicio_previsto: instante(inicio).toISOString(), fim_previsto: instante(fim).toISOString() });
      expect(resp.status).toBe(200);
    }
    let resposta = await request(app).get('/api/veiculos/svo/ocupacao').set('Authorization', r.gestor.token);
    expect(resposta.status).toBe(200);
    expect(resposta.body.find((v: { id: number }) => v.id === r.veiculo.id).capacidade_utilizada).toBe(0);
    const reducaoPermitida = await request(app).put(`/api/veiculos/${r.veiculo.id}`).set('Authorization', r.gestor.token)
      .send({ capacidade_maxima: 2 });
    expect(reducaoPermitida.status).toBe(200);
    const reducaoInvalida = await request(app).put(`/api/veiculos/${r.veiculo.id}`).set('Authorization', r.gestor.token)
      .send({ capacidade_maxima: 1 });
    expect(reducaoInvalida.status).toBe(409);
    await db('ordens_svo').where({ id: a.ordem.id }).update({
      status: 'EM_DESLOCAMENTO', inicio_previsto: instante(-120), fim_previsto: instante(-60),
      data_hora_saida: instante(-120), km_inicial: 10,
    });
    resposta = await request(app).get('/api/veiculos/svo/ocupacao').set('Authorization', r.gestor.token);
    expect(resposta.body.find((v: { id: number }) => v.id === r.veiculo.id).capacidade_utilizada).toBe(2);
  });
});
