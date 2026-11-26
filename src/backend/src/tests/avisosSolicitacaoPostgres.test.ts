import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import knex from 'knex';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';
import { configNotificacoes } from '../config/notificacoes';
import { avisosSolicitacao } from '../services/avisosSolicitacao';
import { auditoriaModel } from '../models/auditoriaModel';
import { solicitacaoViagemService } from '../services/solicitacaoViagemService';
import { usarBancoComExclusividade } from './exclusividadeNoBanco';

// Avisos A1 a A4 (SCRUM-230) pela API e pela rotina de expiração. Só executa num banco descartável
// explicitamente identificado, depois de `npm run migrate`.
const habilitado = process.env.SCRUM230_POSTGRES_TESTS === '1';
const nonce = () => randomBytes(8).toString('hex');

interface Conta { id: number; token: string }

async function conta(perfil: string, ativo = true): Promise<Conta> {
  const [u] = await db('usuarios').insert({
    nome: 'Teste', email: `${nonce()}@testes.invalid`, senha: 'hash-de-teste', perfil, ativo,
    tipo_usuario: perfil.startsWith('MOTORISTA_') ? 'MOTORISTA' : perfil,
  }).returning(['id', 'versao_sessao']);
  const token = jwt.sign(
    { typ: 'access', perfil, sv: u.versao_sessao, sessao_exp: Math.floor(Date.now() / 1000) + 3600 },
    env.jwtSecret,
    { algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web', subject: String(u.id), expiresIn: 1800 },
  );
  return { id: u.id, token: `Bearer ${token}` };
}

const chamar = (metodo: 'post' | 'patch', u: Conta, caminho: string, corpo?: object) =>
  request(app)[metodo](`/api/solicitacoes-viagem${caminho}`).set('Authorization', u.token).send(corpo);

const CORPO = {
  origem: 'Rua Reservada, 10', destino: 'Hospital Reservado', finalidade: 'Finalidade reservada',
  data_saida_desejada: '2099-01-01T10:00:00-03:00',
};
async function criar(u: Conta): Promise<number> {
  const unidade = await db('unidades').first('id');
  const res = await chamar('post', u, '', { ...CORPO, unidade_id: unidade.id });
  expect(res.status).toBe(201);
  return res.body.id;
}
async function aprovadaVencida(solicitante_id: number | null): Promise<number> {
  const [s] = await db('solicitacoes_viagem').insert({
    origem: 'Sede', destino: 'Hospital', finalidade: 'Teste', status: 'APROVADA', solicitante_id,
    data_saida_desejada: db.raw("clock_timestamp() - interval '31 minutes'"),
  }).returning('id');
  return s.id;
}

const avisos = (id: number, tipo: string) =>
  db('notificacoes').where({ referencia_tipo: 'SOLICITACAO_VIAGEM', referencia_id: id, tipo }).orderBy('usuario_id');
const avisados = async (id: number, tipo: string): Promise<number[]> => (await avisos(id, tipo)).map((a) => a.usuario_id);
const comPush = (id: number, tipo: string): Promise<number[]> =>
  db('notificacao_outbox').where({ referencia_tipo: 'SOLICITACAO_VIAGEM', referencia_id: id, evento_tipo: tipo }).pluck('usuario_id');
const DOS_TIPOS = ['SOLICITACAO_CRIADA', 'SOLICITACAO_APROVADA', 'SOLICITACAO_RECUSADA', 'SOLICITACAO_EXPIRADA'];

describe.skipIf(!habilitado)('Avisos das solicitações em PostgreSQL descartável', () => {
  let solicitante: Conta, gestorSvo: Conta, gestor: Conta, outroGestor: Conta, administrador: Conta;
  let semInteresse: Conta[];
  usarBancoComExclusividade();

  beforeAll(async () => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('A suíte exige PostgreSQL descartável em 127.0.0.1/frotas_teste');
    }
    [solicitante, gestorSvo, gestor, outroGestor, administrador] = await Promise.all(
      ['SOLICITANTE', 'GESTOR_SVO', 'GESTOR_FROTA', 'GESTOR_FROTA', 'ADMINISTRADOR'].map((p) => conta(p))) as [Conta, Conta, Conta, Conta, Conta];
    semInteresse = await Promise.all([
      conta('SOLICITANTE'), conta('GESTOR_SVO'), conta('MOTORISTA_FROTA'), conta('MOTORISTA_SVO'), conta('INTEGRANTE_SVO'),
      conta('GESTOR_FROTA', false), conta('ADMINISTRADOR', false),
    ]);
  });
  beforeEach(() => { configNotificacoes.ativas = true; });
  afterEach(async () => {
    configNotificacoes.ativas = false;
    vi.restoreAllMocks();
    // A rotina de expiração percorre o banco inteiro: não deixa vencidas para as outras suítes
    await db('solicitacoes_viagem').where({ status: 'APROVADA' }).where('data_saida_desejada', '<', db.fn.now())
      .whereIn('solicitante_id', [solicitante.id, gestorSvo.id, gestor.id]).update({ status: 'CANCELADA' });
  });
  afterAll(() => db.destroy());

  const esperaSemInteresse = (ids: number[]) => {
    for (const { id } of semInteresse) expect(ids).not.toContain(id);
  };

  describe('A1: criada', () => {
    it('avisa quem analisa, só no sistema', async () => {
      const id = await criar(solicitante);
      const ids = await avisados(id, 'SOLICITACAO_CRIADA');
      expect(ids).toEqual(expect.arrayContaining([gestor.id, outroGestor.id, administrador.id]));
      expect(ids).not.toContain(solicitante.id);
      esperaSemInteresse(ids);
      expect(await comPush(id, 'SOLICITACAO_CRIADA')).toEqual([]);

      const [aviso] = await avisos(id, 'SOLICITACAO_CRIADA');
      expect(aviso).toMatchObject({ operacao: 'Administrativo', url_destino: '/solicitacoes', referencia_tipo: 'SOLICITACAO_VIAGEM' });
      expect(`${aviso.titulo} ${aviso.mensagem}`).not.toMatch(/reservad/i);
    });

    it('gestor que cria não é avisado do próprio pedido', async () => {
      const ids = await avisados(await criar(gestor), 'SOLICITACAO_CRIADA');
      expect(ids).toContain(outroGestor.id);
      expect(ids).not.toContain(gestor.id);
    });

    it('pedido recusado pela validação não avisa', async () => {
      // Só os avisos de solicitação: outras suítes podem publicar no mesmo banco
      const ultimo = () => db('notificacoes').where({ referencia_tipo: 'SOLICITACAO_VIAGEM' }).max('id as id').first();
      const antes = await ultimo();
      const res = await chamar('post', solicitante, '', { ...CORPO, unidade_id: 2147483647 });
      expect(res.status).toBe(400);
      expect(await ultimo()).toEqual(antes);
    });
  });

  describe('A2 e A3: decidida', () => {
    it.each([['solicitante', () => solicitante], ['gestor SVO', () => gestorSvo]])(
      'aprovada avisa só o %s que pediu, com push', async (_, autor) => {
        const id = await criar(autor());
        expect((await chamar('patch', gestor, `/${id}/aprovar`)).status).toBe(200);
        expect(await avisados(id, 'SOLICITACAO_APROVADA')).toEqual([autor().id]);
        expect(await comPush(id, 'SOLICITACAO_APROVADA')).toEqual([autor().id]);
        const [aviso] = await avisos(id, 'SOLICITACAO_APROVADA');
        expect(aviso).toMatchObject({ severidade: 'success', url_destino: '/solicitacoes' });
      });

    it('recusada: motivo só no sistema, push neutro', async () => {
      const id = await criar(solicitante);
      expect((await chamar('patch', gestor, `/${id}/recusar`, { motivo: 'Sem veículo disponível' })).status).toBe(200);
      expect(await avisados(id, 'SOLICITACAO_RECUSADA')).toEqual([solicitante.id]);
      const [aviso] = await avisos(id, 'SOLICITACAO_RECUSADA');
      expect(aviso.mensagem).toContain('Motivo: Sem veículo disponível');
      const [pendencia] = await db('notificacao_outbox').where({ referencia_id: id, evento_tipo: 'SOLICITACAO_RECUSADA' });
      expect(pendencia).toMatchObject({ usuario_id: solicitante.id, categoria: 'SOLICITACOES', payload_push: { tag: `solicitacao-${id}`, url: '/solicitacoes' } });
      expect(JSON.stringify(pendencia.payload_push)).not.toMatch(/veículo|recus/i);
      expect(await avisados(id, 'SOLICITACAO_APROVADA')).toEqual([]);
    });

    it('motivo no tamanho máximo cabe no aviso', async () => {
      const id = await criar(solicitante);
      const motivo = 'm'.repeat(200);
      expect((await chamar('patch', gestor, `/${id}/recusar`, { motivo })).status).toBe(200);
      expect((await avisos(id, 'SOLICITACAO_RECUSADA'))[0].mensagem).toContain(motivo);
    });

    it('autor que perdeu o acesso à tela não é avisado', async () => {
      const mudou = await conta('SOLICITANTE');
      const id = await criar(mudou);
      await db('usuarios').where({ id: mudou.id }).update({ perfil: 'MOTORISTA_SVO', tipo_usuario: 'MOTORISTA' });
      expect((await chamar('patch', gestor, `/${id}/aprovar`)).status).toBe(200);
      expect(await avisados(id, 'SOLICITACAO_APROVADA')).toEqual([]);
    });

    it('decisão negada não avisa (própria, repetida, sem permissão)', async () => {
      const propria = await criar(gestor);
      expect((await chamar('patch', gestor, `/${propria}/aprovar`)).status).toBe(403);
      expect(await avisados(propria, 'SOLICITACAO_APROVADA')).toEqual([]);

      const id = await criar(solicitante);
      expect((await chamar('patch', gestorSvo, `/${id}/aprovar`)).status).toBe(403);
      expect((await chamar('patch', gestor, `/${id}/aprovar`)).status).toBe(200);
      expect((await chamar('patch', outroGestor, `/${id}/recusar`, { motivo: 'x' })).status).toBe(400);
      expect(await avisados(id, 'SOLICITACAO_RECUSADA')).toEqual([]);
    });

    it('dois gestores ao mesmo tempo: uma decisão, um aviso', async () => {
      const id = await criar(solicitante);
      const respostas = await Promise.all([
        chamar('patch', gestor, `/${id}/aprovar`), chamar('patch', outroGestor, `/${id}/recusar`, { motivo: 'x' }),
        chamar('patch', administrador, `/${id}/aprovar`),
      ]);
      expect(respostas.filter((r) => r.status === 200)).toHaveLength(1);
      const total = await db('notificacoes').where({ referencia_tipo: 'SOLICITACAO_VIAGEM', referencia_id: id, usuario_id: solicitante.id });
      expect(total).toHaveLength(1);
      expect(await db('notificacao_outbox').where({ referencia_tipo: 'SOLICITACAO_VIAGEM', referencia_id: id })).toHaveLength(1);
    });
  });

  describe('A4: expirada', () => {
    it('avisa o autor com push e o Gestor de Frota só no sistema', async () => {
      const id = await aprovadaVencida(solicitante.id);
      expect(await solicitacaoViagemService.expirarAprovadas()).toBeGreaterThanOrEqual(1);
      const ids = await avisados(id, 'SOLICITACAO_EXPIRADA');
      expect(ids).toEqual(expect.arrayContaining([solicitante.id, gestor.id, outroGestor.id]));
      expect(ids).not.toContain(administrador.id);
      esperaSemInteresse(ids);
      expect(await comPush(id, 'SOLICITACAO_EXPIRADA')).toEqual([solicitante.id]);

      await solicitacaoViagemService.expirarAprovadas();
      expect(await avisados(id, 'SOLICITACAO_EXPIRADA')).toEqual(ids);
    });

    it('autor que também é Gestor de Frota recebe um aviso só, com push', async () => {
      const id = await aprovadaVencida(gestor.id);
      await solicitacaoViagemService.expirarAprovadas();
      expect((await avisados(id, 'SOLICITACAO_EXPIRADA')).filter((u) => u === gestor.id)).toHaveLength(1);
      expect(await comPush(id, 'SOLICITACAO_EXPIRADA')).toEqual([gestor.id]);
    });

    it('pedido antigo sem solicitante expira e avisa o gestor', async () => {
      const id = await aprovadaVencida(null);
      await solicitacaoViagemService.expirarAprovadas();
      expect((await db('solicitacoes_viagem').where({ id }).first()).status).toBe('EXPIRADA');
      expect(await avisados(id, 'SOLICITACAO_EXPIRADA')).toContain(gestor.id);
      expect(await comPush(id, 'SOLICITACAO_EXPIRADA')).toEqual([]);
    });

    it('não inventa expiração: dentro do prazo, pendente ou agendada não avisa', async () => {
      const [prazo, pendente, agendada] = await Promise.all([solicitante, solicitante, solicitante].map((u) => aprovadaVencida(u.id)));
      await db('solicitacoes_viagem').where({ id: prazo }).update({ data_saida_desejada: db.raw("clock_timestamp() - interval '29 minutes'") });
      await db('solicitacoes_viagem').where({ id: pendente }).update({ status: 'PENDENTE_APROVACAO' });
      await db('viagens_frota').insert({ solicitacao_id: agendada, status: 'AGENDADA' });
      await solicitacaoViagemService.expirarAprovadas();
      for (const id of [prazo, pendente, agendada]) expect(await avisados(id!, 'SOLICITACAO_EXPIRADA')).toEqual([]);
    });

    it('rotinas simultâneas avisam uma vez', async () => {
      const id = await aprovadaVencida(solicitante.id);
      await Promise.all([1, 2, 3].map(() => solicitacaoViagemService.expirarAprovadas()));
      expect((await avisados(id, 'SOLICITACAO_EXPIRADA')).filter((u) => u === solicitante.id)).toHaveLength(1);
    });

    it('executa A4 com a role provisionada e restringe leitura e exclusão', async () => {
      const id = await aprovadaVencida(solicitante.id);
      const role = `cron_avisos_${nonce()}`;
      const { provisionarRolesCron } = require('../../scripts/provisionar-roles-cron.cjs') as {
        provisionarRolesCron: (opcoes: { env: Record<string, string | undefined> }) => Promise<void>;
      };
      const retencao = role + '_ret';
      await provisionarRolesCron({ env: { ...process.env,
        FSPH_CRON_EXPIRACAO_USER: role, FSPH_CRON_EXPIRACAO_PASSWORD: 'apenas-teste',
        FSPH_CRON_RETENCAO_USER: retencao, FSPH_CRON_RETENCAO_PASSWORD: 'apenas-teste',
      } });
      const restrita = knex({
        client: 'pg', pool: { min: 0, max: 1 },
        connection: { host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT), database: process.env.POSTGRES_DB, user: role, password: 'apenas-teste' },
      });
      try {
        await expect(restrita('usuarios').select('email')).rejects.toMatchObject({ code: '42501' });
        await expect(restrita('notificacoes').where({ id: -1 }).del()).rejects.toMatchObject({ code: '42501' });
        await expect(restrita('notificacao_outbox').where({ id: -1 }).del()).rejects.toMatchObject({ code: '42501' });
        vi.spyOn(db, 'transaction').mockImplementation(((acao: never) => restrita.transaction(acao)) as never);
        expect(await solicitacaoViagemService.expirarAprovadas()).toBeGreaterThanOrEqual(1);
      } finally {
        vi.restoreAllMocks();
        await restrita.destroy();
        for (const nome of [role, retencao]) {
          await db.raw('DROP OWNED BY ??', [nome]);
          await db.raw('DROP ROLE ??', [nome]);
        }
      }
      expect((await db('solicitacoes_viagem').where({ id }).first()).status).toBe('EXPIRADA');
      expect(await comPush(id, 'SOLICITACAO_EXPIRADA')).toEqual([solicitante.id]);
    });
  });

  describe('Junto com a operação', () => {
    it('falha depois do aviso desfaz os dois', async () => {
      const antes = await db('notificacoes').max('id as id').first();
      const unidade = await db('unidades').first('id');
      const finalidade = nonce();
      const original = avisosSolicitacao.criada;
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(avisosSolicitacao, 'criada').mockImplementation(async (trx, s) => {
        await original(trx, s);
        throw new Error('falha depois do aviso');
      });
      const res = await chamar('post', solicitante, '', { ...CORPO, finalidade, unidade_id: unidade.id });
      expect(res.status).toBe(500);
      expect(await db('solicitacoes_viagem').where({ finalidade })).toEqual([]);
      expect((await db('notificacoes').where('id', '>', antes!.id ?? 0).where({ tipo: 'SOLICITACAO_CRIADA' }))).toEqual([]);
    });

    it('falha na auditoria da decisão não avisa', async () => {
      const id = await criar(solicitante);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(auditoriaModel, 'registrar').mockRejectedValueOnce(new Error('auditoria'));
      expect((await chamar('patch', gestor, `/${id}/aprovar`)).status).toBe(500);
      expect((await db('solicitacoes_viagem').where({ id }).first()).status).toBe('PENDENTE_APROVACAO');
      expect(await avisados(id, 'SOLICITACAO_APROVADA')).toEqual([]);
    });

    it('com o interruptor desligado, tudo funciona como antes e nada é publicado', async () => {
      configNotificacoes.ativas = false;
      const aprovada = await criar(solicitante);
      const recusada = await criar(solicitante);
      const expirada = await aprovadaVencida(solicitante.id);
      expect((await chamar('patch', gestor, `/${aprovada}/aprovar`)).status).toBe(200);
      expect((await chamar('patch', gestor, `/${recusada}/recusar`, { motivo: 'x' })).status).toBe(200);
      expect(await solicitacaoViagemService.expirarAprovadas()).toBeGreaterThanOrEqual(1);
      for (const id of [aprovada, recusada, expirada]) {
        for (const tipo of DOS_TIPOS) expect(await avisos(id, tipo)).toEqual([]);
      }
    });
  });
});
