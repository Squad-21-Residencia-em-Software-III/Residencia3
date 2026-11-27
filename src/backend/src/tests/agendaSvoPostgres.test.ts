import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';
import { auditoriaModel } from '../models/auditoriaModel';

// Este arquivo só executa no banco descartável explicitamente identificado abaixo.
const habilitado = process.env.AGENDA_SVO_POSTGRES_TESTS === '1';
const chegadaHabilitada = process.env.CHEGADA_AGENDA_SVO_POSTGRES_TESTS === '1';
const instante = (minutos: number) => new Date(Date.now() + minutos * 60_000);
const nonce = () => randomBytes(4).toString('hex');

async function usuario(perfil: 'GESTOR_SVO' | 'GESTOR_FROTA' | 'MOTORISTA_SVO' | 'MOTORISTA_FROTA' | 'INTEGRANTE_SVO') {
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
  const integrante = await usuario('INTEGRANTE_SVO');
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
  await db('equipes_svo_integrantes').insert({ equipe_id: equipe.id, usuario_id: integrante.id, vinculado_em: new Date() });
  return { gestor, condutor, integrante, veiculo, motorista, equipe };
}

function payloadSvo(r: Awaited<ReturnType<typeof recursos>>, solicitacaoId: number, integrantes = [r.integrante.id]) {
  return { tipo_operacao: 'SVO', solicitacao_id: solicitacaoId, veiculo_id: r.veiculo.id,
    motorista_id: r.motorista.id, equipe_id: r.equipe.id, integrantes_ids: integrantes,
    inicio_previsto: instante(120).toISOString(), fim_previsto: instante(180).toISOString() };
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

describe.skipIf(!habilitado)('Agenda SVO com PostgreSQL isolado e HTTP autenticado', () => {
  beforeAll(async () => {
    const porta = process.env.POSTGRES_SVO_TEST_PORT ?? '55432';
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_PORT !== porta ||
        process.env.POSTGRES_DB !== 'fsph_agenda_svo_teste') throw new Error('Banco de teste não autorizado');
    const resultado = await db.raw('SELECT current_database() AS db, inet_server_addr()::text AS endereco, inet_server_port() AS porta');
    const ip = process.env.POSTGRES_TEST_CONTAINER_IP ?? '127.0.0.1';
    if (!/^(127\.|172\.(1[6-9]|2\d|3[01])\.|10\.|192\.168\.)/.test(ip)) throw new Error('IP de teste não privado');
    expect(resultado.rows[0]).toMatchObject({ db: 'fsph_agenda_svo_teste', endereco: `${ip}/32`, porta: Number(porta) });
  });
  afterAll(async () => { await db.destroy(); });

  it('serializa reservas concorrentes do mesmo recurso e mantém uma ordem pendente', async () => {
    const r = await recursos();
    const [a, b] = await Promise.all([pendente(r.gestor.id), pendente(r.gestor.id)]);
    const corpo = { tipo_operacao: 'SVO', veiculo_id: r.veiculo.id, motorista_id: r.motorista.id,
      equipe_id: r.equipe.id, integrantes_ids: [r.integrante.id], inicio_previsto: instante(120).toISOString(), fim_previsto: instante(180).toISOString() };
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
    const base = { tipo_operacao: 'SVO', veiculo_id: r.veiculo.id, motorista_id: r.motorista.id, equipe_id: r.equipe.id, integrantes_ids: [r.integrante.id], capacidade_utilizada: 2 };
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
    const indevida = await request(app).patch(`/api/viagens/${d.ordem.id}/finalizar`)
      .set('Authorization', r1.condutor.token).send({ tipo_operacao: 'SVO', km_final: 20 });
    expect(indevida.status).toBe(403);
    expect((await db('ordens_svo').where({ id: d.ordem.id }).first()).status).toBe(status);
    const respostas = await Promise.all([{ item: a, token: r1.condutor.token }, { item: d, token: r2.condutor.token }].map(({ item, token }) =>
      request(app).patch(`/api/viagens/${item.ordem.id}/finalizar`).set('Authorization', token)
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

  it('permite 20 minutos exatos e reprograma a ordem preservando identidade, capacidade e designação', async () => {
    const r = await recursos();
    const a = await pendente(r.gestor.id);
    const b = await pendente(r.gestor.id);
    const inicioA = instante(120);
    const fimA = new Date(inicioA.getTime() + 60 * 60_000);
    const inicioB = new Date(fimA.getTime() + 20 * 60_000);
    const fimB = new Date(inicioB.getTime() + 60 * 60_000);
    const base = { tipo_operacao: 'SVO', veiculo_id: r.veiculo.id, motorista_id: r.motorista.id, equipe_id: r.equipe.id, integrantes_ids: [r.integrante.id] };
    expect((await request(app).post('/api/viagens').set('Authorization', r.gestor.token)
      .send({ ...base, solicitacao_id: a.solicitacao.id, inicio_previsto: inicioA.toISOString(), fim_previsto: fimA.toISOString() })).status).toBe(200);
    const marcada = await request(app).post('/api/viagens').set('Authorization', r.gestor.token)
      .send({ ...base, solicitacao_id: b.solicitacao.id, capacidade_utilizada: 2,
        inicio_previsto: inicioB.toISOString(), fim_previsto: fimB.toISOString() });
    expect(marcada.status).toBe(200);
    const designacoes = () => db('ordens_svo_integrantes').where({ ordem_id: b.ordem.id })
      .select('id', 'usuario_id', 'revogado_em').orderBy('id');
    const participantesAntes = await designacoes();
    expect(participantesAntes).toEqual([
      expect.objectContaining({ usuario_id: r.integrante.id, revogado_em: null }),
    ]);
    const alteracao = await request(app).post(`/api/viagens/ordens-svo/${b.ordem.id}/reprogramar`)
      .set('Authorization', r.gestor.token).send({ ...base, integrantes_ids: undefined,
        solicitacao_id: b.solicitacao.id, capacidade_utilizada: 2,
        inicio_previsto: instante(300).toISOString(), fim_previsto: instante(360).toISOString() });
    expect(alteracao.status).toBe(200);
    expect(await designacoes()).toEqual(participantesAntes);
    const ordemAtualizada = await db('ordens_svo').where({ id: b.ordem.id }).first();
    expect(ordemAtualizada).toMatchObject({ status: 'ALOCADA', capacidade_utilizada: 2, solicitacao_id: b.solicitacao.id });
    expect(await db('ordens_svo').where({ solicitacao_id: b.solicitacao.id })).toHaveLength(1);
    expect(await db('auditorias').where('acao', 'like', `REPROGRAMOU_SVO id=${b.ordem.id} %`)).toHaveLength(1);
  });

  it('aceita equipe sem escala e recusa capacidade acima do veículo', async () => {
    const r = await recursos();
    const ordem = await pendente(r.gestor.id);
    await db('escalas_svo').where({ equipe_id: r.equipe.id }).delete();
    const corpo = { tipo_operacao: 'SVO', solicitacao_id: ordem.solicitacao.id, veiculo_id: r.veiculo.id,
      motorista_id: r.motorista.id, equipe_id: r.equipe.id, integrantes_ids: [r.integrante.id], inicio_previsto: instante(120).toISOString(),
      fim_previsto: instante(180).toISOString() };
    const semCapacidade = await request(app).post('/api/viagens').set('Authorization', r.gestor.token)
      .send({ ...corpo, equipe_id: null, integrantes_ids: [], capacidade_utilizada: 5 });
    expect(semCapacidade.status).toBe(400);
    expect((await db('ordens_svo').where({ id: ordem.ordem.id }).first()).status).toBe('AGUARDANDO_ALOCACAO');
    const semEscala = await request(app).post('/api/viagens').set('Authorization', r.gestor.token).send(corpo);
    expect(semEscala.status).toBe(200);
  });

  it('não soma reservas futuras à ocupação atual e mantém coleta atrasada como ocupada', async () => {
    const r = await recursos();
    const a = await pendente(r.gestor.id);
    const b = await pendente(r.gestor.id);
    const base = { tipo_operacao: 'SVO', veiculo_id: r.veiculo.id, motorista_id: r.motorista.id, equipe_id: r.equipe.id, integrantes_ids: [r.integrante.id], capacidade_utilizada: 2 };
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

  it('serializa designações do mesmo integrante com equipes, veículos e motoristas distintos', async () => {
    const alfa = await recursos();
    const beta = await recursos();
    const vinculo = await request(app).put(`/api/equipes-svo/${beta.equipe.id}/integrantes/${alfa.integrante.id}`)
      .set('Authorization', beta.gestor.token);
    expect(vinculo.status).toBe(204);
    const a = await pendente(alfa.gestor.id);
    const b = await pendente(beta.gestor.id);
    const respostas = await Promise.all([{ r: alfa, coleta: a }, { r: beta, coleta: b }].map(({ r, coleta }) =>
      request(app).post('/api/viagens').set('Authorization', r.gestor.token)
        .send(payloadSvo(r, coleta.solicitacao.id, [alfa.integrante.id]))));
    expect(respostas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(respostas.find((r) => r.status === 409)?.body.codigo).toBe('CONFLITO_AGENDA');
    const designacoes = await db('ordens_svo_integrantes').whereIn('ordem_id', [a.ordem.id, b.ordem.id]);
    expect(designacoes).toHaveLength(1);
    expect(designacoes[0].usuario_id).toBe(alfa.integrante.id);
  });

  it('bloqueia desvinculação pendente e revogação após início, preservando a consulta pessoal após conclusão', async () => {
    const r = await recursos();
    const a = await pendente(r.gestor.id);
    const dados = payloadSvo(r, a.solicitacao.id);
    const agendada = await request(app).post('/api/viagens').set('Authorization', r.gestor.token).send(dados);
    expect(agendada.status).toBe(200);
    const desvincular = () => request(app).delete(`/api/equipes-svo/${r.equipe.id}/integrantes/${r.integrante.id}`).set('Authorization', r.gestor.token);
    expect((await desvincular()).status).toBe(409);
    await db('ordens_svo').where({ id: a.ordem.id }).update({ inicio_previsto: instante(-30), fim_previsto: instante(30) });
    const iniciar = await request(app).patch(`/api/viagens/${a.ordem.id}/iniciar`)
      .set('Authorization', r.condutor.token).send({ tipo_operacao: 'SVO', km_inicial: 10 });
    expect(iniciar.status).toBe(200);
    const revogar = await request(app).post(`/api/viagens/ordens-svo/${a.ordem.id}/reprogramar`)
      .set('Authorization', r.gestor.token).send({ ...dados, equipe_id: null, integrantes_ids: [] });
    expect(revogar.status).toBe(409);
    const finalizar = await request(app).patch(`/api/viagens/${a.ordem.id}/finalizar`)
      .set('Authorization', r.condutor.token).send({ tipo_operacao: 'SVO', km_final: 20 });
    expect(finalizar.status).toBe(200);
    expect((await desvincular()).status).toBe(204);
    const minha = await request(app).get('/api/viagens/coletas-svo/minhas').set('Authorization', r.integrante.token);
    expect(minha.status).toBe(200);
    expect(minha.body.dados).toContainEqual(expect.objectContaining({ id: a.ordem.id, status: 'CONCLUIDA' }));
    expect(await db('ordens_svo_integrantes').where({ ordem_id: a.ordem.id, usuario_id: r.integrante.id }).whereNull('revogado_em')).toHaveLength(1);
  });

  it('reverte a troca de participantes e o horário se a transação falhar após as gravações', async () => {
    const r = await recursos();
    const a = await pendente(r.gestor.id);
    const outro = await usuario('INTEGRANTE_SVO');
    expect((await request(app).put(`/api/equipes-svo/${r.equipe.id}/integrantes/${outro.id}`)
      .set('Authorization', r.gestor.token)).status).toBe(204);
    const dados = payloadSvo(r, a.solicitacao.id);
    expect((await request(app).post('/api/viagens').set('Authorization', r.gestor.token).send(dados)).status).toBe(200);
    const antes = await db('ordens_svo').where({ id: a.ordem.id }).first();
    const registrar = auditoriaModel.registrar.bind(auditoriaModel);
    const falha = vi.spyOn(auditoriaModel, 'registrar').mockImplementation((registro, conn) => {
      if (registro.acao.startsWith(`REPROGRAMOU_SVO id=${a.ordem.id} `)) throw new Error('Falha induzida após gravações da reprogramação');
      return registrar(registro, conn);
    });
    try {
      const resposta = await request(app).post(`/api/viagens/ordens-svo/${a.ordem.id}/reprogramar`)
        .set('Authorization', r.gestor.token).send({ ...dados, integrantes_ids: [outro.id],
          inicio_previsto: instante(240).toISOString(), fim_previsto: instante(300).toISOString() });
      expect(resposta.status).toBe(500);
      expect(falha.mock.calls.some(([registro]) => registro.acao.startsWith(`REPROGRAMOU_SVO id=${a.ordem.id} `))).toBe(true);
    } finally {
      falha.mockRestore();
    }
    expect(await db('ordens_svo').where({ id: a.ordem.id }).first()).toMatchObject({ inicio_previsto: antes.inicio_previsto, fim_previsto: antes.fim_previsto });
    expect(await db('ordens_svo_integrantes').where({ ordem_id: a.ordem.id })).toEqual([
      expect.objectContaining({ usuario_id: r.integrante.id, revogado_em: null }),
    ]);
  });

  it('permite concluir ordem legada de equipe sem atribuir participação individual', async () => {
    const r = await recursos();
    const a = await pendente(r.gestor.id);
    await db('solicitacoes_svo').where({ id: a.solicitacao.id }).update({ status: 'EM_ANDAMENTO' });
    await db('ordens_svo').where({ id: a.ordem.id }).update({
      equipe_id: r.equipe.id, veiculo_id: r.veiculo.id, motorista_id: r.motorista.id,
      status: 'ALOCADA', inicio_previsto: instante(-20), fim_previsto: instante(40),
    });
    const atual = await request(app).get(`/api/viagens/ordens-svo/${a.ordem.id}/designacoes`).set('Authorization', r.gestor.token);
    expect(atual.status).toBe(200);
    expect(atual.body).toEqual({ equipe_id: r.equipe.id, iniciada: false, integrantes_ids: [] });
    const reprogramar = await request(app).post(`/api/viagens/ordens-svo/${a.ordem.id}/reprogramar`)
      .set('Authorization', r.gestor.token).send(payloadSvo(r, a.solicitacao.id, []));
    expect(reprogramar.status).toBe(400);
    expect((await request(app).patch(`/api/viagens/${a.ordem.id}/iniciar`).set('Authorization', r.condutor.token)
      .send({ tipo_operacao: 'SVO', km_inicial: 10 })).status).toBe(200);
    expect((await request(app).patch(`/api/viagens/${a.ordem.id}/finalizar`).set('Authorization', r.condutor.token)
      .send({ tipo_operacao: 'SVO', km_final: 20 })).status).toBe(200);
    const minhas = await request(app).get('/api/viagens/coletas-svo/minhas').set('Authorization', r.integrante.token);
    expect(minhas.status).toBe(200);
    expect(minhas.body.dados).not.toContainEqual(expect.objectContaining({ id: a.ordem.id }));
    expect(await db('ordens_svo_integrantes').where({ ordem_id: a.ordem.id })).toEqual([]);
  });

  it('rejeita cabine insuficiente e preserva apenas a nova designação após revogação pré-início', async () => {
    const r = await recursos();
    const maria = r.integrante;
    const joao = await usuario('INTEGRANTE_SVO');
    expect((await request(app).put(`/api/equipes-svo/${r.equipe.id}/integrantes/${joao.id}`)
      .set('Authorization', r.gestor.token)).status).toBe(204);
    const a = await pendente(r.gestor.id);
    const dados = payloadSvo(r, a.solicitacao.id, [maria.id, joao.id]);
    await db('veiculos').where({ id: r.veiculo.id }).update({ lotacao_cabine: 2 });
    const agendar = () => request(app).post('/api/viagens').set('Authorization', r.gestor.token).send(dados);
    expect((await agendar()).status).toBe(409);
    expect(await db('ordens_svo_integrantes').where({ ordem_id: a.ordem.id })).toHaveLength(0);

    await db('veiculos').where({ id: r.veiculo.id }).update({ lotacao_cabine: 3 });
    expect((await agendar()).status).toBe(200);
    const resposta = await request(app).post(`/api/viagens/ordens-svo/${a.ordem.id}/reprogramar`)
      .set('Authorization', r.gestor.token).send({ ...dados, integrantes_ids: [joao.id] });
    expect(resposta.status).toBe(200);
    const designacoes = await db('ordens_svo_integrantes').where({ ordem_id: a.ordem.id });
    expect(designacoes).toHaveLength(2);
    expect(designacoes.find((d) => d.usuario_id === maria.id)).toMatchObject({
      revogado_em: expect.any(Date), revogado_por: r.gestor.id,
    });
    expect(designacoes.find((d) => d.usuario_id === joao.id)).toMatchObject({ revogado_em: null });
    const minhas = await request(app).get('/api/viagens/coletas-svo/minhas').set('Authorization', maria.token);
    expect(minhas.status).toBe(200);
    expect(minhas.body.dados).not.toContainEqual(expect.objectContaining({ id: a.ordem.id }));
  });

  it.skipIf(!chegadaHabilitada)('mantém a coleta visível e Maria ocupada entre equipes após chegada e até conclusão real', async () => {
    const alfa = await recursos();
    const beta = await recursos();
    const maria = alfa.integrante;
    expect((await request(app).put(`/api/equipes-svo/${beta.equipe.id}/integrantes/${maria.id}`)
      .set('Authorization', beta.gestor.token)).status).toBe(204);

    const a = await pendente(alfa.gestor.id);
    const b = await pendente(beta.gestor.id);
    const c = await pendente(beta.gestor.id);
    const dadosBeta = payloadSvo(beta, b.solicitacao.id, [maria.id]);
    const agendar = (token: string, dados: ReturnType<typeof payloadSvo>) =>
      request(app).post('/api/viagens').set('Authorization', token).send(dados);
    expect((await agendar(alfa.gestor.token, payloadSvo(alfa, a.solicitacao.id))).status).toBe(200);
    expect((await agendar(beta.gestor.token, { ...dadosBeta,
      inicio_previsto: instante(240).toISOString(), fim_previsto: instante(300).toISOString() })).status).toBe(200);

    await db('ordens_svo').where({ id: a.ordem.id }).update({
      inicio_previsto: instante(-60), fim_previsto: instante(-5),
    });
    // A reserva B só vence após A iniciar, de modo que a fila não inverta a prioridade do cenário.
    await db('ordens_svo').where({ id: b.ordem.id }).update({ inicio_previsto: instante(5), fim_previsto: instante(30) });
    expect((await request(app).patch(`/api/viagens/${a.ordem.id}/iniciar`)
      .set('Authorization', alfa.condutor.token).send({ tipo_operacao: 'SVO', km_inicial: 10 })).status).toBe(200);
    await db('ordens_svo').where({ id: b.ordem.id }).update({ inicio_previsto: instante(-2) });

    const minhas = () => request(app).get('/api/viagens/coletas-svo/minhas').set('Authorization', maria.token);
    const emDeslocamento = await minhas();
    expect(emDeslocamento.status).toBe(200);
    expect(emDeslocamento.body.dados).toContainEqual(expect.objectContaining({ id: a.ordem.id, status: 'EM_DESLOCAMENTO' }));
    const chegada = (token: string) => request(app).patch(`/api/viagens/ordens-svo/${a.ordem.id}/chegar-local`).set('Authorization', token);
    expect((await chegada(maria.token)).status).toBe(403);
    const noLocal = await chegada(alfa.condutor.token);
    expect(noLocal.status).toBe(200);
    expect(noLocal.body.status).toBe('NO_LOCAL');
    const noLocalPessoal = await minhas();
    expect(noLocalPessoal.status).toBe(200);
    expect(noLocalPessoal.body.dados).toContainEqual(expect.objectContaining({
      id: a.ordem.id, status: 'NO_LOCAL', data_hora_conclusao: null,
    }));

    const ocupacao = await request(app).get('/api/veiculos/svo/ocupacao').set('Authorization', alfa.gestor.token);
    expect(ocupacao.status).toBe(200);
    expect(ocupacao.body).toContainEqual(expect.objectContaining({ id: alfa.veiculo.id, capacidade_utilizada: 1 }));
    const equipes = await request(app).get('/api/equipes-svo/disponibilidade')
      .query({ inicio: instante(60).toISOString(), fim: instante(90).toISOString() }).set('Authorization', alfa.gestor.token);
    expect(equipes.status).toBe(200);
    expect(equipes.body.equipes).not.toContainEqual(expect.objectContaining({ id: alfa.equipe.id }));

    const dadosC = payloadSvo(beta, c.solicitacao.id, [maria.id]);
    const disponibilidade = await request(app).get(`/api/equipes-svo/${beta.equipe.id}/integrantes/disponibilidade`)
      .query({ inicio: dadosC.inicio_previsto, fim: dadosC.fim_previsto }).set('Authorization', beta.gestor.token);
    expect(disponibilidade.status).toBe(200);
    expect(disponibilidade.body).toContainEqual(expect.objectContaining({ id: maria.id, disponivel: false }));
    const conflito = await agendar(beta.gestor.token, dadosC);
    expect(conflito.status).toBe(409);
    expect(conflito.body).toMatchObject({ codigo: 'CONFLITO_AGENDA', erro: expect.stringContaining('integrante') });
    const fila = await request(app).get('/api/viagens/ordens-svo/alertas').set('Authorization', beta.gestor.token);
    expect(fila.status).toBe(200);
    expect(await db('ordens_svo').where({ id: b.ordem.id }).first()).toMatchObject({ status: 'ALOCADA', liberada_em: null });

    const finalizada = await request(app).patch(`/api/viagens/${a.ordem.id}/finalizar`)
      .set('Authorization', alfa.condutor.token).send({ tipo_operacao: 'SVO', km_final: 20 });
    expect(finalizada.status).toBe(200);
    expect(await db('ordens_svo').where({ id: a.ordem.id }).first()).toMatchObject({
      status: 'CONCLUIDA', data_hora_conclusao: expect.any(Date),
    });
    expect(await db('veiculos').where({ id: alfa.veiculo.id }).first()).toMatchObject({ status: 'DISPONIVEL' });
    expect(await db('motoristas').where({ id: alfa.motorista.id }).first()).toMatchObject({ status: 'DISPONIVEL' });
    expect(await db('ordens_svo').where({ id: b.ordem.id }).first()).toMatchObject({
      status: 'ALOCADA', liberada_em: expect.any(Date), data_hora_saida: null,
    });
    expect((await agendar(beta.gestor.token, dadosC)).status).toBe(200);
  });
});
