import { randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';
import { configNotificacoes } from '../config/notificacoes';
import { processarFilaPush, type EnviadorPush } from '../services/filaPush';
import { EVENTO_SVO_S3, EVENTO_SVO_S4, EVENTO_SVO_S5 } from '../services/notificacaoSvoService';
import * as publicacao from '../services/publicacaoNotificacoes';
import { usarBancoComExclusividade } from './exclusividadeNoBanco';

// SCRUM-234 de ponta a ponta: alocação, reprogramação e cancelamento SVO reais por HTTP autenticado,
// publicação na mesma transação, central (SCRUM-226) e fila de push (SCRUM-229) com o enviador simulado.
// Só roda num banco descartável explicitamente identificado, depois de `npm run migrate`.
const habilitado = process.env.SCRUM234_POSTGRES_TESTS === '1';
const nonce = () => randomBytes(4).toString('hex');
const instante = (minutos: number) => new Date(Date.now() + minutos * 60_000);

type Perfil = 'GESTOR_SVO' | 'MOTORISTA_SVO' | 'INTEGRANTE_SVO';
interface Conta { id: number; token: string }

async function conta(perfil: Perfil): Promise<Conta> {
  const chave = nonce();
  const [u] = await db('usuarios').insert({
    nome: `Teste ${chave}`, email: `${chave}@testes.invalid`, senha: 'hash-de-teste',
    tipo_usuario: perfil === 'MOTORISTA_SVO' ? 'MOTORISTA' : perfil, perfil,
  }).returning('*');
  if (perfil === 'GESTOR_SVO') {
    const unidade = await db('unidades').where({ nome: 'SVO' }).first('id');
    await db('gestores_unidades').insert({ unidade_id: unidade.id, usuario_id: u.id });
  }
  const agora = Math.floor(Date.now() / 1000);
  const token = jwt.sign({ typ: 'access', perfil, sv: u.versao_sessao, sessao_exp: agora + 3600 }, env.jwtSecret, {
    algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web', subject: String(u.id), expiresIn: 1800,
  });
  return { id: u.id, token: `Bearer ${token}` };
}

async function motorista() {
  const condutor = await conta('MOTORISTA_SVO');
  const [m] = await db('motoristas').insert({
    usuario_id: condutor.id, numero_cnh: nonce(), categoria_cnh: 'B', validade_cnh: '2099-12-31',
    tipo_motorista: 'SVO', status: 'DISPONIVEL',
  }).returning('*');
  return { conta: condutor, id: m.id as number };
}

// Pendências de push criadas aqui: removidas ao fim de cada caso, para não ocuparem a vez de outras suítes na fila
const ordensCriadas: number[] = [];

// Equipe com quatro integrantes vinculados; cada teste designa só alguns
async function cenario() {
  const gestor = await conta('GESTOR_SVO');
  const condutor = await motorista();
  const [veiculo] = await db('veiculos').insert({
    placa: `T${nonce()}`, modelo: 'Veículo de teste', tipo_frota: 'SVO', capacidade_maxima: 4, lotacao_cabine: 4, status: 'DISPONIVEL',
  }).returning('*');
  const [equipe] = await db('equipes_svo').insert({ nome_equipe: `Equipe ${nonce()}` }).returning('*');
  await db('escalas_svo').insert({ equipe_id: equipe.id, data_inicio: instante(-1440), data_fim: instante(14400) });
  const integrantes: Conta[] = [];
  for (let i = 0; i < 4; i += 1) {
    const integrante = await conta('INTEGRANTE_SVO');
    await db('equipes_svo_integrantes').insert({ equipe_id: equipe.id, usuario_id: integrante.id, vinculado_em: new Date() });
    integrantes.push(integrante);
  }
  const [solicitacao] = await db('solicitacoes_svo').insert({
    registrante_id: gestor.id, dados_solicitante: 'Familiar Reservado', local_ocorrencia: 'Rua Sigilosa, 123',
    material_sensivel: false, status: 'CONFIRMADA', confirmado_por: gestor.id, confirmado_em: new Date(),
  }).returning('*');
  const [ordem] = await db('ordens_svo').insert({ solicitacao_id: solicitacao.id, status: 'AGUARDANDO_ALOCACAO', capacidade_utilizada: 1 })
    .returning('*');
  const corpo = (dados: Record<string, unknown> = {}) => ({
    tipo_operacao: 'SVO', solicitacao_id: solicitacao.id, veiculo_id: veiculo.id, motorista_id: condutor.id,
    equipe_id: equipe.id, integrantes_ids: [integrantes[0]!.id, integrantes[1]!.id], capacidade_utilizada: 1,
    inicio_previsto: instante(120).toISOString(), fim_previsto: instante(180).toISOString(), ...dados,
  });
  ordensCriadas.push(ordem.id);
  return { gestor, condutor, veiculo, equipe, integrantes, ordemId: ordem.id as number, corpo };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;
const alocar = (c: Cenario, dados = {}) => request(app).post('/api/viagens').set('Authorization', c.gestor.token).send(c.corpo(dados));
const reprogramar = (c: Cenario, dados = {}) =>
  request(app).post(`/api/viagens/ordens-svo/${c.ordemId}/reprogramar`).set('Authorization', c.gestor.token).send(c.corpo(dados));
const cancelar = (c: Cenario) =>
  request(app).patch(`/api/viagens/${c.ordemId}/cancelar`).set('Authorization', c.gestor.token).send({ tipo_operacao: 'SVO' });

const avisos = (tipo: string, ordemId: number) =>
  db('notificacoes').where({ tipo, operacao: 'SVO', referencia_tipo: 'ORDEM_SVO', referencia_id: ordemId }).orderBy('id');
const destinatarios = async (tipo: string, ordemId: number) => (await avisos(tipo, ordemId)).map((a) => a.usuario_id).sort();
const ordenados = (...ids: number[]) => [...ids].sort();
const lista = async (c: Conta) => (await request(app).get('/api/notificacoes').set('Authorization', c.token)).body.itens as
  { id: number; titulo: string; acesso_revogado?: boolean; url_destino?: string }[];

// A fila trata no máximo 200 itens por passada, os mais antigos primeiro; com itens de outras suítes à frente,
// repete até processar as pendências da ordem
async function processarAte(enviador: EnviadorPush, ordemId: number) {
  for (let passada = 0; passada < 20; passada += 1) {
    await processarFilaPush(enviador);
    const pendente = await db('notificacao_outbox')
      .where({ referencia_tipo: 'ORDEM_SVO', referencia_id: ordemId }).whereIn('status', ['PENDENTE', 'PROCESSANDO']).first('id');
    if (!pendente) return;
  }
  throw new Error('A fila não processou as pendências da ordem');
}

function semDadoSensivel(texto: string) {
  expect(texto).not.toMatch(/Sigilosa|Reservado/);
}

// Cada caso faz várias operações HTTP em sequência sob o lock da agenda SVO: o limite padrão de 5 s é curto no CI
describe.skipIf(!habilitado)('SCRUM-234 · avisos SVO S3, S4 e S5 em PostgreSQL descartável', { timeout: 30_000 }, () => {
  usarBancoComExclusividade();
  beforeAll(() => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('Banco de teste não autorizado');
    }
  });
  beforeEach(() => {
    configNotificacoes.ativas = true;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    configNotificacoes.ativas = false;
    vi.restoreAllMocks();
    await db('notificacao_outbox').where({ referencia_tipo: 'ORDEM_SVO' }).whereIn('referencia_id', ordensCriadas.splice(0)).del();
  });
  afterAll(() => db.destroy());

  describe('S3 · atribuição', () => {
    it('avisa o motorista e só os integrantes designados, nunca a equipe toda nem o autor', async () => {
      const c = await cenario();
      expect((await alocar(c)).status).toBe(200);
      const [a, b, naoDesignado, outro] = c.integrantes;

      expect(await destinatarios(EVENTO_SVO_S3, c.ordemId)).toEqual(ordenados(c.condutor.conta.id, a!.id, b!.id));
      for (const fora of [naoDesignado!, outro!, c.gestor]) {
        expect(await destinatarios(EVENTO_SVO_S3, c.ordemId)).not.toContain(fora.id);
      }
      const todos = await avisos(EVENTO_SVO_S3, c.ordemId);
      expect(todos.find((n) => n.usuario_id === c.condutor.conta.id)).toMatchObject({ url_destino: '/viagens' });
      expect(todos.find((n) => n.usuario_id === a!.id)).toMatchObject({ url_destino: '/minhas-coletas' });
      for (const aviso of todos) semDadoSensivel(`${aviso.titulo} ${aviso.mensagem}`);

      // Push + badge: uma pendência SVO por pessoa e o contador do integrante
      const fila = await db('notificacao_outbox').where({ evento_tipo: EVENTO_SVO_S3, referencia_id: c.ordemId, operacao: 'SVO' });
      expect(fila).toHaveLength(3);
      expect(fila.every((item) => item.categoria === 'SVO' && item.payload_push.tag === `ordem-svo-${c.ordemId}`)).toBe(true);
      const contador = await request(app).get('/api/notificacoes/contador').set('Authorization', a!.token);
      expect(contador.body.nao_lidas).toBe(1);
      expect((await lista(naoDesignado!)).map((n) => n.id)).toEqual([]);
    });

    it('entrega o push com link e tag próprios e revalida o acesso na hora do envio', async () => {
      const c = await cenario();
      await alocar(c);
      const [a, b] = c.integrantes;
      for (const pessoa of [a!, b!]) {
        await db('push_subscriptions').insert({
          usuario_id: pessoa.id, endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, p256dh: randomUUID(), auth: nonce() + nonce(),
        });
        await db('preferencias_notificacao').insert({ usuario_id: pessoa.id, categoria: 'SVO', habilitado: true });
      }
      // Designação de B revogada antes do envio: a fila não entrega
      await db('ordens_svo_integrantes').where({ ordem_id: c.ordemId, usuario_id: b!.id }).update({ revogado_em: new Date(), revogado_por: c.gestor.id });
      const enviador = vi.fn<EnviadorPush>().mockResolvedValue({ status: 201 });
      await processarAte(enviador, c.ordemId);

      const [avisoA] = (await avisos(EVENTO_SVO_S3, c.ordemId)).filter((n) => n.usuario_id === a!.id);
      const entregaA = enviador.mock.calls.find(([, p]) => p.notificacao_id === avisoA.id)?.[1];
      expect(entregaA).toEqual({
        notificacao_id: avisoA.id, titulo: 'Nova coleta atribuída', corpo: 'Confira a coleta e o horário previsto.',
        url: '/minhas-coletas', tag: `ordem-svo-${c.ordemId}`,
      });
      const itemB = await db('notificacao_outbox').where({ evento_tipo: EVENTO_SVO_S3, referencia_id: c.ordemId, usuario_id: b!.id }).first();
      expect(itemB).toMatchObject({ status: 'IGNORADO', ultimo_erro: 'ACESSO_REVOGADO' });
      // No clique (leitura), B vê só que houve um aviso
      const item = (await lista(b!)).find((n) => n.acesso_revogado !== undefined);
      expect(item).toMatchObject({ acesso_revogado: true });
    });

    it('falha na publicação desfaz a alocação e as designações', async () => {
      const c = await cenario();
      vi.spyOn(publicacao, 'publicarNotificacao').mockRejectedValueOnce(new Error('falha simulada'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect((await alocar(c)).status).toBe(500);
      expect((await db('ordens_svo').where({ id: c.ordemId }).first()).status).toBe('AGUARDANDO_ALOCACAO');
      expect(await db('ordens_svo_integrantes').where({ ordem_id: c.ordemId })).toHaveLength(0);
      expect(await avisos(EVENTO_SVO_S3, c.ordemId)).toHaveLength(0);
    });

    it('com NOTIFICACOES_ATIVAS desligado, aloca sem publicar', async () => {
      configNotificacoes.ativas = false;
      const c = await cenario();
      expect((await alocar(c)).status).toBe(200);
      expect(await db('notificacoes').where({ referencia_tipo: 'ORDEM_SVO', referencia_id: c.ordemId })).toHaveLength(0);
    });
  });

  describe('S4 · reagendamento', () => {
    it('quem continua recebe S4, quem entra recebe S3, quem sai não recebe e perde o conteúdo', async () => {
      const c = await cenario();
      await alocar(c);
      const [a, b, novo] = c.integrantes;
      const resposta = await reprogramar(c, {
        integrantes_ids: [a!.id, novo!.id], inicio_previsto: instante(240).toISOString(), fim_previsto: instante(300).toISOString(),
      });
      expect(resposta.status).toBe(200);

      expect(await destinatarios(EVENTO_SVO_S4, c.ordemId)).toEqual(ordenados(c.condutor.conta.id, a!.id));
      expect(await destinatarios(EVENTO_SVO_S3, c.ordemId)).toEqual(ordenados(c.condutor.conta.id, a!.id, b!.id, novo!.id));
      const s4 = await avisos(EVENTO_SVO_S4, c.ordemId);
      expect(s4.find((n) => n.usuario_id === a!.id)).toMatchObject({ url_destino: '/minhas-coletas', severidade: 'warning' });
      const fila = await db('notificacao_outbox').where({ evento_tipo: EVENTO_SVO_S4, referencia_id: c.ordemId });
      expect(fila.map((i) => i.payload_push.tag)).toEqual([`ordem-svo-${c.ordemId}`, `ordem-svo-${c.ordemId}`]);

      // Designação removida: B não recebe o S4, e o S3 antigo dele fica sem conteúdo
      expect((await avisos(EVENTO_SVO_S4, c.ordemId)).map((n) => n.usuario_id)).not.toContain(b!.id);
      const deB = await lista(b!);
      expect(deB).toHaveLength(1);
      expect(deB[0]).toMatchObject({ acesso_revogado: true });
      expect(deB[0]!.titulo).not.toBe('Nova coleta SVO atribuída');
      // A continua designado e vê os dois avisos inteiros
      expect((await lista(a!)).map((n) => n.titulo).sort()).toEqual(['Coleta SVO reagendada', 'Nova coleta SVO atribuída']);
    });

    it('repetir a mesma reprogramação não avisa de novo (dedup); novo horário avisa', async () => {
      const c = await cenario();
      await alocar(c);
      const novoHorario = { inicio_previsto: instante(240).toISOString(), fim_previsto: instante(300).toISOString() };
      await reprogramar(c, novoHorario);
      expect((await reprogramar(c, novoHorario)).status).toBe(200);
      expect(await avisos(EVENTO_SVO_S4, c.ordemId)).toHaveLength(3);
      // Só trocar integrante, sem mudar horário nem veículo, não é reagendamento para quem continua
      const [a, , novo] = c.integrantes;
      await reprogramar(c, { ...novoHorario, integrantes_ids: [a!.id, novo!.id] });
      expect(await avisos(EVENTO_SVO_S4, c.ordemId)).toHaveLength(3);
      await reprogramar(c, { inicio_previsto: instante(360).toISOString(), fim_previsto: instante(420).toISOString(), integrantes_ids: [a!.id, novo!.id] });
      expect(await avisos(EVENTO_SVO_S4, c.ordemId)).toHaveLength(6);
    });

    it('troca de motorista: o novo recebe S3; o antigo não recebe e perde o conteúdo', async () => {
      const c = await cenario();
      await alocar(c);
      const substituto = await motorista();
      expect((await reprogramar(c, { motorista_id: substituto.id })).status).toBe(200);
      expect(await destinatarios(EVENTO_SVO_S3, c.ordemId)).toContain(substituto.conta.id);
      expect((await avisos(EVENTO_SVO_S4, c.ordemId)).map((n) => n.usuario_id)).not.toContain(c.condutor.conta.id);
      const doAntigo = await lista(c.condutor.conta);
      expect(doAntigo[0]).toMatchObject({ acesso_revogado: true });
      const doNovo = await lista(substituto.conta);
      expect(doNovo[0]).toMatchObject({ titulo: 'Nova coleta SVO atribuída' });
      expect(doNovo[0]!.acesso_revogado).toBeFalsy();
    });

    it('reprogramações concorrentes: uma por vez, sem aviso repetido por pessoa', async () => {
      const c = await cenario();
      await alocar(c);
      const mesmo = { inicio_previsto: instante(240).toISOString(), fim_previsto: instante(300).toISOString() };
      const respostas = await Promise.all([reprogramar(c, mesmo), reprogramar(c, mesmo)]);
      expect(respostas.every((r) => r.status === 200)).toBe(true);
      const s4 = await avisos(EVENTO_SVO_S4, c.ordemId);
      expect(s4).toHaveLength(3);
      expect(new Set(s4.map((n) => n.usuario_id)).size).toBe(3);
    });

    it('falha na publicação desfaz a reprogramação', async () => {
      const c = await cenario();
      await alocar(c);
      const antes = await db('ordens_svo').where({ id: c.ordemId }).first();
      vi.spyOn(publicacao, 'publicarNotificacao').mockRejectedValueOnce(new Error('falha simulada'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect((await reprogramar(c, { inicio_previsto: instante(240).toISOString(), fim_previsto: instante(300).toISOString() })).status).toBe(500);
      expect((await db('ordens_svo').where({ id: c.ordemId }).first()).inicio_previsto).toEqual(antes.inicio_previsto);
      expect(await avisos(EVENTO_SVO_S4, c.ordemId)).toHaveLength(0);
    });
  });

  describe('S5 · cancelamento', () => {
    it('avisa motorista e designados; quem saiu antes não recebe; o histórico continua visível', async () => {
      const c = await cenario();
      await alocar(c);
      const [a, b, novo] = c.integrantes;
      await reprogramar(c, { integrantes_ids: [a!.id, novo!.id] });
      expect((await cancelar(c)).status).toBe(200);

      expect(await destinatarios(EVENTO_SVO_S5, c.ordemId)).toEqual(ordenados(c.condutor.conta.id, a!.id, novo!.id));
      const s5 = await avisos(EVENTO_SVO_S5, c.ordemId);
      expect(s5.find((n) => n.usuario_id === novo!.id)).toMatchObject({ url_destino: '/minhas-coletas', severidade: 'danger' });
      expect(s5.find((n) => n.usuario_id === c.condutor.conta.id)).toMatchObject({ url_destino: '/viagens' });
      for (const aviso of s5) semDadoSensivel(aviso.mensagem);
      expect(await db('notificacao_outbox').where({ evento_tipo: EVENTO_SVO_S5, referencia_id: c.ordemId })).toHaveLength(3);

      // Histórico de participação: após o cancelamento, A continua vendo os avisos inteiros
      const deA = await lista(a!);
      expect(deA.map((n) => n.titulo)).toContain('Coleta SVO cancelada');
      expect(deA.every((n) => !n.acesso_revogado)).toBe(true);
      expect((await lista(b!)).map((n) => n.titulo)).not.toContain('Coleta SVO cancelada');
    });

    it('cancelamentos concorrentes: um vence e cada pessoa recebe um aviso só', async () => {
      const c = await cenario();
      await alocar(c);
      const respostas = await Promise.all([cancelar(c), cancelar(c)]);
      expect(respostas.map((r) => r.status).sort()).toEqual([200, 400]);
      const s5 = await avisos(EVENTO_SVO_S5, c.ordemId);
      expect(s5).toHaveLength(3);
      expect(new Set(s5.map((n) => n.usuario_id)).size).toBe(3);
    });

    it('ordem aguardando alocação não tem designados: cancela sem aviso', async () => {
      const c = await cenario();
      expect((await cancelar(c)).status).toBe(200);
      expect(await avisos(EVENTO_SVO_S5, c.ordemId)).toHaveLength(0);
    });

    it('falha na publicação desfaz o cancelamento', async () => {
      const c = await cenario();
      await alocar(c);
      vi.spyOn(publicacao, 'publicarNotificacao').mockRejectedValueOnce(new Error('falha simulada'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect((await cancelar(c)).status).toBe(500);
      expect((await db('ordens_svo').where({ id: c.ordemId }).first()).status).toBe('ALOCADA');
      expect(await avisos(EVENTO_SVO_S5, c.ordemId)).toHaveLength(0);
    });
  });
});
