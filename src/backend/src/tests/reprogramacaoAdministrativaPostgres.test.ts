import { randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';
import { configNotificacoes } from '../config/notificacoes';
import { tipoUsuarioDoPerfil, type Perfil } from '../constants/perfis';
import * as publicacao from '../services/publicacaoNotificacoes';
import { usarBancoComExclusividade } from './exclusividadeNoBanco';

const habilitado = process.env.SCRUM231_POSTGRES_TESTS === '1';
const nonce = () => randomBytes(4).toString('hex');
interface Conta { id: number; token: string }
async function conta(perfil: Perfil, ativo = true): Promise<Conta> {
  const [u] = await db('usuarios').insert({ nome: 'Teste A6', email: `${nonce()}@testes.invalid`,
    senha: 'hash-de-teste', perfil, ativo, tipo_usuario: tipoUsuarioDoPerfil(perfil) }).returning(['id', 'versao_sessao']);
  const token = jwt.sign({ typ: 'access', perfil, sv: u.versao_sessao, sessao_exp: Math.floor(Date.now() / 1000) + 3600 },
    env.jwtSecret, { algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web', subject: String(u.id), expiresIn: 1800 });
  return { id: u.id, token: `Bearer ${token}` };
}
const data = (hora: number) => new Date(Date.UTC(2099, 0, 12, hora)).toISOString();
const comando = (inicio: number, fim: number, versao = 0) => ({ tipo_operacao: 'ADMINISTRATIVA',
  inicio_previsto: data(inicio), fim_previsto: data(fim), versao_programacao: versao, chave_idempotencia: randomUUID() });
const reprogramar = (u: Conta, id: number, corpo: object) => request(app).patch(`/api/viagens/administrativas/${id}/reprogramar`).set('Authorization', u.token).send(corpo);
const avisos = (id: number, tipo = 'VIAGEM_REPROGRAMADA') => db('notificacoes').where({ referencia_tipo: 'VIAGEM_FROTA', referencia_id: id, tipo });
const fila = (id: number, tipo = 'VIAGEM_REPROGRAMADA') => db('notificacao_outbox').where({ referencia_tipo: 'VIAGEM_FROTA', referencia_id: id, evento_tipo: tipo });
const historico = (id: number) => db('reprogramacoes_viagem_frota').where({ viagem_id: id });
const registro = (id: number) => db('viagens_frota').where({ id }).first();
let admin: Conta, gestor: Conta, outro: Conta, solicitante: Conta, motorista: Conta, unidade: number;
const ids: number[] = [];
async function recursos() {
  const condutor = await conta('MOTORISTA_FROTA');
  const [v] = await db('veiculos').insert({ placa: `T${nonce()}`, modelo: 'Teste A6', tipo_frota: 'ADMINISTRATIVA', capacidade_maxima: 4, lotacao_cabine: 3, status: 'DISPONIVEL', km_atual: 1000 }).returning('id');
  const [m] = await db('motoristas').insert({ usuario_id: condutor.id, numero_cnh: nonce(), categoria_cnh: 'B', validade_cnh: '2099-12-31', tipo_motorista: 'FROTA', status: 'DISPONIVEL' }).returning('id');
  return { veiculo_id: v.id, motorista_id: m.id, condutor };
}
async function pedido(inicio: number, fim: number, dono = solicitante, unidadeId: number | null = unidade) {
  const [s] = await db('solicitacoes_viagem').insert({ solicitante_id: dono.id, unidade_id: unidadeId, origem: 'Origem reservada', destino: 'Destino reservado', finalidade: 'Finalidade reservada', data_saida_desejada: data(inicio), data_chegada_desejada: data(fim), status: 'APROVADA' }).returning('id');
  return s.id as number;
}
const agendar = (solicitacao_id: number, r: Awaited<ReturnType<typeof recursos>>) => request(app).post('/api/viagens').set('Authorization', admin.token).send({ tipo_operacao: 'ADMINISTRATIVA', solicitacao_id, veiculo_id: r.veiculo_id, motorista_id: r.motorista_id });
async function viagem(inicio = 8, fim = 10, r?: Awaited<ReturnType<typeof recursos>>, dono = solicitante, unidadeId: number | null = unidade) {
  const rec = r ?? await recursos(); const s = await pedido(inicio, fim, dono, unidadeId);
  const res = await agendar(s, rec); expect(res.status, JSON.stringify(res.body)).toBe(201);
  ids.push(res.body.id); return { id: res.body.id as number, s, ...rec };
}

describe.skipIf(!habilitado)('SCRUM-231 A6 HTTP PostgreSQL descartável', { timeout: 30000 }, () => {
  usarBancoComExclusividade();
  beforeAll(async () => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') throw new Error('Banco descartável obrigatório');
    [admin, gestor, outro, solicitante, motorista] = await Promise.all([conta('ADMINISTRADOR'), conta('GESTOR_FROTA'), conta('GESTOR_FROTA'), conta('SOLICITANTE'), conta('MOTORISTA_FROTA')]);
    const h = await db('unidades').where({ nome: 'HEMOSE' }).first('id'); const l = await db('unidades').where({ nome: 'LACEN' }).first('id');
    unidade = h.id;
    await db('gestores_unidades').insert([{ unidade_id: unidade, usuario_id: gestor.id }, { unidade_id: l.id, usuario_id: outro.id }]);
  });
  beforeEach(() => { configNotificacoes.ativas = true; env.fotosOdometroObrigatorias = false; });
  afterEach(async () => { vi.restoreAllMocks(); configNotificacoes.ativas = false; env.excecoesOdometroAtivas = false;
    if (ids.length) await db('notificacao_outbox').where({ referencia_tipo: 'VIAGEM_FROTA' }).whereIn('referencia_id', ids.splice(0)).del(); });
  afterAll(() => db.destroy());
  it('preserva solicitação e recursos, publica duas ocorrências efetivas e não reaplica retry antigo', async () => {
    const v = await viagem(); const antes = await db('solicitacoes_viagem').where({ id: v.s }).first(); const original = await registro(v.id);
    expect(await fila(v.id, 'VIAGEM_AGENDADA').pluck('usuario_id')).toEqual([v.condutor.id]);
    const a = comando(11, 13); const res = await reprogramar(gestor, v.id, a); expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ inicio_solicitado: data(8), fim_solicitado: data(10), inicio_previsto: data(11), fim_previsto: data(13), versao_programacao: 1 });
    expect(await db('solicitacoes_viagem').where({ id: v.s }).first()).toEqual(antes);
    expect(await registro(v.id)).toMatchObject({ veiculo_id: original.veiculo_id, motorista_id: original.motorista_id, status: original.status, data_hora_efetiva_saida: null, data_hora_efetiva_chegada: null });
    expect((await reprogramar(admin, v.id, comando(8, 10, 1))).status).toBe(200);
    expect((await reprogramar(gestor, v.id, a)).status).toBe(200);
    expect((await reprogramar(admin, v.id, comando(8, 10, 2))).status).toBe(200);
    expect((await reprogramar(admin, v.id, comando(14, 16, 0))).status).toBe(409);
    expect((await reprogramar(gestor, v.id, { ...a, fim_previsto: data(15) })).status).toBe(409);
    expect(await registro(v.id)).toMatchObject({ inicio_previsto: new Date(data(8)), versao_programacao: 2 });
    const rows = await historico(v.id); expect(rows).toHaveLength(3); expect(rows.filter(x => x.auditoria_id != null)).toHaveLength(2);
    const out = await fila(v.id); expect(out).toHaveLength(4);
    expect(new Set(out.map(x => x.ocorrencia_versao)).size).toBe(2);
    expect(out.map(x => x.usuario_id).sort()).toEqual([solicitante.id, solicitante.id, v.condutor.id, v.condutor.id].sort());
    expect(JSON.stringify(out)).not.toMatch(/reservad/i); expect(await avisos(v.id)).toHaveLength(4);
    const aud = await db('auditorias').whereIn('id', rows.filter(x => x.auditoria_id != null).map(x => x.auditoria_id));
    expect(aud).toHaveLength(2); expect(aud.every(x => x.acao.includes('antes=') && x.acao.includes('depois='))).toBe(true);
    const lista = await request(app).get('/api/viagens').set('Authorization', gestor.token);
    expect(lista.body).toContainEqual(expect.objectContaining({ id: v.id, tipo_operacao: 'ADMINISTRATIVA', pode_reprogramar: true, versao_programacao: 2 }));
  });
  it('nega perfis e unidade alheia, valida operação, intervalo, inexistência e início efetivo', async () => {
    const v = await viagem(); const c = comando(11, 13);
    for (const u of [outro, solicitante, motorista, v.condutor]) expect((await reprogramar(u, v.id, c)).status).toBe(403);
    expect((await reprogramar(admin, 2147483647, c)).status).toBe(404);
    expect((await reprogramar(admin, v.id, { ...c, tipo_operacao: 'SVO' })).status).toBe(400);
    expect((await reprogramar(admin, v.id, comando(13, 11))).status).toBe(400);
    expect((await request(app).patch(`/api/viagens/${v.id}/iniciar`).set('Authorization', v.condutor.token).send({ tipo_operacao: 'ADMINISTRATIVA', km_inicial: 1000 })).status).toBe(200);
    expect((await reprogramar(admin, v.id, c)).status).toBe(409); expect(await historico(v.id)).toHaveLength(0);
    expect(await fila(v.id, 'VIAGEM_INICIADA')).toHaveLength(0);
    expect((await request(app).patch(`/api/viagens/${v.id}/finalizar`).set('Authorization', v.condutor.token).send({ tipo_operacao: 'ADMINISTRATIVA', km_final: 1010 })).status).toBe(200);
    expect((await reprogramar(admin, v.id, c)).status).toBe(409); expect(await fila(v.id, 'VIAGEM_FINALIZADA')).toHaveLength(0);
  });
  it('rejeita sobreposição por veículo ou motorista e aceita intervalo próprio', async () => {
    const a = await viagem(); const r = await recursos(); const b = await viagem(12, 14, { ...r, veiculo_id: a.veiculo_id });
    const t = await recursos(); await viagem(16, 18, { ...t, motorista_id: a.motorista_id, condutor: a.condutor });
    expect((await reprogramar(admin, a.id, comando(12, 13))).status).toBe(409);
    expect((await reprogramar(admin, a.id, comando(16, 17))).status).toBe(409);
    expect((await reprogramar(admin, a.id, comando(9, 11))).status).toBe(200);
    expect((await registro(b.id)).inicio_previsto).toEqual(new Date(data(12)));
  });
  it('serializa duas reprogramações concorrentes e retry simultâneo', async () => {
    const a = await viagem(); const b = await viagem(12, 14, a);
    const rr = await Promise.all([reprogramar(admin, a.id, comando(16, 18)), reprogramar(admin, b.id, comando(16, 18))]);
    expect(rr.map(x => x.status).sort()).toEqual([200, 409]);
    const v = await viagem(); const c = comando(11, 13);
    const retries = await Promise.all([reprogramar(admin, v.id, c), reprogramar(admin, v.id, c)]);
    expect(retries.map(x => x.status)).toEqual([200, 200]); expect(await historico(v.id)).toHaveLength(1); expect(await fila(v.id)).toHaveLength(2);
  });
  it('serializa agendamento e reprogramação sobre o mesmo recurso', async () => {
    const a = await viagem(); const s = await pedido(12, 14);
    const [r, c] = await Promise.all([reprogramar(admin, a.id, comando(12, 14)), agendar(s, a)]);
    if (c.status === 201) ids.push(c.body.id);
    expect((r.status === 200 && c.status === 409) || (r.status === 409 && c.status === 201)).toBe(true);
  });
  it('rollback da segunda publicação desfaz a primeira, a auditoria e a programação', async () => {
    const v = await viagem(); const antes = await registro(v.id); const c = comando(11, 13);
    const original = publicacao.publicarNotificacao;
    const spy = vi.spyOn(publicacao, 'publicarNotificacao').mockImplementationOnce(original).mockRejectedValueOnce(new Error('falha A6 simulada'));
    expect((await reprogramar(admin, v.id, c)).status).toBe(500); spy.mockRestore();
    expect(await registro(v.id)).toEqual(antes); expect(await historico(v.id)).toHaveLength(0); expect(await avisos(v.id)).toHaveLength(0); expect(await fila(v.id)).toHaveLength(0);
    expect(await db('auditorias').where('acao', 'like', `REPROGRAMOU_VIAGEM id=${v.id} %`)).toHaveLength(0);
    expect((await reprogramar(admin, v.id, c)).status).toBe(200); expect(await fila(v.id)).toHaveLength(2);
  });
  it('exclui autor e inativos e não publica com flag desligada; aceita legado sem unidade apenas para admin', async () => {
    const a = await viagem(8, 10, undefined, gestor); expect((await reprogramar(gestor, a.id, comando(12, 14))).status).toBe(200);
    expect(await fila(a.id).pluck('usuario_id')).toEqual([a.condutor.id]);
    const inativo = await conta('SOLICITANTE', false); const b = await viagem(8, 10, undefined, inativo);
    expect((await reprogramar(admin, b.id, comando(12, 14))).status).toBe(200); expect(await fila(b.id).pluck('usuario_id')).toEqual([b.condutor.id]);
    const c = await viagem(8, 10, undefined, solicitante, null);
    await db('viagens_frota').where({ id: c.id }).update({ inicio_previsto: null, fim_previsto: null });
    expect((await reprogramar(gestor, c.id, comando(12, 14))).status).toBe(403);
    configNotificacoes.ativas = false; const spy = vi.spyOn(publicacao, 'publicarNotificacao');
    expect((await reprogramar(admin, c.id, comando(12, 14))).status).toBe(200); expect(spy).not.toHaveBeenCalled(); expect(await fila(c.id)).toHaveLength(0); expect(await historico(c.id)).toHaveLength(1);
  });
  it('preserva exceção de odômetro pendente e rejeita cancelada', async () => {
    const v = await viagem(); env.excecoesOdometroAtivas = true; env.fotosOdometroObrigatorias = true;
    const e = await request(app).post('/api/evidencias-odometro/excecoes').set('Authorization', v.condutor.token).send({ tipo_operacao: 'ADMINISTRATIVA', viagem_id: v.id, fase: 'SAIDA', motivo: 'Não foi possível fotografar' });
    expect(e.status, JSON.stringify(e.body)).toBe(201); const antes = await db('excecoes_odometro').where({ id: e.body.id }).first();
    expect((await reprogramar(admin, v.id, comando(12, 14))).status).toBe(200); expect(await db('excecoes_odometro').where({ id: e.body.id }).first()).toEqual(antes);
    const c = await viagem(); expect((await request(app).patch(`/api/viagens/${c.id}/cancelar`).set('Authorization', admin.token).send({ tipo_operacao: 'ADMINISTRATIVA' })).status).toBe(200);
    expect((await reprogramar(admin, c.id, comando(12, 14))).status).toBe(409); expect(await fila(c.id, 'VIAGEM_CANCELADA')).toHaveLength(2);
  });
});
