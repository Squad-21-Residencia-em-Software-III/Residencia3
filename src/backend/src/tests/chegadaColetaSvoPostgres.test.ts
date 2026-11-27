import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';
import { travarAgendaSvo } from '../services/agendaSvoService';
import { reavaliarFilaSvo } from '../services/filaSvoService';
import { manutencaoService, recalcularStatusVeiculo } from '../services/manutencaoService';

const habilitado = process.env.CHEGADA_COLETA_SVO_POSTGRES_TESTS === '1';
const chave = () => randomBytes(5).toString('hex');
const instante = (minutos: number) => new Date(Date.now() + minutos * 60_000);

async function usuario(perfil = 'MOTORISTA_SVO') {
  const [u] = await db('usuarios').insert({ nome: 'Teste Chegada SVO', email: `${chave()}@testes.invalid`,
    senha: 'hash-local', perfil, tipo_usuario: perfil.startsWith('MOTORISTA') ? 'MOTORISTA' : perfil }).returning('*');
  if (perfil === 'GESTOR_SVO') {
    const unidade = await db('unidades').where({ nome: 'SVO' }).first();
    await db('gestores_unidades').insert({ unidade_id: unidade.id, usuario_id: u.id });
  }
  const token = jwt.sign({ typ: 'access', perfil, sv: u.versao_sessao, sessao_exp: Math.floor(Date.now() / 1000) + 3600 },
    env.jwtSecret, { algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web',
      subject: String(u.id), expiresIn: 1800 });
  return { ...u, token: `Bearer ${token}` };
}

async function recursos() {
  const condutor = await usuario();
  const [veiculo] = await db('veiculos').insert({ placa: chave().slice(0, 7), modelo: 'Chegada SVO', tipo_frota: 'SVO',
    capacidade_maxima: 4, lotacao_cabine: 3, km_atual: 1000, status: 'DISPONIVEL' }).returning('*');
  const [motorista] = await db('motoristas').insert({ usuario_id: condutor.id, numero_cnh: chave(),
    categoria_cnh: 'B', validade_cnh: '2099-12-31', tipo_motorista: 'SVO', status: 'DISPONIVEL' }).returning('*');
  const [equipe] = await db('equipes_svo').insert({ nome_equipe: `Chegada SVO ${chave()}` }).returning('*');
  return { condutor, veiculo, motorista, equipe };
}
type Recursos = Awaited<ReturnType<typeof recursos>>;

async function ordem(r: Recursos, status = 'EM_DESLOCAMENTO', inicio = -120, fim = -60) {
  const [s] = await db('solicitacoes_svo').insert({ registrante_id: r.condutor.id, dados_solicitante: 'Teste',
    local_ocorrencia: 'Local Chegada SVO', status: 'EM_ANDAMENTO', confirmado_por: r.condutor.id, confirmado_em: new Date() }).returning('*');
  const [o] = await db('ordens_svo').insert({ solicitacao_id: s.id, status, veiculo_id: r.veiculo.id,
    motorista_id: r.motorista.id, equipe_id: r.equipe.id, capacidade_utilizada: 1,
    inicio_previsto: instante(inicio), fim_previsto: instante(fim),
    ...(status === 'ALOCADA' ? {} : { km_inicial: 1000, data_hora_saida: instante(inicio) }) }).returning('*');
  return o;
}
const chegar = (id: number, token: string) => request(app).patch(`/api/viagens/ordens-svo/${id}/chegar-local`).set('Authorization', token);
const finalizar = (id: number, token: string) => request(app).patch(`/api/viagens/${id}/finalizar`)
  .set('Authorization', token).send({ tipo_operacao: 'SVO', km_final: 1010 });
const fila = (id: number) => db.transaction(async (trx) => { await travarAgendaSvo(trx); await reavaliarFilaSvo(trx, id); });

describe.skipIf(!habilitado)('Chegada SVO com PostgreSQL descartável e autenticação real', () => {
  beforeAll(async () => {
    const porta = process.env.POSTGRES_SVO_TEST_PORT ?? '55432';
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_PORT !== porta ||
        process.env.POSTGRES_DB !== 'fsph_agenda_svo_teste') throw new Error('Banco Chegada SVO não autorizado');
    const { rows } = await db.raw('SELECT current_database() AS db, inet_server_addr()::text AS host, inet_server_port() AS port');
    const ip = process.env.POSTGRES_TEST_CONTAINER_IP ?? '127.0.0.1';
    if (!/^(127\.|172\.(1[6-9]|2\d|3[01])\.|10\.|192\.168\.)/.test(ip)) throw new Error('IP de teste não privado');
    expect(rows[0]).toMatchObject({ db: 'fsph_agenda_svo_teste', host: `${ip}/32`, port: Number(porta) });
  });
  afterAll(async () => { await db.destroy(); });

  it('serializa chegadas repetidas, preserva campos, designações e contrato GET e conclui uma única vez', async () => {
    const r = await recursos();
    const o = await ordem(r);
    const integrante = await usuario('INTEGRANTE_SVO');
    await db('equipes_svo_integrantes').insert({ equipe_id: r.equipe.id, usuario_id: integrante.id });
    await db('ordens_svo_integrantes').insert({ ordem_id: o.id, equipe_id: r.equipe.id,
      usuario_id: integrante.id, designado_por: r.condutor.id });
    const designacoes = await db('ordens_svo_integrantes').where({ ordem_id: o.id });
    const respostas = await Promise.all([chegar(o.id, r.condutor.token), chegar(o.id, r.condutor.token)]);
    expect(respostas.map((x) => x.status).sort()).toEqual([200, 409]);
    const atual = await db('ordens_svo').where({ id: o.id }).first();
    expect(atual).toEqual({ ...o, status: 'NO_LOCAL' });
    const lista = await request(app).get('/api/viagens').set('Authorization', r.condutor.token);
    expect(lista.status).toBe(200);
    expect(respostas.find((x) => x.status === 200)!.body).toEqual(lista.body.find((x: { id: number }) => x.id === o.id));
    expect(await db('auditorias').where({ acao: `CHEGOU_LOCAL_SVO id=${o.id}` })).toHaveLength(1);
    expect(await db('ordens_svo_integrantes').where({ ordem_id: o.id })).toEqual(designacoes);
    const conclusoes = await Promise.all([finalizar(o.id, r.condutor.token), finalizar(o.id, r.condutor.token)]);
    expect(conclusoes.map((x) => x.status).sort()).toEqual([200, 400]);
    expect(await db('auditorias').where('acao', 'like', `FINALIZOU_VIAGEM tipo=SVO id=${o.id} %`)).toHaveLength(1);
    expect((await db('solicitacoes_svo').where({ id: o.solicitacao_id }).first()).status).toBe('CONCLUIDA');
    expect(await db('ordens_svo_integrantes').where({ ordem_id: o.id })).toEqual(designacoes);
  });

  it.each(['ALOCADA', 'NO_LOCAL', 'CONCLUIDA', 'CANCELADA'])('rejeita chegada em %s sem qualquer gravação', async (status) => {
    const r = await recursos(); const o = await ordem(r, status);
    expect((await chegar(o.id, r.condutor.token)).status).toBe(409);
    expect(await db('ordens_svo').where({ id: o.id }).first()).toEqual(o);
    expect(await db('auditorias').where({ acao: `CHEGOU_LOCAL_SVO id=${o.id}` })).toHaveLength(0);
  });

  it.each(['ADMINISTRADOR', 'GESTOR_SVO', 'GESTOR_FROTA', 'MOTORISTA_FROTA', 'SOLICITANTE', 'MOTORISTA_SVO', 'INTEGRANTE_SVO'])(
    'nega ao perfil/usuário alheio %s todas as ações sem mutações', async (perfil) => {
      const r = await recursos(); const o = await ordem(r); const outro = await usuario(perfil);
      const s = await db('solicitacoes_svo').where({ id: o.solicitacao_id }).first();
      expect((await chegar(o.id, outro.token)).status).toBe(403);
      expect((await finalizar(o.id, outro.token)).status).toBe(403);
      expect((await request(app).patch(`/api/viagens/${o.id}/iniciar`).set('Authorization', outro.token)
        .send({ tipo_operacao: 'SVO', km_inicial: 1000 })).status).toBe(403);
      expect(await db('ordens_svo').where({ id: o.id }).first()).toEqual(o);
      expect(await db('solicitacoes_svo').where({ id: o.solicitacao_id }).first()).toEqual(s);
      expect(await db('veiculos').where({ id: r.veiculo.id }).first()).toEqual(r.veiculo);
      expect(await db('auditorias').where({ usuario_id: outro.id })).toHaveLength(0);
    });

  it('retorna 401/400/404 para autenticação, ID inválido e ordem inexistente', async () => {
    const r = await recursos();
    expect((await request(app).patch('/api/viagens/ordens-svo/1/chegar-local')).status).toBe(401);
    expect((await chegar(0, r.condutor.token)).status).toBe(400);
    expect((await chegar(2147483647, r.condutor.token)).status).toBe(404);
  });

  it.each(['veiculo', 'motorista', 'equipe', 'integrante'])('mantém %s ocupado em NO_LOCAL até conclusão real', async (recurso) => {
    const a = await recursos(); const b = await recursos();
    if (recurso === 'veiculo') b.veiculo = a.veiculo;
    if (recurso === 'motorista') b.motorista = a.motorista;
    if (recurso === 'equipe') b.equipe = a.equipe;
    const ativa = await ordem(a, 'NO_LOCAL'); const proxima = await ordem(b, 'ALOCADA', -40, 30);
    const posterior = await ordem(b, 'ALOCADA', -40, 45);
    await db('ordens_svo').where({ id: posterior.id }).update({ inicio_previsto: proxima.inicio_previsto });
    if (recurso === 'integrante') {
      const u = await usuario('INTEGRANTE_SVO');
      for (const e of [a.equipe, b.equipe]) await db('equipes_svo_integrantes').insert({ equipe_id: e.id, usuario_id: u.id });
      for (const o of [ativa, proxima, posterior]) await db('ordens_svo_integrantes').insert({
        ordem_id: o.id, equipe_id: o.equipe_id, usuario_id: u.id, designado_por: a.condutor.id });
    }
    await Promise.all([fila(a.condutor.id), fila(a.condutor.id)]);
    expect((await db('ordens_svo').where({ id: proxima.id }).first()).liberada_em).toBeNull();
    expect(await db('alertas_atraso_svo').where({ ordem_em_atraso_id: ativa.id, ordem_afetada_id: proxima.id })).toHaveLength(1);
    expect((await finalizar(ativa.id, a.condutor.token)).status).toBe(200);
    await Promise.all([fila(a.condutor.id), fila(a.condutor.id)]);
    const liberada = await db('ordens_svo').where({ id: proxima.id }).first();
    expect(liberada.liberada_em).not.toBeNull();
    expect(liberada).toMatchObject({ status: 'ALOCADA', km_inicial: null, data_hora_saida: null });
    expect((await db('ordens_svo').where({ id: posterior.id }).first()).liberada_em).toBeNull();
    expect(await db('auditorias').where({ acao: `LIBEROU_ORDEM_SVO id=${proxima.id}` })).toHaveLength(1);
  });

  it('não libera equipe nem manutenção com coleta NO_LOCAL dentro do período previsto', async () => {
    const r = await recursos(); await ordem(r, 'NO_LOCAL', -10, 60);
    const proxima = await ordem(r, 'ALOCADA', -5, 90);
    await fila(r.condutor.id);
    expect((await db('ordens_svo').where({ id: proxima.id }).first()).liberada_em).toBeNull();
    await db.transaction((trx) => recalcularStatusVeiculo(trx, r.veiculo.id));
    expect((await db('veiculos').where({ id: r.veiculo.id }).first()).status).toBe('EM_USO');
    await expect(manutencaoService.criar({ veiculo_id: r.veiculo.id, tipo_manutencao: 'PREVENTIVA',
      data_manutencao: '2099-01-01', status: 'EM_ANDAMENTO' }, r.condutor.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(await db('manutencoes').where({ veiculo_id: r.veiculo.id })).toHaveLength(0);
    const gestor = await usuario('GESTOR_SVO');
    const consulta = await request(app).get(`/api/equipes-svo/disponibilidade?inicio=${instante(1).toISOString()}&fim=${instante(20).toISOString()}`)
      .set('Authorization', gestor.token);
    expect(consulta.status).toBe(200);
    expect(consulta.body.equipes.some((e: { id: number }) => e.id === r.equipe.id)).toBe(false);
  });

  it('reprograma sem escalas preservando designações, cabine, equipe e conflitos individuais', async () => {
    const a = await recursos(); const b = await recursos();
    const ativa = await ordem(a, 'NO_LOCAL', -10, 60);
    const futura = await ordem(b, 'ALOCADA', 90, 120);
    const u = await usuario('INTEGRANTE_SVO'); const gestor = await usuario('GESTOR_SVO');
    for (const e of [a.equipe, b.equipe]) await db('equipes_svo_integrantes').insert({ equipe_id: e.id, usuario_id: u.id });
    for (const o of [ativa, futura]) await db('ordens_svo_integrantes').insert({ ordem_id: o.id,
      equipe_id: o.equipe_id, usuario_id: u.id, designado_por: gestor.id });
    const designacoes = await db('ordens_svo_integrantes').where({ ordem_id: futura.id });
    const corpo = { tipo_operacao: 'SVO', solicitacao_id: futura.solicitacao_id, veiculo_id: b.veiculo.id,
      motorista_id: b.motorista.id, equipe_id: b.equipe.id, capacidade_utilizada: 1,
      inicio_previsto: instante(90).toISOString(), fim_previsto: instante(120).toISOString() };
    const reprogramar = (alteracao = {}) => request(app).post(`/api/viagens/ordens-svo/${futura.id}/reprogramar`)
      .set('Authorization', gestor.token).send({ ...corpo, ...alteracao });
    expect((await reprogramar({ inicio_previsto: instante(30).toISOString() })).status).toBe(409);
    expect((await reprogramar()).status).toBe(200); // Reserva futura compatível não é bloqueada pela ocupação atual.
    // Trocar de equipe exige informar nominalmente os integrantes; esses integrantes passam pela agenda.
    expect((await reprogramar({ equipe_id: a.equipe.id })).status).toBe(400);
    const choqueNaEquipe = await reprogramar({
      equipe_id: a.equipe.id, integrantes_ids: [u.id], inicio_previsto: instante(30).toISOString(),
    });
    expect(choqueNaEquipe.status).toBe(409);
    expect(choqueNaEquipe.body.codigo).toBe('CONFLITO_AGENDA');
    await db('veiculos').where({ id: b.veiculo.id }).update({ lotacao_cabine: 1 });
    expect((await reprogramar()).status).toBe(409);
    await db('veiculos').where({ id: b.veiculo.id }).update({ lotacao_cabine: 3 });
    await db('ordens_svo').where({ id: ativa.id }).update({ fim_previsto: instante(-1) });
    expect((await reprogramar()).status).toBe(409); // Atraso mantém a ocupação efetiva do integrante.
    expect(await db('ordens_svo_integrantes').where({ ordem_id: futura.id })).toEqual(designacoes);
    expect((await finalizar(ativa.id, a.condutor.token)).status).toBe(200);
    expect((await reprogramar()).status).toBe(200);
  });

  it('valida migrations sobre legado, constraints, índices e rollback protegido em schema isolado', async () => {
    const trx = await db.transaction();
    try {
      const schema = `chegada_svo_${chave()}`;
      await trx.raw('CREATE SCHEMA ??', [schema]);
      await trx.raw('SET LOCAL search_path TO ??', [schema]);
      const pasta = path.resolve(__dirname, '../../database/migrations');
      const nomes = (await readdir(pasta)).filter((n) => n.endsWith('.js')).sort();
      const primeira = '20261117220000_bl31_status_coleta_svo.js';
      const segunda = '20261118010000_bl31_indices_status_no_local.js';
      for (const nome of nomes.filter((n) => n < primeira)) await require(path.join(pasta, nome)).up(trx);
      // IDs não são globais: o legado desta validação é criado no schema da transação.
      const [u] = await trx('usuarios').insert({ nome: 'Legado', email: 'legado@testes.invalid', senha: 'hash',
        tipo_usuario: 'MOTORISTA', perfil: 'MOTORISTA_SVO' }).returning('*');
      const [v] = await trx('veiculos').insert({ placa: 'LEG1234', modelo: 'Legado', tipo_frota: 'SVO', capacidade_maxima: 4 }).returning('*');
      const [m] = await trx('motoristas').insert({ usuario_id: u.id, numero_cnh: '12345678901', categoria_cnh: 'B',
        validade_cnh: '2099-12-31', tipo_motorista: 'SVO' }).returning('*');
      const [s] = await trx('solicitacoes_svo').insert({ registrante_id: u.id, dados_solicitante: 'Legado',
        local_ocorrencia: 'Local', status: 'EM_ANDAMENTO' }).returning('*');
      const [o] = await trx('ordens_svo').insert({ solicitacao_id: s.id, status: 'EM_DESLOCAMENTO',
        veiculo_id: v.id, motorista_id: m.id, capacidade_utilizada: 1, km_inicial: 1000 }).returning('*');
      for (const nome of nomes.filter((n) => n >= primeira)) await require(path.join(pasta, nome)).up(trx);
      expect(await trx('ordens_svo').where({ id: o.id }).first()).toEqual(o);
      await trx('ordens_svo').where({ id: o.id }).update({ status: 'NO_LOCAL' });
      const indices = await trx('pg_indexes').where({ schemaname: schema }).whereIn('indexname',
        ['uq_ordens_svo_solicitacao_ativa', 'idx_ordens_svo_veiculo_status_ativo', 'idx_ordens_svo_periodo_previsto']);
      expect(indices).toHaveLength(3);
      expect(indices.every((i) => i.indexdef.includes('NO_LOCAL'))).toBe(true);
      // Savepoints mantêm a transação utilizável após cada violação esperada.
      for (const valores of [{ status: 'INVALIDO' }, { veiculo_id: null }, { motorista_id: null }]) {
        await expect(trx.transaction((sp) => sp('ordens_svo').where({ id: o.id }).update(valores))).rejects.toMatchObject({ code: '23514' });
      }
      await expect(trx.transaction((sp) => sp('ordens_svo').insert({ ...o, id: undefined }))).rejects.toMatchObject({ code: '23505' });
      for (const nome of [segunda, primeira]) {
        await expect(trx.transaction((sp) => require(path.join(pasta, nome)).down(sp))).rejects.toThrow(/NO_LOCAL/);
      }
      await trx('ordens_svo').where({ id: o.id }).update({ status: 'CONCLUIDA' });
      for (const nome of nomes.filter((n) => n >= primeira).reverse()) await require(path.join(pasta, nome)).down(trx);
      expect((await trx('ordens_svo').where({ id: o.id }).first()).status).toBe('CONCLUIDA');
      await expect(trx.transaction((sp) => sp('ordens_svo').where({ id: o.id }).update({ status: 'NO_LOCAL' })))
        .rejects.toMatchObject({ code: '23514' });
    } finally { await trx.rollback(); }
  });
});
