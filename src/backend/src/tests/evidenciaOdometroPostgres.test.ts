import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';
import { armazenamentoLocal, definirArmazenamentoEvidencias } from '../services/armazenamentoEvidencias';

// Fluxo completo das fotos do odômetro (SCRUM-208/209) contra as tabelas da SCRUM-210.
// Só executa num banco descartável explicitamente identificado (ver docs/evidencias-odometro.md).
const habilitado = process.env.SCRUM208_POSTGRES_TESTS === '1';
const nonce = () => randomBytes(4).toString('hex');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);
const configuravel = env as { fotosOdometroObrigatorias: boolean };

type Perfil = 'ADMINISTRADOR' | 'GESTOR_FROTA' | 'GESTOR_SVO' | 'MOTORISTA_FROTA' | 'MOTORISTA_SVO';

async function usuario(perfil: Perfil) {
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
    algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web', subject: String(u.id), expiresIn: 1800,
  });
  return { ...u, token: `Bearer ${token}` };
}

async function recursos(tipo: 'FROTA' | 'SVO') {
  const condutor = await usuario(tipo === 'SVO' ? 'MOTORISTA_SVO' : 'MOTORISTA_FROTA');
  const [veiculo] = await db('veiculos').insert({
    placa: `T${nonce()}`, modelo: 'Veículo de teste', tipo_frota: tipo === 'SVO' ? 'SVO' : 'ADMINISTRATIVA',
    capacidade_maxima: 4, lotacao_cabine: 3, status: 'RESERVADO', km_atual: 1000,
  }).returning('*');
  const [motorista] = await db('motoristas').insert({
    usuario_id: condutor.id, numero_cnh: nonce(), categoria_cnh: 'B', validade_cnh: '2099-12-31',
    tipo_motorista: tipo, status: 'DESIGNADO',
  }).returning('*');
  return { condutor, veiculo, motorista };
}

async function viagemAdministrativa() {
  const r = await recursos('FROTA');
  const [solicitacao] = await db('solicitacoes_viagem').insert({
    origem: 'Sede', destino: 'Hospital', finalidade: 'Teste', data_saida_desejada: new Date(), status: 'AGENDADA',
  }).returning('*');
  const [viagem] = await db('viagens_frota').insert({
    solicitacao_id: solicitacao.id, veiculo_id: r.veiculo.id, motorista_id: r.motorista.id, status: 'AGENDADA',
  }).returning('*');
  return { ...r, viagem };
}

async function ordemSvo(r: Awaited<ReturnType<typeof recursos>>, registranteId: number) {
  const [solicitacao] = await db('solicitacoes_svo').insert({
    registrante_id: registranteId, dados_solicitante: 'Solicitante teste', local_ocorrencia: 'Local de teste',
    material_sensivel: false, status: 'EM_ANDAMENTO', confirmado_por: registranteId, confirmado_em: new Date(),
  }).returning('*');
  const [ordem] = await db('ordens_svo').insert({
    solicitacao_id: solicitacao.id, veiculo_id: r.veiculo.id, motorista_id: r.motorista.id,
    status: 'ALOCADA', capacidade_utilizada: 1,
  }).returning('*');
  return ordem;
}

const enviar = (token: string, campos: { tipo_operacao: string; viagem_id: number; fase: string }, chave = randomUUID(), foto = JPEG) =>
  request(app).post('/api/evidencias-odometro').set('Authorization', token)
    .field('tipo_operacao', campos.tipo_operacao).field('viagem_id', String(campos.viagem_id))
    .field('fase', campos.fase).field('chave_idempotencia', chave)
    .attach('arquivo', foto, { filename: 'odometro.jpg', contentType: 'image/jpeg' });

const transicao = (token: string, acao: 'iniciar' | 'finalizar', id: number, corpo: Record<string, unknown>) =>
  request(app).patch(`/api/viagens/${id}/${acao}`).set('Authorization', token).send(corpo);

describe.skipIf(!habilitado)('SCRUM-208/209 com PostgreSQL isolado e HTTP autenticado', () => {
  let pasta: string;

  beforeAll(async () => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('Banco de teste não autorizado');
    }
    pasta = await mkdtemp(path.join(tmpdir(), 'evidencias-pg-'));
    definirArmazenamentoEvidencias(armazenamentoLocal(pasta));
  });

  afterEach(() => {
    configuravel.fotosOdometroObrigatorias = false;
  });

  afterAll(async () => {
    definirArmazenamentoEvidencias(undefined);
    await rm(pasta, { recursive: true, force: true });
    await db.destroy();
  });

  it('viagem administrativa: envia, reaproveita no reenvio, confirma na transição e inicia a guarda de 12 meses', async () => {
    configuravel.fotosOdometroObrigatorias = true;
    const { condutor, viagem } = await viagemAdministrativa();
    const gestorFrota = await usuario('GESTOR_FROTA');
    const gestorSvo = await usuario('GESTOR_SVO');
    const campos = { tipo_operacao: 'ADMINISTRATIVA', viagem_id: viagem.id, fase: 'SAIDA' };

    // Sem foto, a saída não é registrada
    const semFoto = await transicao(condutor.token, 'iniciar', viagem.id, { km_inicial: 1010 });
    expect(semFoto.status).toBe(400);
    expect(semFoto.body.codigo).toBe('EVIDENCIA_OBRIGATORIA');
    expect((await db('viagens_frota').where({ id: viagem.id }).first()).status).toBe('AGENDADA');

    const chave = randomUUID();
    const envio = await enviar(condutor.token, campos, chave);
    expect(envio.status).toBe(201);
    const repetido = await enviar(condutor.token, campos, chave);
    expect(repetido.status).toBe(201);
    expect(repetido.body.id).toBe(envio.body.id);
    expect(await db('evidencias_odometro').where({ viagem_frota_id: viagem.id })).toHaveLength(1);

    // O km errado falha por outro motivo: a mesma foto vale na nova tentativa
    const kmMenor = await transicao(condutor.token, 'iniciar', viagem.id, { km_inicial: 10, evidencia_id: envio.body.id });
    expect(kmMenor.status).toBe(400);
    expect(kmMenor.body.codigo).toBeUndefined();
    const iniciou = await transicao(condutor.token, 'iniciar', viagem.id, { km_inicial: 1010, evidencia_id: envio.body.id });
    expect(iniciou.status).toBe(200);
    const saida = await db('evidencias_odometro').where({ id: Number(envio.body.id) }).first();
    expect(saida).toMatchObject({ status: 'ATIVA', km_registrado: 1010, conclusao_operacao_em: null });
    expect(await db('auditorias').where('acao', `INICIOU_VIAGEM tipo=ADMINISTRATIVA id=${viagem.id} km_inicial=1010 evidencia=${saida.id}`)).toHaveLength(1);

    // Consulta: gestor da operação vê e baixa; motorista vê a situação sem baixar; outra frota não vê
    const consulta = await request(app).get(`/api/evidencias-odometro?tipo_operacao=ADMINISTRATIVA&viagem_id=${viagem.id}`)
      .set('Authorization', gestorFrota.token);
    expect(consulta.status).toBe(200);
    expect(consulta.body.saida).toMatchObject({ id: String(saida.id), situacao: 'REGISTRADA', km: 1010, pode_baixar: true, compartilhada: false });
    expect(consulta.body.chegada).toMatchObject({ situacao: 'PENDENTE', pode_baixar: false });
    const doMotorista = await request(app).get(`/api/evidencias-odometro?tipo_operacao=ADMINISTRATIVA&viagem_id=${viagem.id}`)
      .set('Authorization', condutor.token);
    expect(doMotorista.body.saida).toMatchObject({ situacao: 'REGISTRADA', pode_baixar: false });
    const outraFrota = await request(app).get(`/api/evidencias-odometro?tipo_operacao=ADMINISTRATIVA&viagem_id=${viagem.id}`)
      .set('Authorization', gestorSvo.token);
    expect(outraFrota.status).toBe(403);

    const arquivo = await request(app).get(`/api/evidencias-odometro/${saida.id}/arquivo?download=1`)
      .set('Authorization', gestorFrota.token).buffer(true).parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (p: Buffer) => partes.push(p));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(arquivo.status).toBe(200);
    expect(Buffer.compare(arquivo.body as Buffer, JPEG)).toBe(0);
    expect(arquivo.headers['cache-control']).toBe('no-store');
    expect(arquivo.headers['content-disposition']).toContain('attachment');
    expect((await request(app).get(`/api/evidencias-odometro/${saida.id}/arquivo`).set('Authorization', condutor.token)).status).toBe(403);
    expect((await request(app).get(`/api/evidencias-odometro/${saida.id}/arquivo`).set('Authorization', gestorSvo.token)).status).toBe(403);
    expect(await db('auditorias').where('acao', 'like', `BAIXOU_FOTO_ODOMETRO tipo=ADMINISTRATIVA id=${viagem.id} %`)).toHaveLength(1);

    // Chegada
    const chegada = await enviar(condutor.token, { ...campos, fase: 'CHEGADA' });
    expect(chegada.status).toBe(201);
    const finalizou = await transicao(condutor.token, 'finalizar', viagem.id, { km_final: 1100, evidencia_id: chegada.body.id });
    expect(finalizou.status).toBe(200);
    const { rows } = await db.raw(
      `SELECT bool_and(retencao_ate = conclusao_operacao_em + interval '12 months') AS doze_meses, count(*)::int AS total
       FROM evidencias_odometro WHERE viagem_frota_id = ? AND status = 'ATIVA'`, [viagem.id]);
    expect(rows[0]).toEqual({ doze_meses: true, total: 2 });
  });

  it('com as fotos opcionais (padrão), iniciar e finalizar sem foto funcionam como antes', async () => {
    const { condutor, viagem } = await viagemAdministrativa();
    expect((await transicao(condutor.token, 'iniciar', viagem.id, { km_inicial: 1000 })).status).toBe(200);
    expect((await transicao(condutor.token, 'finalizar', viagem.id, { km_final: 1050 })).status).toBe(200);
    expect(await db('evidencias_odometro').where({ viagem_frota_id: viagem.id })).toHaveLength(0);

    const gestor = await usuario('GESTOR_SVO');
    const r = await recursos('SVO');
    const ordem = await ordemSvo(r, gestor.id);
    expect((await transicao(r.condutor.token, 'iniciar', ordem.id, { tipo_operacao: 'SVO', km_inicial: 1000 })).status).toBe(200);
    expect((await transicao(r.condutor.token, 'finalizar', ordem.id, { tipo_operacao: 'SVO', km_final: 1040 })).status).toBe(200);
    // O deslocamento físico fica registrado mesmo sem foto
    const consulta = await request(app).get(`/api/evidencias-odometro?tipo_operacao=SVO&viagem_id=${ordem.id}`).set('Authorization', gestor.token);
    expect(consulta.body.saida.situacao).toBe('SEM_REGISTRO');
    expect(consulta.body.chegada.situacao).toBe('SEM_REGISTRO');
    expect(await db('deslocamentos_svo').where({ veiculo_id: r.veiculo.id }).first()).toMatchObject({ status: 'CONCLUIDO', km_final: 1040 });
  });

  it('recusa foto de outra viagem, já usada ou expirada, sem registrar a transição', async () => {
    const a = await viagemAdministrativa();
    const b = await viagemAdministrativa();
    const daOutra = await enviar(b.condutor.token, { tipo_operacao: 'ADMINISTRATIVA', viagem_id: b.viagem.id, fase: 'SAIDA' });
    expect(daOutra.status).toBe(201);

    // Motorista não envia foto para viagem que não é dele
    const alheia = await enviar(a.condutor.token, { tipo_operacao: 'ADMINISTRATIVA', viagem_id: b.viagem.id, fase: 'SAIDA' });
    expect(alheia.status).toBe(403);

    const invalida = await transicao(b.condutor.token, 'iniciar', a.viagem.id, { km_inicial: 1000, evidencia_id: daOutra.body.id });
    expect(invalida.status).toBe(403);
    const deOutroUsuario = await transicao(a.condutor.token, 'iniciar', a.viagem.id, { km_inicial: 1000, evidencia_id: daOutra.body.id });
    expect(deOutroUsuario.body.codigo).toBe('EVIDENCIA_INVALIDA');

    const propria = await enviar(a.condutor.token, { tipo_operacao: 'ADMINISTRATIVA', viagem_id: a.viagem.id, fase: 'SAIDA' });
    await db('evidencias_odometro').where({ id: Number(propria.body.id) }).update({ criado_em: db.raw("CURRENT_TIMESTAMP - interval '31 minutes'") });
    const expirada = await transicao(a.condutor.token, 'iniciar', a.viagem.id, { km_inicial: 1000, evidencia_id: propria.body.id });
    expect(expirada.status).toBe(400);
    expect(expirada.body.codigo).toBe('EVIDENCIA_EXPIRADA');
    expect((await db('viagens_frota').where({ id: a.viagem.id }).first()).status).toBe('AGENDADA');

    // Foto que não é imagem
    const pdf = await enviar(a.condutor.token, { tipo_operacao: 'ADMINISTRATIVA', viagem_id: a.viagem.id, fase: 'SAIDA' },
      randomUUID(), Buffer.from('%PDF-1.7 conteudo'));
    expect(pdf.status).toBe(400);
  });

  it('coletas SVO no mesmo deslocamento compartilham as fotos e a guarda conta do fim do deslocamento', async () => {
    configuravel.fotosOdometroObrigatorias = true;
    const gestor = await usuario('GESTOR_SVO');
    const r = await recursos('SVO');
    const ordemA = await ordemSvo(r, gestor.id);
    const ordemB = await ordemSvo(r, gestor.id);
    const token = r.condutor.token;

    const saida = await enviar(token, { tipo_operacao: 'SVO', viagem_id: ordemA.id, fase: 'SAIDA' });
    expect(saida.status).toBe(201);
    expect((await transicao(token, 'iniciar', ordemA.id, { tipo_operacao: 'SVO', km_inicial: 1005, evidencia_id: saida.body.id })).status).toBe(200);

    // A ordem B, ainda não iniciada, já enxerga a saída do deslocamento em curso
    const consultaB = await request(app).get(`/api/evidencias-odometro?tipo_operacao=SVO&viagem_id=${ordemB.id}`).set('Authorization', token);
    expect(consultaB.body.saida).toMatchObject({ situacao: 'REGISTRADA', compartilhada: true });
    expect((await transicao(token, 'iniciar', ordemB.id, { tipo_operacao: 'SVO', km_inicial: 1005 })).status).toBe(200);

    const deslocamento = await db('deslocamentos_svo').where({ veiculo_id: r.veiculo.id }).first();
    expect(await db('deslocamentos_svo_ordens').where({ deslocamento_svo_id: deslocamento.id })).toHaveLength(2);

    // NO_LOCAL ainda mantém o deslocamento físico aberto e as fotos compartilhadas.
    for (const ordem of [ordemA, ordemB]) {
      const resposta = await request(app).patch(`/api/viagens/ordens-svo/${ordem.id}/chegar-local`).set('Authorization', token);
      expect(resposta.status).toBe(200);
    }

    const chegada = await enviar(token, { tipo_operacao: 'SVO', viagem_id: ordemA.id, fase: 'CHEGADA' });
    expect(chegada.status).toBe(201);
    expect((await transicao(token, 'finalizar', ordemA.id, { tipo_operacao: 'SVO', km_final: 1080, evidencia_id: chegada.body.id })).status).toBe(200);
    // Ainda há coleta em andamento: o deslocamento continua e a guarda não começou
    expect((await db('deslocamentos_svo').where({ id: deslocamento.id }).first()).status).toBe('EM_CURSO');
    expect((await db('evidencias_odometro').where({ id: Number(chegada.body.id) }).first()).retencao_ate).toBeNull();

    // A ordem B finaliza sem nova foto: a chegada é a mesma
    const consultaGestor = await request(app).get(`/api/evidencias-odometro?tipo_operacao=SVO&viagem_id=${ordemB.id}`).set('Authorization', gestor.token);
    expect(consultaGestor.body.chegada).toMatchObject({ situacao: 'REGISTRADA', compartilhada: true, pode_baixar: true });
    expect((await transicao(token, 'finalizar', ordemB.id, { tipo_operacao: 'SVO', km_final: 1080 })).status).toBe(200);

    expect(await db('deslocamentos_svo').where({ id: deslocamento.id }).first()).toMatchObject({ status: 'CONCLUIDO', km_final: 1080 });
    const fotos = await db('evidencias_odometro').where({ deslocamento_svo_id: deslocamento.id, status: 'ATIVA' });
    expect(fotos).toHaveLength(2);
    expect(fotos.every((f) => f.retencao_ate !== null)).toBe(true);
  });
});
