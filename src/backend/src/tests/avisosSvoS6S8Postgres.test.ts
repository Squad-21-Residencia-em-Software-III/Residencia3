import { randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';
import { configNotificacoes } from '../config/notificacoes';
import { processarFilaPush, type EnviadorPush } from '../services/filaPush';
import {
  EVENTO_SVO_S6, EVENTO_SVO_S7, EVENTO_SVO_S8_DECISAO, EVENTO_SVO_S8_PEDIDO,
} from '../services/notificacaoSvoService';
import * as publicacao from '../services/publicacaoNotificacoes';
import { usarBancoComExclusividade } from './exclusividadeNoBanco';

// SCRUM-235 de ponta a ponta: transições SVO reais por HTTP autenticado (chegada, finalização, pedido e decisão
// sem foto), publicação na mesma transação e fila de push real com o enviador simulado.
// Só roda num banco descartável explicitamente identificado, depois de `npm run migrate`.
const habilitado = process.env.SCRUM235_POSTGRES_TESTS === '1';
const nonce = () => randomBytes(4).toString('hex');

type Perfil = 'ADMINISTRADOR' | 'GESTOR_FROTA' | 'GESTOR_SVO' | 'MOTORISTA_SVO' | 'INTEGRANTE_SVO';
interface Conta { id: number; token: string }

async function conta(perfil: Perfil, { associado = perfil === 'GESTOR_SVO', ativo = true } = {}): Promise<Conta> {
  const chave = nonce();
  const [u] = await db('usuarios').insert({
    nome: `Teste ${chave}`, email: `${chave}@testes.invalid`, senha: 'hash-de-teste',
    tipo_usuario: perfil.startsWith('MOTORISTA_') ? 'MOTORISTA' : perfil, perfil, ativo,
  }).returning('*');
  if (associado) {
    const unidade = await db('unidades').where({ nome: 'SVO' }).first('id');
    await db('gestores_unidades').insert({ unidade_id: unidade.id, usuario_id: u.id });
  }
  const agora = Math.floor(Date.now() / 1000);
  const token = jwt.sign({ typ: 'access', perfil, sv: u.versao_sessao, sessao_exp: agora + 3600 }, env.jwtSecret, {
    algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web', subject: String(u.id), expiresIn: 1800,
  });
  return { id: u.id, token: `Bearer ${token}` };
}

async function veiculoComMotorista() {
  const condutor = await conta('MOTORISTA_SVO');
  const [veiculo] = await db('veiculos').insert({
    placa: `T${nonce()}`, modelo: 'Veículo de teste', tipo_frota: 'SVO',
    capacidade_maxima: 4, lotacao_cabine: 3, status: 'RESERVADO', km_atual: 1000,
  }).returning('*');
  const [motorista] = await db('motoristas').insert({
    usuario_id: condutor.id, numero_cnh: nonce(), categoria_cnh: 'B', validade_cnh: '2099-12-31',
    tipo_motorista: 'SVO', status: 'DESIGNADO',
  }).returning('*');
  return { condutor, veiculo, motorista };
}

// Dados da solicitação são sensíveis (local, solicitante): nunca podem aparecer nos avisos
const LOCAL_SENSIVEL = 'Rua Sigilosa, 123';
const SOLICITANTE_SENSIVEL = 'Familiar Reservado';

async function ordem(r: Awaited<ReturnType<typeof veiculoComMotorista>>, registranteId: number): Promise<number> {
  const [solicitacao] = await db('solicitacoes_svo').insert({
    registrante_id: registranteId, dados_solicitante: SOLICITANTE_SENSIVEL, local_ocorrencia: LOCAL_SENSIVEL,
    material_sensivel: false, status: 'EM_ANDAMENTO', confirmado_por: registranteId, confirmado_em: new Date(),
  }).returning('*');
  const [o] = await db('ordens_svo').insert({
    solicitacao_id: solicitacao.id, veiculo_id: r.veiculo.id, motorista_id: r.motorista.id,
    status: 'ALOCADA', capacidade_utilizada: 1,
  }).returning('id');
  return o.id;
}

const iniciar = (c: Conta, id: number) =>
  request(app).patch(`/api/viagens/${id}/iniciar`).set('Authorization', c.token).send({ tipo_operacao: 'SVO', km_inicial: 1010 });
const finalizar = (c: Conta, id: number, km = 1080) =>
  request(app).patch(`/api/viagens/${id}/finalizar`).set('Authorization', c.token).send({ tipo_operacao: 'SVO', km_final: km });
const chegar = (c: Conta, id: number) =>
  request(app).patch(`/api/viagens/ordens-svo/${id}/chegar-local`).set('Authorization', c.token);
const pedirSemFoto = (c: Conta, id: number, fase = 'SAIDA') =>
  request(app).post('/api/evidencias-odometro/excecoes').set('Authorization', c.token)
    .send({ tipo_operacao: 'SVO', viagem_id: id, fase, motivo: `Câmera quebrada no local ${LOCAL_SENSIVEL}` });
const decidir = (c: Conta, excecaoId: number, decisao: 'APROVADA' | 'RECUSADA') =>
  request(app).patch(`/api/evidencias-odometro/excecoes/${excecaoId}`).set('Authorization', c.token)
    .send({ tipo_operacao: 'SVO', decisao, justificativa: `Conferido com a família ${SOLICITANTE_SENSIVEL}` });

const avisos = (tipo: string, ordemId: number) =>
  db('notificacoes').where({ tipo, operacao: 'SVO', referencia_tipo: 'ORDEM_SVO', referencia_id: ordemId }).orderBy('usuario_id');
const destinatarios = async (tipo: string, ordemId: number) => (await avisos(tipo, ordemId)).map((a) => a.usuario_id);
const filaDe = (tipo: string, ordemId: number) =>
  db('notificacao_outbox').where({ evento_tipo: tipo, operacao: 'SVO', referencia_tipo: 'ORDEM_SVO', referencia_id: ordemId });

function semDadoSensivel(texto: string) {
  expect(texto).not.toContain('Sigilosa');
  expect(texto).not.toContain('Reservado');
  expect(texto).not.toContain('Câmera');
}

describe.skipIf(!habilitado)('SCRUM-235 · avisos SVO S6, S7 e S8 em PostgreSQL descartável', () => {
  usarBancoComExclusividade();
  let gestor: Conta;
  let admin: Conta;
  let semUnidade: Conta;
  let inativo: Conta;
  let gestorFrota: Conta;

  beforeAll(async () => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('Banco de teste não autorizado');
    }
    // Contas de gestão fixas da suíte; as de outras suítes também recebem (são reais), e por isso as
    // verificações olham só para estas e para quem não pode receber
    gestor = await conta('GESTOR_SVO');
    admin = await conta('ADMINISTRADOR');
    semUnidade = await conta('GESTOR_SVO', { associado: false });
    inativo = await conta('GESTOR_SVO', { ativo: false });
    gestorFrota = await conta('GESTOR_FROTA');
  });
  beforeEach(async () => {
    configNotificacoes.ativas = true;
    env.excecoesOdometroAtivas = true;
    env.fotosOdometroObrigatorias = false;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    configNotificacoes.ativas = false;
    env.excecoesOdometroAtivas = false;
    vi.restoreAllMocks();
  });
  afterAll(() => db.destroy());

  describe('S6 · chegada ao local (só In-App)', () => {
    it('avisa gestão SVO e administradores, uma vez por ordem, sem push, sem o autor e sem dado sensível', async () => {
      const r = await veiculoComMotorista();
      const [a, b] = [await ordem(r, gestor.id), await ordem(r, gestor.id)];
      for (const id of [a, b]) expect((await iniciar(r.condutor, id)).status).toBe(200);
      for (const id of [a, b]) expect((await chegar(r.condutor, id)).status).toBe(200);

      for (const id of [a, b]) {
        const ids = await destinatarios(EVENTO_SVO_S6, id);
        expect(ids).toEqual(expect.arrayContaining([gestor.id, admin.id]));
        expect(ids).not.toEqual(expect.arrayContaining([r.condutor.id]));
        for (const fora of [semUnidade, inativo, gestorFrota, r.condutor]) expect(ids).not.toContain(fora.id);
        expect(await filaDe(EVENTO_SVO_S6, id)).toHaveLength(0);
        const [aviso] = await avisos(EVENTO_SVO_S6, id);
        expect(aviso).toMatchObject({ url_destino: '/viagens?aba=svo', severidade: 'info' });
        semDadoSensivel(`${aviso.titulo} ${aviso.mensagem}`);
      }
    });

    it('repetir a chegada não avisa de novo (409, nenhum aviso a mais)', async () => {
      const r = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      await iniciar(r.condutor, id);
      await chegar(r.condutor, id);
      const antes = (await avisos(EVENTO_SVO_S6, id)).length;
      expect((await chegar(r.condutor, id)).status).toBe(409);
      expect(await avisos(EVENTO_SVO_S6, id)).toHaveLength(antes);
    });

    it('falha na publicação desfaz a chegada', async () => {
      const r = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      await iniciar(r.condutor, id);
      vi.spyOn(publicacao, 'publicarNotificacao').mockRejectedValueOnce(new Error('falha simulada'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect((await chegar(r.condutor, id)).status).toBe(500);
      expect((await db('ordens_svo').where({ id }).first()).status).toBe('EM_DESLOCAMENTO');
      expect(await avisos(EVENTO_SVO_S6, id)).toHaveLength(0);
    });

    it('com NOTIFICACOES_ATIVAS desligado, a chegada funciona e nada é publicado', async () => {
      configNotificacoes.ativas = false;
      const r = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      await iniciar(r.condutor, id);
      expect((await chegar(r.condutor, id)).status).toBe(200);
      expect(await avisos(EVENTO_SVO_S6, id)).toHaveLength(0);
    });
  });

  describe('S7 · conclusão (só In-App, uma vez por deslocamento físico)', () => {
    it('várias ordens no mesmo deslocamento geram um único aviso, quando a última termina', async () => {
      const r = await veiculoComMotorista();
      const [a, b] = [await ordem(r, gestor.id), await ordem(r, gestor.id)];
      for (const id of [a, b]) await iniciar(r.condutor, id);
      await chegar(r.condutor, a);
      expect((await finalizar(r.condutor, a)).status).toBe(200);
      expect(await avisos(EVENTO_SVO_S7, a)).toHaveLength(0);
      expect((await finalizar(r.condutor, b)).status).toBe(200);

      const deslocamento = await db('deslocamentos_svo as d').join('deslocamentos_svo_ordens as o', 'o.deslocamento_svo_id', 'd.id')
        .where('o.ordem_svo_id', b).first('d.id', 'd.status');
      expect(deslocamento.status).toBe('CONCLUIDO');
      const todos = await db('notificacoes').where({ tipo: EVENTO_SVO_S7 }).whereIn('referencia_id', [a, b]);
      // Um aviso por destinatário, não um por ordem
      expect(todos.filter((n) => n.usuario_id === gestor.id)).toHaveLength(1);
      expect(todos.filter((n) => n.usuario_id === admin.id)).toHaveLength(1);
      const [aviso] = todos.filter((n) => n.usuario_id === gestor.id);
      expect(aviso).toMatchObject({
        referencia_id: b, titulo: 'Coletas SVO concluídas', severidade: 'success',
        chave_idempotencia: `${EVENTO_SVO_S7}:ORDEM_SVO:${b}:deslocamento:${deslocamento.id}`,
      });
      expect(aviso.mensagem).toContain(`#${a}`);
      expect(aviso.mensagem).toContain(`#${b}`);
      semDadoSensivel(aviso.mensagem);
      for (const fora of [semUnidade, inativo, gestorFrota, r.condutor]) {
        expect(todos.map((n) => n.usuario_id)).not.toContain(fora.id);
      }
      expect(await db('notificacao_outbox').where({ evento_tipo: EVENTO_SVO_S7 }).whereIn('referencia_id', [a, b])).toHaveLength(0);
    });

    it('finalizações concorrentes produzem um S7 por destinatário', async () => {
      const r = await veiculoComMotorista();
      const [a, b] = [await ordem(r, gestor.id), await ordem(r, gestor.id)];
      for (const id of [a, b]) expect((await iniciar(r.condutor, id)).status).toBe(200);
      const resultados = await Promise.all([a, b].map((id) => finalizar(r.condutor, id)));
      expect(resultados.map((r) => r.status)).toEqual([200, 200]);
      expect(await db('notificacoes').where({ tipo: EVENTO_SVO_S7, usuario_id: gestor.id })
        .whereIn('referencia_id', [a, b])).toHaveLength(1);
      expect(await db('notificacao_outbox').where({ evento_tipo: EVENTO_SVO_S7 })
        .whereIn('referencia_id', [a, b])).toHaveLength(0);
    });

    it('ordem única: um aviso; finalização recusada não avisa', async () => {
      const r = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      await iniciar(r.condutor, id);
      expect((await finalizar(r.condutor, id, 900)).status).toBe(400);
      expect(await avisos(EVENTO_SVO_S7, id)).toHaveLength(0);
      expect((await finalizar(r.condutor, id)).status).toBe(200);
      expect((await avisos(EVENTO_SVO_S7, id)).filter((n) => n.usuario_id === gestor.id)).toHaveLength(1);
      expect((await avisos(EVENTO_SVO_S7, id))[0].titulo).toBe('Coleta SVO concluída');
    });

    it('falha na publicação desfaz a finalização e o fim do deslocamento', async () => {
      const r = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      await iniciar(r.condutor, id);
      vi.spyOn(publicacao, 'publicarNotificacao').mockRejectedValueOnce(new Error('falha simulada'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect((await finalizar(r.condutor, id)).status).toBe(500);
      expect((await db('ordens_svo').where({ id }).first()).status).toBe('EM_DESLOCAMENTO');
      const deslocamento = await db('deslocamentos_svo as d').join('deslocamentos_svo_ordens as o', 'o.deslocamento_svo_id', 'd.id')
        .where('o.ordem_svo_id', id).first('d.status');
      expect(deslocamento.status).toBe('EM_CURSO');
      expect(await avisos(EVENTO_SVO_S7, id)).toHaveLength(0);
    });
  });

  describe('S8 · pedido e decisão sem foto (Push + In-App + contador)', () => {
    it('pedido avisa só os gestores SVO associados, com push neutro; reenvio não duplica', async () => {
      const r = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      const pedido = await pedirSemFoto(r.condutor, id);
      expect(pedido.status).toBe(201);
      const ids = await destinatarios(EVENTO_SVO_S8_PEDIDO, id);
      expect(ids).toContain(gestor.id);
      for (const fora of [admin, semUnidade, inativo, gestorFrota, r.condutor]) expect(ids).not.toContain(fora.id);

      // Reenvio com o pedido aberto devolve o mesmo pedido e não avisa de novo
      const repetido = await pedirSemFoto(r.condutor, id);
      expect(repetido.body.id).toBe(pedido.body.id);
      expect((await avisos(EVENTO_SVO_S8_PEDIDO, id)).filter((n) => n.usuario_id === gestor.id)).toHaveLength(1);

      const [aviso] = (await avisos(EVENTO_SVO_S8_PEDIDO, id)).filter((n) => n.usuario_id === gestor.id);
      expect(aviso).toMatchObject({ severidade: 'warning', url_destino: '/viagens?aba=svo' });
      const lista = await request(app).get('/api/notificacoes').set('Authorization', gestor.token);
      expect(lista.body.itens.find((n: { id: number }) => n.id === aviso.id)?.mensagem).toContain(LOCAL_SENSIVEL);
      const [item] = await filaDe(EVENTO_SVO_S8_PEDIDO, id).where({ usuario_id: gestor.id });
      expect(item).toMatchObject({ categoria: 'SVO', status: 'PENDENTE' });
      expect(item.payload_push).toEqual({
        notificacao_id: aviso.id, titulo: 'Pedido sem foto', corpo: 'Um pedido de autorização aguarda análise.',
        url: '/viagens?aba=svo', tag: `svo-excecao-${pedido.body.id}`,
      });
    });

    it('decisão avisa o motorista que pediu, entrega o push e conta no badge; o gestor que decidiu não recebe', async () => {
      const r = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      const pedido = await pedirSemFoto(r.condutor, id);
      expect((await decidir(gestor, pedido.body.id, 'RECUSADA')).status).toBe(200);

      expect(await destinatarios(EVENTO_SVO_S8_DECISAO, id)).toEqual([r.condutor.id]);
      const [aviso] = await avisos(EVENTO_SVO_S8_DECISAO, id);
      expect(aviso).toMatchObject({ titulo: 'Autorização sem foto recusada', severidade: 'warning', url_destino: '/viagens' });
      expect(aviso.mensagem).toContain(SOLICITANTE_SENSIVEL);

      // Badge: o contador do motorista conta o aviso, e a lista dele o mostra inteiro (é o condutor)
      const contador = await request(app).get('/api/notificacoes/contador').set('Authorization', r.condutor.token);
      expect(contador.body.nao_lidas).toBeGreaterThanOrEqual(1);
      const lista = await request(app).get('/api/notificacoes').set('Authorization', r.condutor.token);
      expect(lista.body.itens.find((n: { id: number }) => n.id === aviso.id)).toMatchObject({ titulo: 'Autorização sem foto recusada', mensagem: expect.stringContaining(SOLICITANTE_SENSIVEL) });

      // Push: com assinatura e categoria SVO ligada, a fila entrega texto fixo
      await db('push_subscriptions').insert({
        usuario_id: r.condutor.id, endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, p256dh: randomUUID(), auth: nonce() + nonce(),
      });
      await db('preferencias_notificacao').insert({ usuario_id: r.condutor.id, categoria: 'SVO', habilitado: true });
      const enviador = vi.fn<EnviadorPush>().mockResolvedValue({ status: 201 });
      await processarFilaPush(enviador);
      const entrega = enviador.mock.calls.find(([, payload]) => payload.notificacao_id === aviso.id);
      expect(entrega?.[1]).toEqual({
        notificacao_id: aviso.id, titulo: 'Decisão do pedido sem foto', corpo: 'Seu pedido foi recusado.',
        url: '/viagens', tag: `svo-excecao-${pedido.body.id}`,
      });
      semDadoSensivel(JSON.stringify(entrega?.[1]));
      expect((await filaDe(EVENTO_SVO_S8_DECISAO, id))[0]).toMatchObject({ status: 'ENVIADO' });

      // Novo pedido depois da recusa é uma nova ocorrência real: novo aviso
      const segundo = await pedirSemFoto(r.condutor, id);
      expect(segundo.body.id).not.toBe(pedido.body.id);
      expect((await avisos(EVENTO_SVO_S8_PEDIDO, id)).filter((n) => n.usuario_id === gestor.id)).toHaveLength(2);
      expect((await decidir(admin, segundo.body.id, 'APROVADA')).status).toBe(200);
      const decisoes = await avisos(EVENTO_SVO_S8_DECISAO, id);
      expect(decisoes.map((n) => n.titulo).sort()).toEqual(['Autorização sem foto aprovada', 'Autorização sem foto recusada']);
      expect(decisoes.map((n) => n.usuario_id)).not.toContain(admin.id);
    });

    it('consolida os avisos concorrentes de chegada sem compartilhar as autorizações', async () => {
      const r = await veiculoComMotorista();
      const [a, b] = [await ordem(r, gestor.id), await ordem(r, gestor.id)];
      const saida = await pedirSemFoto(r.condutor, a);
      expect(saida.status).toBe(201);
      expect(await filaDe(EVENTO_SVO_S8_PEDIDO, a).where({
        usuario_id: gestor.id, ocorrencia_versao: `SAIDA:${saida.body.id}:solicitada`,
      })).toHaveLength(1);
      for (const id of [a, b]) expect((await iniciar(r.condutor, id)).status).toBe(200);

      const pedidos = await Promise.all([a, b].map((id) => pedirSemFoto(r.condutor, id, 'CHEGADA')));
      expect(pedidos.map((p) => p.status)).toEqual([201, 201]);
      expect(pedidos[0].body.id).not.toBe(pedidos[1].body.id);
      const fila = () => db('notificacao_outbox').where({
        evento_tipo: EVENTO_SVO_S8_PEDIDO, usuario_id: gestor.id,
      }).whereIn('referencia_id', [a, b]).whereLike('ocorrencia_versao', 'CHEGADA:%');
      expect(await fila()).toHaveLength(1);
      const [primeiro, remanescente] = pedidos.sort((x, y) => x.body.id - y.body.id);
      expect((await decidir(gestor, primeiro.body.id, 'RECUSADA')).status).toBe(200);
      const avisosAposDecisao = await fila();
      expect(avisosAposDecisao).toHaveLength(2);
      expect(avisosAposDecisao).toContainEqual(expect.objectContaining({
        referencia_id: remanescente.body.viagem_id,
        ocorrencia_versao: `CHEGADA:${remanescente.body.id}:solicitada`,
      }));
      expect(await db('excecoes_odometro').where({ id: remanescente.body.id }).first('status'))
        .toEqual({ status: 'PENDENTE' });
      expect((await decidir(gestor, remanescente.body.id, 'RECUSADA')).status).toBe(200);
      expect((await pedirSemFoto(r.condutor, b, 'CHEGADA')).status).toBe(201);
      expect(await fila()).toHaveLength(3);
    });

    it('avisa o pedido remanescente quando a ordem do primeiro é finalizada sem evidência compartilhada', async () => {
      const r = await veiculoComMotorista();
      const [a, b] = [await ordem(r, gestor.id), await ordem(r, gestor.id)];
      for (const id of [a, b]) expect((await iniciar(r.condutor, id)).status).toBe(200);
      const primeiro = await pedirSemFoto(r.condutor, a, 'CHEGADA');
      const segundo = await pedirSemFoto(r.condutor, b, 'CHEGADA');
      expect([primeiro.status, segundo.status]).toEqual([201, 201]);
      expect(await destinatarios(EVENTO_SVO_S8_PEDIDO, b)).not.toContain(gestor.id);

      expect((await finalizar(r.condutor, a)).status).toBe(200);
      expect((await decidir(gestor, primeiro.body.id, 'APROVADA')).status).toBe(409);
      expect(await filaDe(EVENTO_SVO_S8_PEDIDO, b).where({ usuario_id: gestor.id })).toHaveLength(1);
      expect((await decidir(gestor, segundo.body.id, 'APROVADA')).status).toBe(200);
    });

    it('publica um aviso por ordem legada sem vínculo com deslocamento', async () => {
      const r = await veiculoComMotorista();
      const [a, b] = [await ordem(r, gestor.id), await ordem(r, gestor.id)];
      for (const id of [a, b]) {
        expect((await pedirSemFoto(r.condutor, id)).status).toBe(201);
        expect(await filaDe(EVENTO_SVO_S8_PEDIDO, id).where({ usuario_id: gestor.id })).toHaveLength(1);
      }
    });

    it('reverte a decisão e sua auditoria quando a publicação falha', async () => {
      const r = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      const pedido = await pedirSemFoto(r.condutor, id);
      vi.spyOn(publicacao, 'publicarNotificacao').mockRejectedValueOnce(new Error('falha simulada'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect((await decidir(gestor, pedido.body.id, 'RECUSADA')).status).toBe(500);
      expect(await db('excecoes_odometro').where({ id: pedido.body.id }).first()).toMatchObject({
        status: 'PENDENTE', auditoria_decisao_id: null,
      });
      expect(await avisos(EVENTO_SVO_S8_DECISAO, id)).toHaveLength(0);
    });

    it('revoga o conteúdo e a entrega ao gestor que perdeu acesso após o enfileiramento', async () => {
      const gestorRevogado = await conta('GESTOR_SVO');
      const r = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      await db('push_subscriptions').insert({
        usuario_id: gestorRevogado.id, endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
        p256dh: randomUUID(), auth: nonce() + nonce(),
      });
      await db('preferencias_notificacao').insert({ usuario_id: gestorRevogado.id, categoria: 'SVO', habilitado: true });
      expect((await pedirSemFoto(r.condutor, id)).status).toBe(201);
      const [aviso] = (await avisos(EVENTO_SVO_S8_PEDIDO, id)).filter((n) => n.usuario_id === gestorRevogado.id);
      await db('gestores_unidades').where({ usuario_id: gestorRevogado.id }).delete();

      const lista = await request(app).get('/api/notificacoes').set('Authorization', gestorRevogado.token);
      const item = lista.body.itens.find((n: { id: number }) => n.id === aviso.id);
      expect(lista.status).toBe(200);
      expect(item).toBeUndefined();
      const enviador = vi.fn<EnviadorPush>().mockResolvedValue({ status: 201 });
      await processarFilaPush(enviador);
      expect(enviador.mock.calls.some(([, payload]) => payload.notificacao_id === aviso.id)).toBe(false);
      expect(await filaDe(EVENTO_SVO_S8_PEDIDO, id).where({ usuario_id: gestorRevogado.id }).first())
        .toMatchObject({ status: 'IGNORADO' });
    });

    it('decisão repetida (409) não avisa de novo', async () => {
      const r = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      const pedido = await pedirSemFoto(r.condutor, id);
      await decidir(gestor, pedido.body.id, 'APROVADA');
      expect((await decidir(gestor, pedido.body.id, 'RECUSADA')).status).toBe(409);
      expect(await avisos(EVENTO_SVO_S8_DECISAO, id)).toHaveLength(1);
    });

    it('falha na publicação desfaz o pedido', async () => {
      const r = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      vi.spyOn(publicacao, 'publicarNotificacao').mockRejectedValueOnce(new Error('falha simulada'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect((await pedirSemFoto(r.condutor, id)).status).toBe(500);
      expect(await db('excecoes_odometro').where({ ordem_svo_id: id })).toHaveLength(0);
      expect(await avisos(EVENTO_SVO_S8_PEDIDO, id)).toHaveLength(0);
    });

    it('IDOR: outro motorista não lê nem marca o aviso, e o motorista realocado perde o conteúdo', async () => {
      const r = await veiculoComMotorista();
      const outro = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      const pedido = await pedirSemFoto(r.condutor, id);
      await decidir(gestor, pedido.body.id, 'APROVADA');
      const [aviso] = await avisos(EVENTO_SVO_S8_DECISAO, id);

      const listaOutro = await request(app).get('/api/notificacoes').set('Authorization', outro.condutor.token);
      expect(listaOutro.body.itens.map((n: { id: number }) => n.id)).not.toContain(aviso.id);
      expect((await request(app).patch(`/api/notificacoes/${aviso.id}/lida`).set('Authorization', outro.condutor.token)).status).toBe(404);
      // O motorista não pode pedir sem foto numa ordem que não é dele
      expect((await pedirSemFoto(outro.condutor, id, 'SAIDA')).status).toBe(403);

      // Realocado para outro motorista: o antigo vê que houve um aviso, mas sem o conteúdo
      await db('ordens_svo').where({ id }).update({ motorista_id: outro.motorista.id });
      const lista = await request(app).get('/api/notificacoes').set('Authorization', r.condutor.token);
      const item = lista.body.itens.find((n: { id: number }) => n.id === aviso.id);
      expect(item).toMatchObject({ acesso_revogado: true });
      expect(item.titulo).not.toBe(aviso.titulo);
      semDadoSensivel(item.mensagem);
    });

    it('com NOTIFICACOES_ATIVAS desligado, pedido e decisão funcionam e nada é publicado', async () => {
      configNotificacoes.ativas = false;
      const r = await veiculoComMotorista();
      const id = await ordem(r, gestor.id);
      const pedido = await pedirSemFoto(r.condutor, id);
      expect(pedido.status).toBe(201);
      expect((await decidir(gestor, pedido.body.id, 'APROVADA')).status).toBe(200);
      expect(await db('notificacoes').where({ referencia_tipo: 'ORDEM_SVO', referencia_id: id })).toHaveLength(0);
    });
  });
});
