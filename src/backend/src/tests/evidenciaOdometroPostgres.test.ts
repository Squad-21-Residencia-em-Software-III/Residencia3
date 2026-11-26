import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { configNotificacoes } from '../config/notificacoes';
import { db } from '../config/database';
import { env } from '../config/env';
import { armazenamentoEvidencias, definirArmazenamentoEvidencias } from '../services/armazenamentoEvidencias';
import { TABELA_ARQUIVOS_ODOMETRO } from '../services/armazenamentoEvidenciasPostgres';
import { normalizarFotoOdometro } from '../services/imagemEvidencias';
import { excecaoOdometroService } from '../services/excecaoOdometroService';
import * as publicacao from '../services/publicacaoNotificacoes';
import { processarRetencaoEvidencias } from '../services/retencaoEvidencias';
import { AppError } from '../errors/AppError';
import { usarBancoComExclusividade } from './exclusividadeNoBanco';

// Fluxo completo das fotos do odômetro (SCRUM-208/209) contra as tabelas da SCRUM-210.
// Só executa num banco descartável explicitamente identificado (ver docs/evidencias-odometro.md).
const habilitado = process.env.SCRUM208_POSTGRES_TESTS === '1';
const nonce = () => randomBytes(4).toString('hex');
let JPEG: Buffer;
const driverOriginal = env.evidenciasStorage;
const limiteOriginal = env.evidenciasPostgresLimiteBytes;

type Perfil = 'SOLICITANTE' | 'ADMINISTRADOR' | 'GESTOR_FROTA' | 'GESTOR_SVO' | 'MOTORISTA_FROTA' | 'MOTORISTA_SVO';

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

async function viagemAdministrativa(id?: number) {
  const r = await recursos('FROTA');
  const [solicitacao] = await db('solicitacoes_viagem').insert({
    origem: 'Sede', destino: 'Hospital', finalidade: 'Teste', data_saida_desejada: new Date(), status: 'AGENDADA',
  }).returning('*');
  const [viagem] = await db('viagens_frota').insert({
    id,
    solicitacao_id: solicitacao.id, veiculo_id: r.veiculo.id, motorista_id: r.motorista.id, status: 'AGENDADA',
  }).returning('*');
  return { ...r, viagem };
}

async function ordemSvo(r: Awaited<ReturnType<typeof recursos>>, registranteId: number, id?: number) {
  const [solicitacao] = await db('solicitacoes_svo').insert({
    registrante_id: registranteId, dados_solicitante: 'Solicitante teste', local_ocorrencia: 'Local de teste',
    material_sensivel: false, status: 'EM_ANDAMENTO', confirmado_por: registranteId, confirmado_em: new Date(),
  }).returning('*');
  const [ordem] = await db('ordens_svo').insert({
    id,
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
  // Publica avisos na fila de push compartilhada (A9/A10, S8): uma suíte de fila por vez no banco
  usarBancoComExclusividade();
  beforeAll(async () => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('Banco de teste não autorizado');
    }
    JPEG = await sharp({ create: { width: 16, height: 16, channels: 3, background: 'gold' } }).jpeg().toBuffer();
    env.evidenciasStorage = 'postgres';
    definirArmazenamentoEvidencias(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    configNotificacoes.ativas = false;
    env.fotosOdometroObrigatorias = false;
    env.excecoesOdometroAtivas = false;
    env.evidenciasPostgresLimiteBytes = limiteOriginal;
    definirArmazenamentoEvidencias(undefined);
  });

  afterAll(async () => {
    definirArmazenamentoEvidencias(undefined);
    env.evidenciasStorage = driverOriginal;
    await db.destroy();
  });

  it('viagem administrativa: envia, reaproveita no reenvio, confirma na transição e inicia a guarda de 12 meses', async () => {
    env.fotosOdometroObrigatorias = true;
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
    expect(arquivo.body).toEqual((await normalizarFotoOdometro(JPEG)).bytes);
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

  it.skipIf(process.env.SCRUM231_POSTGRES_TESTS !== '1')(
    'SCRUM-219 valida agendamento, cancelamento e andamento administrativo pela API e pela fila',
    async () => {
      configNotificacoes.ativas = true;
      const gestor = await usuario('GESTOR_FROTA');
      const autor = await usuario('SOLICITANTE');
      const gestorSvo = await usuario('GESTOR_SVO');
      const agendar = async () => {
        const r = await recursos('FROTA');
        const [solicitacao] = await db('solicitacoes_viagem').insert({
          solicitante_id: autor.id, origem: 'Sede', destino: 'Hospital', finalidade: 'Teste',
          data_saida_desejada: new Date(), data_chegada_desejada: new Date(Date.now() + 3600_000),
          status: 'APROVADA',
        }).returning('id');
        const resposta = await request(app).post('/api/viagens').set('Authorization', gestor.token).send({
          tipo_operacao: 'ADMINISTRATIVA', solicitacao_id: solicitacao.id,
          veiculo_id: r.veiculo.id, motorista_id: r.motorista.id,
        });
        expect(resposta.status).toBe(201);
        const viagemId: number = resposta.body.id;
        const referencia = { referencia_tipo: 'VIAGEM_FROTA', referencia_id: viagemId, operacao: 'Administrativo' };
        expect(await db('notificacoes').where(referencia)).toEqual([expect.objectContaining({
          tipo: 'VIAGEM_AGENDADA', usuario_id: r.condutor.id, url_destino: '/viagens',
        })]);
        expect(await db('notificacao_outbox').where(referencia)).toEqual([expect.objectContaining({
          evento_tipo: 'VIAGEM_AGENDADA', usuario_id: r.condutor.id,
        })]);
        return { ...r, viagemId, referencia };
      };

      const cancelada = await agendar();
      const cancelar = () => request(app).patch('/api/viagens/' + cancelada.viagemId + '/cancelar')
        .set('Authorization', gestor.token).send({ tipo_operacao: 'ADMINISTRATIVA' });
      expect((await cancelar()).status).toBe(200);
      expect((await cancelar()).status).toBe(400);
      const cancelamentos = await db('notificacoes').where({ ...cancelada.referencia, tipo: 'VIAGEM_CANCELADA' });
      expect(cancelamentos).toHaveLength(2);
      expect(cancelamentos).toEqual(expect.arrayContaining([
        expect.objectContaining({ usuario_id: cancelada.condutor.id, url_destino: '/viagens' }),
        expect.objectContaining({ usuario_id: autor.id, url_destino: '/solicitacoes' }),
      ]));
      const filaCancelamento = await db('notificacao_outbox')
        .where({ ...cancelada.referencia, evento_tipo: 'VIAGEM_CANCELADA' });
      expect(filaCancelamento).toHaveLength(2);
      for (const item of filaCancelamento) expect(item.payload_push.tag).toBe('viagem-' + cancelada.viagemId);

      const concluida = await agendar();
      const lerResumo = async (token: string) => {
        const consultar = (rota: string) => request(app).get(`/api/notificacoes/${rota}`).set('Authorization', token);
        const [contador, badge] = await Promise.all([consultar('contador'), consultar('badge')]);
        expect(contador.status).toBe(200);
        expect(badge.status).toBe(200);
        return { naoLidas: contador.body.nao_lidas, elegiveis: badge.body.elegiveis };
      };
      const destinatarios = [
        { ...gestor, destino: '/viagens', antes: await lerResumo(gestor.token) },
        { ...autor, destino: '/solicitacoes', antes: await lerResumo(autor.token) },
      ];
      const iniciar = () => transicao(concluida.condutor.token, 'iniciar', concluida.viagemId, { km_inicial: 1000 });
      const finalizar = () => transicao(concluida.condutor.token, 'finalizar', concluida.viagemId, { km_final: 1010 });
      expect((await iniciar()).status).toBe(200);
      expect((await iniciar()).status).toBe(400);
      expect((await finalizar()).status).toBe(200);
      expect((await finalizar()).status).toBe(400);
      const tiposA8 = ['VIAGEM_INICIADA', 'VIAGEM_FINALIZADA'];
      for (const { id, token, destino, antes } of destinatarios) {
        expect(await lerResumo(token)).toEqual({ naoLidas: antes.naoLidas + 2, elegiveis: antes.elegiveis });
        const avisos = await db('notificacoes').where({ ...concluida.referencia, usuario_id: id })
          .whereIn('tipo', tiposA8).orderBy('id');
        expect(avisos.map((aviso) => aviso.tipo)).toEqual(tiposA8);
        expect(avisos.map((aviso) => aviso.url_destino)).toEqual([destino, destino]);
      }
      expect(await db('notificacoes').where(concluida.referencia).whereIn('tipo', tiposA8)
        .whereIn('usuario_id', [gestorSvo.id, concluida.condutor.id])).toHaveLength(0);
      expect(await db('notificacao_outbox').where(concluida.referencia).whereIn('evento_tipo', tiposA8)).toHaveLength(0);
    }
  );

  it('autoriza a dispensa administrativa só para a fase e a viagem designadas, com auditoria', async () => {
    configNotificacoes.ativas = true;
    env.excecoesOdometroAtivas = true;
    env.fotosOdometroObrigatorias = true;
    const { condutor, viagem } = await viagemAdministrativa();
    const outra = await viagemAdministrativa();
    const gestor = await usuario('GESTOR_FROTA');
    const gestorSvo = await usuario('GESTOR_SVO');
    const rota = '/api/evidencias-odometro/excecoes';
    const dados = { tipo_operacao: 'ADMINISTRATIVA', viagem_id: viagem.id, fase: 'SAIDA', motivo: 'A câmera ficou indisponível' };
    const solicitar = (token: string, campos = dados) => request(app).post(rota).set('Authorization', token).send(campos);

    expect((await solicitar(condutor.token, { ...dados, motivo: '   ' })).status).toBe(400);
    expect((await solicitar(outra.condutor.token)).status).toBe(403);
    expect((await solicitar(condutor.token, { ...dados, tipo_operacao: 'SVO' })).status).toBe(403);
    expect((await solicitar(condutor.token, { ...dados, fase: 'CHEGADA' })).status).toBe(409);
    expect((await solicitar(gestor.token)).status).toBe(403);

    const pedidos = await Promise.all([solicitar(condutor.token), solicitar(condutor.token)]);
    expect(pedidos.map((r) => r.status)).toEqual([201, 201]);
    expect(pedidos[0]!.body.id).toBe(pedidos[1]!.body.id);
    const id = pedidos[0]!.body.id;
    const referencia = { referencia_tipo: 'VIAGEM_FROTA', referencia_id: viagem.id };
    expect(await db('notificacoes').where({ ...referencia, usuario_id: gestor.id }))
      .toEqual([expect.objectContaining({ tipo: 'EXCECAO_ODOMETRO_SOLICITADA' })]);
    expect(await db('notificacoes').where({ ...referencia, usuario_id: gestorSvo.id })).toHaveLength(0);

    const pendentes = await request(app).get(rota).query({ tipo_operacao: 'ADMINISTRATIVA' }).set('Authorization', gestor.token);
    expect(pendentes.body.dados.filter((item: { viagem_id: number }) => item.viagem_id === viagem.id))
      .toEqual([expect.objectContaining({ id, fase: 'SAIDA', status: 'PENDENTE' })]);
    expect((await transicao(condutor.token, 'iniciar', viagem.id, { km_inicial: 1010 })).body.codigo).toBe('EVIDENCIA_OBRIGATORIA');

    const decidir = (token: string, decisao = 'APROVADA', justificativa = 'Impossibilidade verificada em contato') =>
      request(app).patch(`${rota}/${id}`).set('Authorization', token)
        .send({ tipo_operacao: 'ADMINISTRATIVA', decisao, justificativa });
    expect((await decidir(condutor.token)).status).toBe(403);
    await expect(excecaoOdometroService.decidir(id, 'ADMINISTRATIVA', 'APROVADA', 'Motivo suficientemente longo', {
      id: condutor.id, perfil: 'ADMINISTRADOR',
    })).rejects.toMatchObject({ statusCode: 403 });
    expect((await decidir(gestorSvo.token)).status).toBe(403);
    expect((await decidir(gestor.token, 'APROVADA', '   ')).status).toBe(400);
    const decisoes = await Promise.all([decidir(gestor.token), decidir(gestor.token)]);
    expect(decisoes.map((r) => r.status).sort()).toEqual([200, 409]);

    const filaDaViagem = await db('notificacao_outbox').where(referencia).select(
      'usuario_id', 'evento_tipo', 'operacao', 'payload_push'
    );
    const filaGestor = filaDaViagem.filter((item) => item.usuario_id === gestor.id);
    const filaMotorista = filaDaViagem.filter((item) => item.usuario_id === condutor.id);
    expect(filaGestor).toEqual([expect.objectContaining({
      evento_tipo: 'EXCECAO_ODOMETRO_SOLICITADA', operacao: 'Administrativo',
    })]);
    expect(filaMotorista).toEqual([expect.objectContaining({
      evento_tipo: 'EXCECAO_ODOMETRO_DECIDIDA', operacao: 'Administrativo',
    })]);
    expect(filaDaViagem.some((item) => item.usuario_id === gestorSvo.id)).toBe(false);
    expect(JSON.stringify(filaDaViagem.map((item) => item.payload_push)))
      .not.toMatch(/câmera ficou indisponível|Impossibilidade verificada/i);

    const centralGestor = await request(app).get('/api/notificacoes').set('Authorization', gestor.token);
    expect(centralGestor.status).toBe(200);
    expect(centralGestor.body.itens).toEqual(expect.arrayContaining([expect.objectContaining({
      tipo: 'EXCECAO_ODOMETRO_SOLICITADA', referencia_id: viagem.id, url_destino: '/viagens',
      operacao: 'Administrativo', acesso_revogado: false,
    })]));

    const avisoMotorista = await db('notificacoes').where({ ...referencia, usuario_id: condutor.id }).first();
    expect(avisoMotorista.mensagem).toContain('Impossibilidade verificada em contato');
    const push = await db('notificacao_outbox').where({ notificacao_id: avisoMotorista.id }).first();
    expect(push.ocorrencia_versao).toEqual('SAIDA:' + id + ':aprovada');
    expect(JSON.stringify(push.payload_push)).not.toContain('Impossibilidade verificada');
    const central = () => request(app).get('/api/notificacoes').set('Authorization', condutor.token);
    expect((await central()).body.itens).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: avisoMotorista.id, acesso_revogado: false }),
    ]));
    const ler = await request(app).patch('/api/notificacoes/referencia/lida').set('Authorization', condutor.token)
      .send(referencia);
    expect(ler.body.atualizadas).toBe(1);

    const consulta = await request(app).get('/api/evidencias-odometro')
      .query({ tipo_operacao: 'ADMINISTRATIVA', viagem_id: viagem.id }).set('Authorization', condutor.token);
    expect(consulta.body.pedidos_excecao).toEqual([expect.objectContaining({ id, status: 'APROVADA' })]);
    expect((await transicao(condutor.token, 'iniciar', viagem.id, {})).status).toBe(400);
    expect((await transicao(outra.condutor.token, 'iniciar', outra.viagem.id, { km_inicial: 1010 })).body.codigo)
      .toBe('EVIDENCIA_OBRIGATORIA');
    expect((await transicao(condutor.token, 'iniciar', viagem.id, { km_inicial: 1010 })).status).toBe(200);
    expect((await transicao(condutor.token, 'finalizar', viagem.id, { km_final: 1020 })).body.codigo).toBe('EVIDENCIA_OBRIGATORIA');
    const chegada = await solicitar(condutor.token, { ...dados, fase: 'CHEGADA' });
    expect(chegada.status).toBe(201);
    expect(await db('notificacao_outbox').where({ ...referencia, usuario_id: gestor.id }).pluck('ocorrencia_versao'))
      .toEqual(expect.arrayContaining(['SAIDA:' + id + ':solicitada', 'CHEGADA:' + chegada.body.id + ':solicitada']));
    const evidencia = await db('evidencias_odometro').where({ viagem_frota_id: viagem.id }).first();
    expect(evidencia).toMatchObject({
      fase: 'SAIDA', modalidade: 'EXCECAO_GESTOR', km_registrado: 1010,
      storage_key: null, excecao_aprovada_por: gestor.id,
    });
    expect(await db('excecoes_odometro').where({ id }).first()).toMatchObject({ evidencia_id: evidencia.id });
    expect(await db('auditorias').where({ id: evidencia.auditoria_id }).first()).toMatchObject({ usuario_id: gestor.id });
    expect(await db(TABELA_ARQUIVOS_ODOMETRO).where({ evidencia_id: evidencia.id })).toHaveLength(0);
    await db('viagens_frota').where({ id: viagem.id }).update({ motorista_id: outra.motorista.id });
    const itemRevogado = (await central()).body.itens.find((item: { id: number }) => item.id === avisoMotorista.id);
    expect(itemRevogado).toMatchObject({ acesso_revogado: true, referencia_id: null });
    expect(itemRevogado.mensagem).not.toContain('Impossibilidade verificada');
  });

  it('mantém a recusa e isola a autorização SVO até confirmar o deslocamento compartilhado', async () => {
    configNotificacoes.ativas = true;
    env.excecoesOdometroAtivas = true;
    env.fotosOdometroObrigatorias = true;
    const gestor = await usuario('GESTOR_SVO');
    const gestorFrota = await usuario('GESTOR_FROTA');
    const administrador = await usuario('ADMINISTRADOR');
    const r = await recursos('SVO');
    const a = await ordemSvo(r, gestor.id);
    const b = await ordemSvo(r, gestor.id);
    const rota = '/api/evidencias-odometro/excecoes';
    const pedir = () => request(app).post(rota).set('Authorization', r.condutor.token)
      .send({ tipo_operacao: 'SVO', viagem_id: a.id, fase: 'SAIDA', motivo: 'Não foi possível fotografar' });
    const decidir = (id: number, decisao: string, token = gestor.token) =>
      request(app).patch(`${rota}/${id}`).set('Authorization', token)
        .send({ tipo_operacao: 'SVO', decisao, justificativa: 'Motivo registrado pelo gestor' });
    const { body: primeiro } = await pedir();
    expect((await decidir(primeiro.id, 'APROVADA', gestorFrota.token)).status).toBe(403);
    expect((await decidir(primeiro.id, 'RECUSADA')).status).toBe(200);
    const { body: segundo } = await pedir();
    expect(segundo.id).not.toBe(primeiro.id);
    expect((await decidir(segundo.id, 'APROVADA', administrador.token)).status).toBe(200);
    expect(await db('excecoes_odometro').where({ id: primeiro.id }).first()).toMatchObject({ status: 'RECUSADA' });
    // S8 (SCRUM-235): pedidos e decisões SVO avisam o gestor SVO e o motorista; nunca o gestor da frota
    const avisosSvo = await db('notificacao_outbox').where({ operacao: 'SVO', referencia_tipo: 'ORDEM_SVO', referencia_id: a.id })
      .whereIn('evento_tipo', ['EXCECAO_ODOMETRO_SOLICITADA', 'EXCECAO_ODOMETRO_DECIDIDA']);
    expect(avisosSvo.filter((item) => item.evento_tipo === 'EXCECAO_ODOMETRO_SOLICITADA' && item.usuario_id === gestor.id)).toHaveLength(2);
    expect(avisosSvo.filter((item) => item.evento_tipo === 'EXCECAO_ODOMETRO_DECIDIDA').map((item) => item.usuario_id))
      .toEqual([r.condutor.id, r.condutor.id]);
    expect(avisosSvo.map((item) => item.usuario_id)).not.toContain(gestorFrota.id);

    const saida = { tipo_operacao: 'SVO', km_inicial: 1000 };
    expect((await transicao(r.condutor.token, 'iniciar', b.id, saida)).body.codigo).toBe('EVIDENCIA_OBRIGATORIA');
    expect((await transicao(r.condutor.token, 'iniciar', a.id, saida)).status).toBe(200);
    expect((await transicao(r.condutor.token, 'iniciar', b.id, saida)).status).toBe(200);
    const evidencia = await db('evidencias_odometro').where({ ordem_svo_id: a.id, fase: 'SAIDA' }).first();
    expect(evidencia).toMatchObject({ modalidade: 'EXCECAO_GESTOR', storage_key: null });
    expect(await db('deslocamentos_svo_ordens').where({ deslocamento_svo_id: evidencia.deslocamento_svo_id })).toHaveLength(2);
    expect(await db('evidencias_odometro').where({ deslocamento_svo_id: evidencia.deslocamento_svo_id })).toHaveLength(1);
  });

  it.skipIf(process.env.SCRUM235_POSTGRES_TESTS !== '1')(
    'SCRUM-221 separa avisos A9 e S8 de mesmo tipo mesmo quando as referências têm o mesmo ID',
    async () => {
      configNotificacoes.ativas = true;
      env.excecoesOdometroAtivas = true;
      const gestorSvo = await usuario('GESTOR_SVO');
      const gestorFrota = await usuario('GESTOR_FROTA');
      const admin = await usuario('ADMINISTRADOR');
      // O ID compartilhado fica longe das sequências normais das duas tabelas.
      const { rows: [{ id }] } = await db.raw(`
        SELECT GREATEST((SELECT MAX(id) FROM viagens_frota), (SELECT MAX(id) FROM ordens_svo), 0) + 100000 AS id
      `);
      const frota = await viagemAdministrativa(id);
      const svo = await recursos('SVO');
      const ordem = await ordemSvo(svo, gestorSvo.id, id);
      expect(frota.viagem.id).toBe(ordem.id);
      const pedir = (token: string, tipo_operacao: string, viagem_id: number) =>
        request(app).post('/api/evidencias-odometro/excecoes').set('Authorization', token)
          .send({ tipo_operacao, viagem_id, fase: 'SAIDA', motivo: 'A câmera ficou indisponível' });

      expect((await pedir(frota.condutor.token, 'ADMINISTRATIVA', frota.viagem.id)).status).toBe(201);
      expect((await pedir(svo.condutor.token, 'SVO', ordem.id)).status).toBe(201);
      const casos = [
        { conta: gestorSvo, operacao: 'SVO', referencia_tipo: 'ORDEM_SVO', referencia_id: ordem.id },
        { conta: gestorFrota, operacao: 'Administrativo', referencia_tipo: 'VIAGEM_FROTA', referencia_id: frota.viagem.id },
        { conta: admin, operacao: 'Administrativo', referencia_tipo: 'VIAGEM_FROTA', referencia_id: frota.viagem.id },
      ];
      for (const { conta, ...referencia } of casos) {
        const central = await request(app).get('/api/notificacoes').set('Authorization', conta.token);
        expect(central.status).toBe(200);
        const avisos = central.body.itens.filter((item: { tipo: string }) => item.tipo === 'EXCECAO_ODOMETRO_SOLICITADA');
        expect(avisos).toEqual([expect.objectContaining({ ...referencia, acesso_revogado: false })]);
        const fila = await db('notificacao_outbox').where({
          usuario_id: conta.id, evento_tipo: 'EXCECAO_ODOMETRO_SOLICITADA', ...referencia,
        });
        expect(fila).toHaveLength(1);
        expect(JSON.stringify(fila[0].payload_push)).not.toContain('A câmera ficou indisponível');
      }
    }
  );

  it('encerra autorizações SVO quando a ordem é reprogramada para outro condutor', async () => {
    env.excecoesOdometroAtivas = true;
    const gestor = await usuario('GESTOR_SVO');
    const original = await recursos('SVO');
    const substituto = await recursos('SVO');
    const ordem = await ordemSvo(original, gestor.id);
    const rota = '/api/evidencias-odometro/excecoes';
    const referencia = { tipo_operacao: 'SVO', viagem_id: ordem.id };
    const pedido = await request(app).post(rota).set('Authorization', original.condutor.token)
      .send({ ...referencia, fase: 'SAIDA', motivo: 'Não foi possível fotografar' });
    expect(pedido.status).toBe(201);
    expect((await request(app).patch(`${rota}/${pedido.body.id}`).set('Authorization', gestor.token)
      .send({ tipo_operacao: 'SVO', decisao: 'APROVADA', justificativa: 'Impossibilidade conferida' })).status).toBe(200);

    const reprogramada = await request(app).post(`/api/viagens/ordens-svo/${ordem.id}/reprogramar`)
      .set('Authorization', gestor.token).send({
        tipo_operacao: 'SVO', solicitacao_id: ordem.solicitacao_id, veiculo_id: original.veiculo.id,
        motorista_id: substituto.motorista.id, capacidade_utilizada: 1,
        inicio_previsto: new Date(Date.now() + 3_600_000),
        fim_previsto: new Date(Date.now() + 7_200_000),
      });
    expect(reprogramada.status).toBe(200);
    expect(await db('excecoes_odometro').where({ id: pedido.body.id }).first()).toMatchObject({
      status: 'APROVADA', encerrada_em: expect.any(Date), evidencia_id: null,
    });

    const consultar = (token: string) => request(app).get('/api/evidencias-odometro').query(referencia).set('Authorization', token);
    expect((await consultar(original.condutor.token)).status).toBe(403);
    expect((await consultar(substituto.condutor.token)).body.pedidos_excecao).toEqual([]);
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
    await db('evidencias_odometro').where({ id: Number(propria.body.id) }).update({ criado_em: db.fn.now() });

    // Foto que não é imagem
    const pdf = await enviar(a.condutor.token, { tipo_operacao: 'ADMINISTRATIVA', viagem_id: a.viagem.id, fase: 'SAIDA' },
      randomUUID(), Buffer.from('%PDF-1.7 conteudo'));
    expect(pdf.status).toBe(400);
  });

  it('coletas SVO no mesmo deslocamento compartilham as fotos e a guarda conta do fim do deslocamento', async () => {
    env.fotosOdometroObrigatorias = true;
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
    // Mesmo com datas inconsistentes, a rotina não apaga fotos de deslocamento em curso.
    const evidenciasDoDeslocamento = db('evidencias_odometro').where({ deslocamento_svo_id: deslocamento.id });
    await evidenciasDoDeslocamento.clone().update({
      conclusao_operacao_em: db.raw("CURRENT_TIMESTAMP - interval '2 years'"),
      retencao_ate: db.raw("CURRENT_TIMESTAMP - interval '1 year'"),
    });
    expect(await processarRetencaoEvidencias(db, { aplicar: true, limite: 25 }))
      .toMatchObject({ candidatos: 0, removidas: 0 });
    await evidenciasDoDeslocamento.clone().update({ conclusao_operacao_em: null, retencao_ate: null });

    // A ordem B finaliza sem nova foto: a chegada é a mesma
    const consultaGestor = await request(app).get(`/api/evidencias-odometro?tipo_operacao=SVO&viagem_id=${ordemB.id}`).set('Authorization', gestor.token);
    expect(consultaGestor.body.chegada).toMatchObject({ situacao: 'REGISTRADA', compartilhada: true, pode_baixar: true });
    expect((await transicao(token, 'finalizar', ordemB.id, { tipo_operacao: 'SVO', km_final: 1080 })).status).toBe(200);

    expect(await db('deslocamentos_svo').where({ id: deslocamento.id }).first()).toMatchObject({ status: 'CONCLUIDO', km_final: 1080 });
    const fotos = await db('evidencias_odometro').where({ deslocamento_svo_id: deslocamento.id, status: 'ATIVA' });
    expect(fotos).toHaveLength(2);
    expect(fotos.every((f) => f.retencao_ate !== null)).toBe(true);
  });

  it('reverte os bytes e os metadados após falha no envio, retoma sem duplicar e expurga somente fotos elegíveis', async () => {
    const storage = armazenamentoEvidencias();
    const arquivosAntes = await db(TABELA_ARQUIVOS_ODOMETRO).count('* as total').first();
    definirArmazenamentoEvidencias({
      ...storage,
      async salvar(...args) {
        await storage.salvar(...args);
        throw new AppError('Falha de armazenamento simulada', 503);
      },
    });
    const { condutor, viagem } = await viagemAdministrativa();
    const campos = { tipo_operacao: 'ADMINISTRATIVA', viagem_id: viagem.id, fase: 'SAIDA' };
    const chave = randomUUID();
    expect((await enviar(condutor.token, campos, chave)).status).toBe(503);
    expect(await db('evidencias_odometro').where({ viagem_frota_id: viagem.id })).toHaveLength(0);
    expect(await db(TABELA_ARQUIVOS_ODOMETRO).count('* as total').first()).toEqual(arquivosAntes);
    expect((await db('viagens_frota').where({ id: viagem.id }).first()).status).toBe('AGENDADA');

    definirArmazenamentoEvidencias(undefined);
    const [reenvioA, reenvioB] = await Promise.all([
      enviar(condutor.token, campos, chave), enviar(condutor.token, campos, chave),
    ]);
    const reserva = await db('evidencias_odometro').where({ viagem_frota_id: viagem.id }).first();
    expect(reserva).toMatchObject({ status: 'STAGING', storage_key: expect.stringMatching(/^odometro\/pg\//) });
    for (const resposta of [reenvioA, reenvioB]) {
      expect(resposta.status).toBe(201);
      expect(resposta.body.id).toBe(String(reserva.id));
    }
    expect(await db('auditorias').where('acao', `ENVIOU_FOTO_ODOMETRO tipo=ADMINISTRATIVA id=${viagem.id} fase=SAIDA evidencia=${reserva.id}`))
      .toHaveLength(1);
    expect(await db(TABELA_ARQUIVOS_ODOMETRO).where({ evidencia_id: reserva.id })).toHaveLength(1);

    const temporaria = await enviar(condutor.token, campos);
    expect(temporaria.status).toBe(201);
    await db('evidencias_odometro').where({ id: Number(temporaria.body.id) })
      .update({ criado_em: db.raw("CURRENT_TIMESTAMP - interval '40 minutes'") });
    expect((await transicao(condutor.token, 'iniciar', viagem.id, { km_inicial: 1005, evidencia_id: reserva.id })).status).toBe(200);
    const chegada = await enviar(condutor.token, { ...campos, fase: 'CHEGADA' });
    expect(chegada.status).toBe(201);
    expect((await transicao(condutor.token, 'finalizar', viagem.id, { km_final: 1015, evidencia_id: chegada.body.id })).status).toBe(200);

    await db('viagens_frota').where({ id: viagem.id }).update({
      data_hora_efetiva_saida: db.raw("CURRENT_TIMESTAMP - interval '2 years 1 day'"),
      data_hora_efetiva_chegada: db.raw("CURRENT_TIMESTAMP - interval '2 years'"),
    });
    await db('evidencias_odometro').whereIn('id', [reserva.id, Number(chegada.body.id)]).update({
      conclusao_operacao_em: db.raw("CURRENT_TIMESTAMP - interval '2 years'"),
      retencao_ate: db.raw("CURRENT_TIMESTAMP - interval '1 year'"),
    });
    await db('evidencias_odometro').where({ id: reserva.id }).update({ preservacao_legal: true, preservacao_motivo: 'Teste' });

    const simular = await processarRetencaoEvidencias(db, { aplicar: false, limite: 25 });
    expect(simular).toMatchObject({ candidatos: 2, temporarias: 1, vencidas: 1, removidas: 0 });
    const ids = [Number(temporaria.body.id), Number(chegada.body.id)];
    await db.raw(`ALTER TABLE evidencias_odometro ADD CONSTRAINT teste_expurgo_rollback
      CHECK (status NOT IN ('REJEITADA', 'EXPURGADA_RETENCAO')) NOT VALID`);
    try {
      const falha = await processarRetencaoEvidencias(db, { aplicar: true, limite: 25 });
      expect(falha).toMatchObject({ falhas: 2, removidas: 0 });
      expect(await db(TABELA_ARQUIVOS_ODOMETRO).whereIn('evidencia_id', ids)).toHaveLength(2);
    } finally {
      await db.raw('ALTER TABLE evidencias_odometro DROP CONSTRAINT teste_expurgo_rollback');
    }

    const aplicacoes = await Promise.all([
      processarRetencaoEvidencias(db, { aplicar: true, limite: 25 }),
      processarRetencaoEvidencias(db, { aplicar: true, limite: 25 }),
    ]);
    expect(aplicacoes.reduce((total, item) => total + item.removidas, 0)).toBe(2);
    expect(aplicacoes.every((item) => item.falhas === 0)).toBe(true);
    expect(await processarRetencaoEvidencias(db, { aplicar: true, limite: 25 })).toMatchObject({ candidatos: 0, removidas: 0 });
    expect(await db('evidencias_odometro').where({ id: Number(chegada.body.id) }).first())
      .toMatchObject({ status: 'EXPURGADA_RETENCAO', expurgo_motivo: 'PRAZO_RETENCAO_12_MESES', storage_key: null });
    expect(await db('evidencias_odometro').where({ id: Number(temporaria.body.id) }).first())
      .toMatchObject({ status: 'REJEITADA' });
    expect(await db('evidencias_odometro').where({ id: reserva.id }).first()).toMatchObject({ status: 'ATIVA' });
    expect(await db(TABELA_ARQUIVOS_ODOMETRO).whereIn('evidencia_id', ids)).toHaveLength(0);
    await expect(storage.ler(reserva.storage_key)).resolves.toBeTruthy();
  });

  it.skipIf(process.env.GITHUB_ACTIONS !== 'true')('executa simulação e aplicação pelo cmd de retenção com role restrita', async () => {
    const { condutor, viagem } = await viagemAdministrativa();
    const campos = { tipo_operacao: 'ADMINISTRATIVA', viagem_id: viagem.id, fase: 'SAIDA' };
    const envios = [await enviar(condutor.token, campos), await enviar(condutor.token, campos)];
    expect(envios.map(({ status }) => status)).toEqual([201, 201]);
    const ids = envios.map(({ body }) => Number(body.id));
    await db('evidencias_odometro').whereIn('id', ids)
      .update({ criado_em: db.raw("CURRENT_TIMESTAMP - interval '40 minutes'") });
    await db.raw(`
      CREATE ROLE cron_retencao_ci LOGIN PASSWORD 'cron-retencao-ci-apenas';
      GRANT CONNECT ON DATABASE frotas_teste TO cron_retencao_ci;
      GRANT USAGE ON SCHEMA public TO cron_retencao_ci;
      GRANT SELECT (id, status, modalidade, preservacao_legal, criado_em, retencao_ate, conclusao_operacao_em,
        tipo_operacao, viagem_frota_id, deslocamento_svo_id),
        UPDATE (status, storage_key, expurgado_em, expurgo_motivo) ON evidencias_odometro TO cron_retencao_ci;
      GRANT SELECT (evidencia_id), DELETE ON evidencias_odometro_arquivos TO cron_retencao_ci;
      GRANT SELECT (id, status, data_hora_efetiva_chegada) ON viagens_frota TO cron_retencao_ci;
      GRANT SELECT (id, status, data_hora_conclusao) ON deslocamentos_svo TO cron_retencao_ci;
      GRANT SELECT (deslocamento_svo_id, ordem_svo_id) ON deslocamentos_svo_ordens TO cron_retencao_ci;
      GRANT SELECT (id, status) ON ordens_svo TO cron_retencao_ci;
    `);
    const executar = async (...args: string[]) => {
      const { stdout } = await promisify(execFile)(process.execPath, [
        resolve(__dirname, '../../dist/scripts/retencaoEvidencias.js'), ...args,
      ], {
        timeout: 12_000,
        env: {
          ...process.env,
          NODE_ENV: 'production', TRUST_PROXY: '0', EVIDENCIAS_STORAGE: 'postgres', DB_ROLE: 'app',
          POSTGRES_APP_USER: 'cron_retencao_ci', POSTGRES_APP_PASSWORD: 'cron-retencao-ci-apenas',
          POSTGRES_POOL_MIN: '0', POSTGRES_POOL_MAX: '1',
        },
      });
      return stdout.trim().split(/\r?\n/).map((linha) => JSON.parse(linha));
    };

    expect(await executar('--limite=100')).toEqual([expect.objectContaining({ aplicar: false, temporarias: 2, removidas: 0 })]);
    expect(await db(TABELA_ARQUIVOS_ODOMETRO).whereIn('evidencia_id', ids)).toHaveLength(2);
    const aplicados = await executar('--aplicar', '--limite=1', '--lotes=3');
    expect(aplicados.filter((lote) => lote.removidas === 1)).toHaveLength(2);
    expect(aplicados.every((lote) => lote.falhas === 0)).toBe(true);
    expect(await db(TABELA_ARQUIVOS_ODOMETRO).whereIn('evidencia_id', ids)).toHaveLength(0);
    expect(await db('evidencias_odometro').whereIn('id', ids).where({ status: 'REJEITADA' })).toHaveLength(2);
  }, 15_000);

  it('aplica o teto de bytes a uploads concorrentes de viagens diferentes sem gravar evidência incompleta', async () => {
    const [{ total }] = await db(TABELA_ARQUIVOS_ODOMETRO).sum('tamanho_bytes as total');
    env.evidenciasPostgresLimiteBytes = Number(total) + (await normalizarFotoOdometro(JPEG)).bytes.length;
    const [a, b] = [await viagemAdministrativa(), await viagemAdministrativa()];
    const envios = await Promise.all([a, b].map(({ condutor, viagem }) =>
      enviar(condutor.token, { tipo_operacao: 'ADMINISTRATIVA', viagem_id: viagem.id, fase: 'SAIDA' })));
    expect(envios.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(envios.find((r) => r.status === 409)?.body.codigo).toBe('EVIDENCIAS_LIMITE_ARMAZENAMENTO');
    expect(await db('evidencias_odometro').whereIn('viagem_frota_id', [a.viagem.id, b.viagem.id])).toHaveLength(1);
  });
  it('SCRUM-232 preserva a operação com a flag desligada e reverte gravações se a publicação falhar', async () => {
    env.excecoesOdometroAtivas = true;
    const desligada = await viagemAdministrativa();
    const ligada = await viagemAdministrativa();
    const pedido = (alvo: typeof desligada) => excecaoOdometroService.solicitar({
      tipo_operacao: 'ADMINISTRATIVA', viagem_id: alvo.viagem.id, fase: 'SAIDA', motivo: 'Câmera indisponível',
    }, { id: alvo.condutor.id, perfil: 'MOTORISTA_FROTA' });
    await pedido(desligada);
    expect(await db('notificacoes').where({ referencia_tipo: 'VIAGEM_FROTA', referencia_id: desligada.viagem.id }))
      .toHaveLength(0);
    configNotificacoes.ativas = true;
    await usuario('GESTOR_FROTA');
    const publicar = publicacao.publicarNotificacao;
    vi.spyOn(publicacao, 'publicarNotificacao').mockImplementationOnce(async (...args) => {
      await publicar(...args);
      throw new Error('Falha simulada depois da publicação');
    });
    await expect(pedido(ligada)).rejects.toThrow('Falha simulada');
    expect(await db('excecoes_odometro').where({ viagem_frota_id: ligada.viagem.id })).toHaveLength(0);
    for (const tabela of ['notificacoes', 'notificacao_outbox']) {
      expect(await db(tabela).where({ referencia_tipo: 'VIAGEM_FROTA', referencia_id: ligada.viagem.id })).toHaveLength(0);
    }
  });

});
