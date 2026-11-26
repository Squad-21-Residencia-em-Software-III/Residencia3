import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { configNotificacoes } from '../config/notificacoes';
import { db } from '../config/database';
import { env } from '../config/env';
import { tipoUsuarioDoPerfil, type Perfil } from '../constants/perfis';
import { publicarNotificacao } from '../services/publicacaoNotificacoes';
import { usarBancoComExclusividade } from './exclusividadeNoBanco';

// SCRUM-241: métricas da liberação dos avisos, pela rota real e no PostgreSQL. Só roda num banco descartável
// explicitamente identificado, depois de `npm run migrate`.
const habilitado = process.env.SCRUM241_POSTGRES_TESTS === '1';
const nonce = () => randomBytes(8).toString('hex');
const ROTA = '/api/notificacoes/metricas';

interface Pessoa { id: number; email: string; token: string }

async function pessoa(perfil: Perfil): Promise<Pessoa> {
  const email = `${nonce()}@testes.invalid`;
  const [u] = await db('usuarios').insert({
    nome: 'Teste métricas', email, senha: 'hash-de-teste', perfil, tipo_usuario: tipoUsuarioDoPerfil(perfil),
  }).returning(['id', 'versao_sessao']);
  const token = jwt.sign(
    { typ: 'access', perfil, sv: u.versao_sessao, sessao_exp: Math.floor(Date.now() / 1000) + 3600 },
    env.jwtSecret,
    { algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web', subject: String(u.id), expiresIn: 1800 }
  );
  return { id: u.id, email, token };
}

const consultar = (p: Pessoa) => request(app).get(ROTA).set({ Authorization: `Bearer ${p.token}` });

async function aparelho(usuario_id: number) {
  const endpoint = `https://fcm.googleapis.com/fcm/send/${nonce()}`;
  const [linha] = await db('push_subscriptions')
    .insert({ usuario_id, endpoint, p256dh: nonce(), auth: nonce() })
    .returning(['id', 'endpoint']);
  return linha as { id: number; endpoint: string };
}

describe.skipIf(!habilitado)('Métricas dos avisos (SCRUM-241) em PostgreSQL descartável', () => {
  usarBancoComExclusividade();
  beforeAll(() => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('A suíte exige PostgreSQL descartável em 127.0.0.1/frotas_teste');
    }
  });
  beforeEach(async () => {
    configNotificacoes.ativas = true;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    // A suíte está sozinha no banco: fila limpa a cada caso
    await db('notificacao_outbox').del();
  });
  afterEach(() => {
    configNotificacoes.ativas = false;
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await db.destroy();
  });

  it('resume a fila, os aparelhos e os avisos da janela, sem dado pessoal', async () => {
    const admin = await pessoa('ADMINISTRADOR');
    const usuario = await pessoa('SOLICITANTE');
    const antes = (await consultar(admin)).body;

    await db.transaction(async (trx) => {
      for (let i = 0; i < 6; i += 1) {
        await publicarNotificacao(trx, {
          tipo: 'SOLICITACAO_APROVADA', operacao: 'Administrativo', titulo: 'Solicitação aprovada',
          mensagem: 'Motivo sigiloso do pedido.', urlDestino: '/solicitacoes',
          referencia: { tipo: 'SOLICITACAO_VIAGEM', id: 900 + i }, ocorrencia: '1', autorId: null,
          destinatarios: [usuario.id],
          push: { categoria: 'SOLICITACOES', titulo: 'Solicitação aprovada', corpo: 'Sua solicitação foi aprovada.' },
        });
      }
    });
    const ids: number[] = await db('notificacao_outbox').where({ usuario_id: usuario.id }).orderBy('id').pluck('id');
    expect(ids).toHaveLength(6);
    const agora = db.raw('clock_timestamp()');
    const encerrar = (id: number, status: string, ultimo_erro: string | null) =>
      db('notificacao_outbox').where({ id }).update({ status, ultimo_erro, processado_em: agora });
    await encerrar(ids[0], 'ENVIADO', null);
    await encerrar(ids[1], 'ENVIADO', 'ENTREGA_PARCIAL');
    await encerrar(ids[2], 'IGNORADO', 'CATEGORIA_DESLIGADA');
    // Texto livre nunca sai na métrica, mesmo que alguém grave um
    await encerrar(ids[3], 'FALHA_DEFINITIVA', `Falhou para ${usuario.email}`);
    await db('notificacao_outbox').where({ id: ids[4] }).update({ criado_em: db.raw(`clock_timestamp() - interval '2 hours'`) });
    // Fora da janela de 24 h
    await db('notificacao_outbox').where({ id: ids[5] }).update({
      status: 'IGNORADO', ultimo_erro: 'PRAZO_ENCERRADO',
      criado_em: db.raw(`clock_timestamp() - interval '31 hours'`), processado_em: db.raw(`clock_timestamp() - interval '30 hours'`),
    });

    const ativos = [await aparelho(usuario.id), await aparelho(usuario.id), await aparelho(admin.id)];
    const expirado = await aparelho(usuario.id);
    await db('push_subscriptions').where({ id: expirado.id })
      .update({ status: 'EXPIRADA', ativa: false, expirada_em: db.raw('clock_timestamp()') });

    const resposta = await consultar(admin);
    expect(resposta.status).toBe(200);
    expect(resposta.headers['cache-control']).toBe('no-store');
    const depois = resposta.body;

    expect(depois.janela_horas).toBe(24);
    expect(depois.configuracao).toEqual({ notificacoes_ativas: true, push_configurado: env.webPush !== null });
    expect(depois.fila).toMatchObject({
      pendentes: 1,
      processando: 0,
      encerrados: { enviados: 1, parciais: 1, ignorados: 1, falhas: 1 },
      motivos: { CATEGORIA_DESLIGADA: 1, OUTRO: 1 },
    });
    expect(depois.fila.pendente_mais_antigo_segundos).toBeGreaterThanOrEqual(2 * 3600);
    expect(depois.fila.pendente_mais_antigo_segundos).toBeLessThan(2 * 3600 + 300);
    expect(depois.aparelhos.ativos - antes.aparelhos.ativos).toBe(3);
    expect(depois.aparelhos.usuarios - antes.aparelhos.usuarios).toBe(2);
    expect(depois.aparelhos.expirados_na_janela - antes.aparelhos.expirados_na_janela).toBe(1);
    expect(depois.avisos.criados_na_janela - antes.avisos.criados_na_janela).toBe(6);

    const texto = JSON.stringify(depois);
    for (const sigilo of [usuario.email, 'Motivo sigiloso', 'fcm.googleapis.com', ...ativos.map((a) => a.endpoint)]) {
      expect(texto).not.toContain(sigilo);
    }
    expect(texto).not.toMatch(new RegExp(`"(usuario_id|endpoint|p256dh|auth|titulo|mensagem)"`));
  });

  it('sem pendências, o mais antigo é nulo', async () => {
    const admin = await pessoa('ADMINISTRADOR');
    const { body } = await consultar(admin);
    expect(body.fila).toMatchObject({ pendentes: 0, processando: 0, pendente_mais_antigo_segundos: null });
  });

  it('só o Administrador consulta', async () => {
    for (const perfil of ['SOLICITANTE', 'GESTOR_FROTA', 'GESTOR_SVO', 'MOTORISTA_FROTA', 'MOTORISTA_SVO'] as Perfil[]) {
      expect((await consultar(await pessoa(perfil))).status).toBe(403);
    }
    expect((await request(app).get(ROTA)).status).toBe(401);
  });
});
