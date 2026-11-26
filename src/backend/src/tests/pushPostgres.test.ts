import { createECDH, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateVAPIDKeys } from 'web-push';
import { app } from '../app';
import { configNotificacoes } from '../config/notificacoes';
import { db } from '../config/database';
import { env, HOSTS_PUSH_PADRAO } from '../config/env';
import { tipoUsuarioDoPerfil, type Perfil } from '../constants/perfis';
import { criarEnviadorWebPush, type TransporteHttp } from '../services/enviadorWebPush';
import { definirEnviadorPush, processarFilaPush, type EnviadorPush } from '../services/filaPush';
import { publicarNotificacao, type EventoNotificacao } from '../services/publicacaoNotificacoes';
import { usarBancoComExclusividade } from './exclusividadeNoBanco';

// SCRUM-237 de ponta a ponta no PostgreSQL: rotas reais (sessão por JWT), regras do banco (SCRUM-236),
// publicação e fila (SCRUM-229) e o enviador Web Push com cifra e VAPID reais. Só o destino HTTP é falso.
// Só roda num banco descartável explicitamente identificado, depois de `npm run migrate`.
const habilitado = process.env.SCRUM237_POSTGRES_TESTS === '1';
const nonce = () => randomBytes(8).toString('hex');
const BASE = '/api/notificacoes';
const vapid = generateVAPIDKeys();

interface Pessoa { id: number; token: string }

async function pessoa(perfil = 'SOLICITANTE'): Promise<Pessoa> {
  const [u] = await db('usuarios').insert({
    nome: 'Teste push', email: `${nonce()}@testes.invalid`, senha: 'hash-de-teste', perfil, tipo_usuario: tipoUsuarioDoPerfil(perfil as Perfil),
  }).returning(['id', 'versao_sessao']);
  const token = jwt.sign(
    { typ: 'access', perfil, sv: u.versao_sessao, sessao_exp: Math.floor(Date.now() / 1000) + 3600 },
    env.jwtSecret,
    { algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web', subject: String(u.id), expiresIn: 1800 }
  );
  return { id: u.id, token };
}

// Chaves de aparelho de verdade: o enviador real precisa conseguir cifrar
function aparelho() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${nonce()}`,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  };
}

const com = (p: Pessoa) => ({ Authorization: `Bearer ${p.token}` });
const assinar = (p: Pessoa, corpo = aparelho()) => request(app).post(`${BASE}/subscribe`).set(com(p)).send(corpo);
const ligarCategoria = (p: Pessoa, codigo = 'VIAGENS', push = true) =>
  request(app).patch(`${BASE}/preferencias/${codigo}`).set(com(p)).send({ push });
const assinaturasDe = (usuario_id: number) => db('push_subscriptions').where({ usuario_id }).orderBy('id');
const filaDe = (usuario_id: number) => db('notificacao_outbox').where({ usuario_id }).orderBy('id');

const evento = (destinatarios: number[], dados: Partial<EventoNotificacao> = {}): EventoNotificacao => ({
  tipo: 'VIAGEM_AGENDADA', operacao: 'Administrativo', titulo: 'Viagem agendada', mensagem: 'Saída às 14:00.',
  urlDestino: '/viagens', ocorrencia: nonce(), autorId: null, destinatarios,
  push: { categoria: 'VIAGENS', titulo: 'Viagem agendada', corpo: 'Você tem uma viagem.', tag: 'viagem-900' },
  ...dados,
});

// Serviço de push falso por endpoint: responde o status escolhido e guarda o que chegou
function servicoDePush(respostas: Record<string, number | { status: number; retryAfter?: string }> = {}) {
  const recebidos: string[] = [];
  const transporte: TransporteHttp = async (url) => {
    recebidos.push(url);
    const r = respostas[url] ?? 201;
    const { status, retryAfter } = typeof r === 'number' ? { status: r, retryAfter: undefined } : r;
    return new Response(null, { status, headers: retryAfter ? { 'Retry-After': retryAfter } : {} });
  };
  return { recebidos, enviador: criarEnviadorWebPush({ ...vapid, subject: 'mailto:frota@fsph.invalid', hostsPermitidos: HOSTS_PUSH_PADRAO }, transporte) };
}

describe.skipIf(!habilitado)('Alertas no aparelho (SCRUM-237) em PostgreSQL descartável', () => {
  usarBancoComExclusividade();
  beforeAll(() => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('A suíte exige PostgreSQL descartável em 127.0.0.1/frotas_teste');
    }
  });
  beforeEach(async () => {
    configNotificacoes.ativas = true;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    (env as { webPush: unknown }).webPush = { ...vapid, subject: 'mailto:frota@fsph.invalid', hostsPermitidos: HOSTS_PUSH_PADRAO };
    // A suíte está sozinha no banco (usarBancoComExclusividade): fila limpa a cada caso
    await db('notificacao_outbox').del();
  });
  afterEach(() => {
    configNotificacoes.ativas = false;
    definirEnviadorPush(null);
    (env as { webPush: unknown }).webPush = null;
    vi.restoreAllMocks();
  });
  afterAll(() => db.destroy());

  it('mantém S6/S7 no sino e considera só avisos Push elegíveis no App Badge', async () => {
    const p = await pessoa('MOTORISTA_SVO');
    const consultar = (rota: string) => request(app).get(`${BASE}/${rota}`).set(com(p));
    expect((await ligarCategoria(p, 'SVO')).status).toBe(200);
    for (const tipo of ['SVO_CHEGADA_LOCAL', 'SVO_COLETA_CONCLUIDA']) {
      await db.transaction((trx) => publicarNotificacao(trx, evento([p.id], { tipo, operacao: 'SVO', push: undefined })));
    }
    expect((await consultar('contador')).body.nao_lidas).toBe(2);
    expect((await consultar('badge')).body).toEqual({ elegiveis: 0 });
    await db.transaction((trx) => publicarNotificacao(trx, evento([p.id], {
      tipo: 'EXCECAO_ODOMETRO_DECIDIDA', operacao: 'SVO',
      push: { categoria: 'SVO', titulo: 'Decisão', corpo: 'Confira a decisão.' },
    })));
    expect((await consultar('contador')).body.nao_lidas).toBe(3);
    expect((await consultar('badge')).body).toEqual({ elegiveis: 1 });
    const [item] = await filaDe(p.id);
    await request(app).patch(`${BASE}/${item.notificacao_id}/lida`).set(com(p));
    expect((await consultar('badge')).body).toEqual({ elegiveis: 0 });
    configNotificacoes.ativas = false;
    const disponibilidade = await request(app).get(`${BASE}/push-disponivel`);
    expect(disponibilidade.body).toEqual({ ativo: false });
    expect(disponibilidade.headers['cache-control']).toBe('no-store');
  });

  describe('Assinatura', () => {
    it('cria (201) e renova (204) o mesmo aparelho sem duplicar, trocando as chaves', async () => {
      const p = await pessoa();
      const dispositivo = aparelho();
      expect((await assinar(p, dispositivo)).status).toBe(201);
      const novasChaves = { ...dispositivo, keys: aparelho().keys };
      expect((await assinar(p, novasChaves)).status).toBe(204);
      const linhas = await assinaturasDe(p.id);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({ endpoint: dispositivo.endpoint, p256dh: novasChaves.keys.p256dh, status: 'ATIVA', ativa: true });
    });

    it('aparelho de outra conta: 409 e nada é transferido', async () => {
      const [a, b] = [await pessoa(), await pessoa()];
      const dispositivo = aparelho();
      await assinar(a, dispositivo);
      const resposta = await assinar(b, dispositivo);
      expect(resposta.status).toBe(409);
      expect(resposta.body.codigo).toBe('PUSH_ENDPOINT_EM_USO');
      expect(await assinaturasDe(b.id)).toHaveLength(0);
      expect((await assinaturasDe(a.id))[0]).toMatchObject({ endpoint: dispositivo.endpoint, ativa: true });
    });

    it('limite de 5 aparelhos: o 6º recebe 409, renovar um existente continua valendo', async () => {
      const p = await pessoa();
      const aparelhos = Array.from({ length: 5 }, aparelho);
      for (const d of aparelhos) expect((await assinar(p, d)).status).toBe(201);
      const sexto = await assinar(p);
      expect(sexto.status).toBe(409);
      expect(sexto.body).toMatchObject({ codigo: 'PUSH_LIMITE_DISPOSITIVOS' });
      expect(sexto.body.erro).toContain('5 aparelhos');
      expect((await assinar(p, aparelhos[0])).status).toBe(204);
    });

    it('aparelho expirado (404/410) não conta no limite e pode ser religado', async () => {
      const p = await pessoa();
      const aparelhos = Array.from({ length: 5 }, aparelho);
      for (const d of aparelhos) await assinar(p, d);
      await db('push_subscriptions').where({ endpoint: aparelhos[0]!.endpoint })
        .update({ status: 'EXPIRADA', ativa: false, expirada_em: db.fn.now(), ultimo_erro_em: db.fn.now() });
      expect((await assinar(p)).status).toBe(201);
      // Religar o expirado agora passaria de 5 ativos
      expect((await assinar(p, aparelhos[0])).status).toBe(409);
      await request(app).delete(`${BASE}/unsubscribe`).set(com(p)).send({ endpoint: aparelhos[1]!.endpoint });
      expect((await assinar(p, aparelhos[0])).status).toBe(204);
      expect((await db('push_subscriptions').where({ endpoint: aparelhos[0]!.endpoint }).first()))
        .toMatchObject({ status: 'ATIVA', ativa: true, expirada_em: null });
    });

    it('situação: true só para o dono; outra conta recebe false sem saber de quem é', async () => {
      const [a, b] = [await pessoa(), await pessoa()];
      const dispositivo = aparelho();
      await assinar(a, dispositivo);
      const status = (p: Pessoa) => request(app).post(`${BASE}/subscribe/status`).set(com(p)).send({ endpoint: dispositivo.endpoint });
      expect((await status(a)).body).toEqual({ ativa: true, vinculo: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
      expect((await status(b)).body).toEqual({ ativa: false });
    });

    it('renova o vínculo em um novo ciclo mesmo com o mesmo endpoint e as mesmas chaves', async () => {
      const p = await pessoa();
      const dispositivo = aparelho();
      const status = () => request(app).post(`${BASE}/subscribe/status`).set(com(p)).send({ endpoint: dispositivo.endpoint });
      expect((await assinar(p, dispositivo)).status).toBe(201);
      const inicial = (await status()).body.vinculo;
      expect(inicial).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect((await assinar(p, dispositivo)).status).toBe(204);
      expect((await status()).body.vinculo).toBe(inicial);

      await db('push_subscriptions').where({ endpoint: dispositivo.endpoint })
        .update({ status: 'EXPIRADA', ativa: false, expirada_em: db.fn.now() });
      expect((await status()).body).toEqual({ ativa: false });
      expect((await assinar(p, dispositivo)).status).toBe(204);
      const reativado = (await status()).body.vinculo;
      expect(reativado).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(reativado).not.toBe(inicial);

      expect((await request(app).delete(`${BASE}/unsubscribe`).set(com(p)).send({ endpoint: dispositivo.endpoint })).status).toBe(204);
      expect((await assinar(p, dispositivo)).status).toBe(201);
      const recriado = (await status()).body.vinculo;
      expect(recriado).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(recriado).not.toBe(reativado);
    });

    it('cancelar apaga só o aparelho do próprio usuário; repetir responde 204', async () => {
      const [a, b] = [await pessoa(), await pessoa()];
      const [d1, d2] = [aparelho(), aparelho()];
      await assinar(a, d1);
      await assinar(a, d2);
      // Outra conta não consegue apagar
      expect((await request(app).delete(`${BASE}/unsubscribe`).set(com(b)).send({ endpoint: d1.endpoint })).status).toBe(204);
      expect(await assinaturasDe(a.id)).toHaveLength(2);
      for (let i = 0; i < 2; i += 1) {
        expect((await request(app).delete(`${BASE}/unsubscribe`).set(com(a)).send({ endpoint: d1.endpoint })).status).toBe(204);
      }
      expect((await assinaturasDe(a.id)).map((s) => s.endpoint)).toEqual([d2.endpoint]);
    });

    it('logout mantém as preferências e os outros aparelhos; o unsubscribe da saída vale com o token da sessão', async () => {
      const p = await pessoa();
      const [esteAparelho, outro] = [aparelho(), aparelho()];
      await assinar(p, esteAparelho);
      await assinar(p, outro);
      await ligarCategoria(p);
      // Como o front faz ao sair: unsubscribe com o token da sessão que está acabando, depois logout
      expect((await request(app).delete(`${BASE}/unsubscribe`).set(com(p)).send({ endpoint: esteAparelho.endpoint })).status).toBe(204);
      expect((await request(app).post('/api/auth/logout').set('Origin', 'http://localhost:5173')).status).toBe(204);
      expect((await assinaturasDe(p.id)).map((s) => s.endpoint)).toEqual([outro.endpoint]);
      expect(await db('preferencias_notificacao').where({ usuario_id: p.id, categoria: 'VIAGENS' }).first())
        .toMatchObject({ habilitado: true });
    });
  });

  describe('Preferências', () => {
    it('padrão desligado, salva a escolha e devolve só as categorias do perfil', async () => {
      const p = await pessoa('MOTORISTA_FROTA');
      const antes = await request(app).get(`${BASE}/preferencias`).set(com(p));
      expect(antes.body.categorias.map((c: { codigo: string; push: boolean }) => [c.codigo, c.push]))
        .toEqual([['VIAGENS', false], ['ODOMETRO', false]]);
      expect((await ligarCategoria(p, 'VIAGENS')).body).toMatchObject({ codigo: 'VIAGENS', push: true });
      expect((await ligarCategoria(p, 'VIAGENS', false)).status).toBe(200);
      expect((await ligarCategoria(p, 'VIAGENS')).status).toBe(200);
      expect(await db('preferencias_notificacao').where({ usuario_id: p.id })).toHaveLength(1);
      expect((await ligarCategoria(p, 'SVO')).status).toBe(404);
      const depois = await request(app).get(`${BASE}/preferencias`).set(com(p));
      expect(depois.body.categorias[0]).toMatchObject({ codigo: 'VIAGENS', push: true });
    });
  });

  describe('Envio pela fila (enviador real, serviço de push falso)', () => {
    it('só envia depois do commit; operação desfeita não envia', async () => {
      const p = await pessoa();
      const d = aparelho();
      await assinar(p, d);
      await ligarCategoria(p);
      const { recebidos, enviador } = servicoDePush();
      await expect(db.transaction(async (trx) => {
        await publicarNotificacao(trx, evento([p.id]));
        throw new Error('operação desfeita');
      })).rejects.toThrow('operação desfeita');
      await processarFilaPush(enviador);
      expect(recebidos).toHaveLength(0);
      expect(await filaDe(p.id)).toHaveLength(0);

      await db.transaction((trx) => publicarNotificacao(trx, evento([p.id])));
      await processarFilaPush(enviador);
      expect(recebidos).toEqual([d.endpoint]);
      expect((await filaDe(p.id))[0]).toMatchObject({ status: 'ENVIADO' });
    });

    it('liga a fila ao registrar o enviador e envia logo após o commit', async () => {
      const p = await pessoa();
      const d = aparelho();
      await assinar(p, d);
      await ligarCategoria(p);
      const { recebidos, enviador } = servicoDePush();
      let entregue!: () => void;
      const chegou = new Promise<void>((resolve) => { entregue = resolve; });
      const observado: EnviadorPush = async (...args) => {
        const r = await enviador(...args);
        entregue();
        return r;
      };
      definirEnviadorPush(observado);
      await db.transaction((trx) => publicarNotificacao(trx, evento([p.id])));
      await chegou;
      expect(recebidos).toEqual([d.endpoint]);
    });

    it('multi-aparelho: entrega em todos; 410 num deles o expira e o outro continua', async () => {
      const p = await pessoa();
      const [d1, d2] = [aparelho(), aparelho()];
      await assinar(p, d1);
      await assinar(p, d2);
      await ligarCategoria(p);
      const { recebidos, enviador } = servicoDePush({ [d1.endpoint]: 410 });
      await db.transaction((trx) => publicarNotificacao(trx, evento([p.id])));
      await processarFilaPush(enviador);
      expect(recebidos.sort()).toEqual([d1.endpoint, d2.endpoint].sort());
      expect((await filaDe(p.id))[0]).toMatchObject({ status: 'ENVIADO' });
      const assinaturas = await assinaturasDe(p.id);
      expect(assinaturas.find((s) => s.endpoint === d1.endpoint)).toMatchObject({ status: 'EXPIRADA', ativa: false, ultimo_status_http: 410 });
      expect(assinaturas.find((s) => s.endpoint === d2.endpoint)).toMatchObject({ status: 'ATIVA', ativa: true });
    });

    it('404 do único aparelho: assinatura expirada, item encerrado, aviso no sistema mantido', async () => {
      const p = await pessoa();
      const d = aparelho();
      await assinar(p, d);
      await ligarCategoria(p);
      await db.transaction((trx) => publicarNotificacao(trx, evento([p.id])));
      await processarFilaPush(servicoDePush({ [d.endpoint]: 404 }).enviador);
      expect((await assinaturasDe(p.id))[0]).toMatchObject({ status: 'EXPIRADA' });
      expect((await filaDe(p.id))[0]).toMatchObject({ status: 'IGNORADO', ultimo_erro: 'SEM_ASSINATURA' });
      expect(await db('notificacoes').where({ usuario_id: p.id })).toHaveLength(1);
    });

    it('429 com Retry-After: adia respeitando o prazo e envia depois', async () => {
      const p = await pessoa();
      const d = aparelho();
      await assinar(p, d);
      await ligarCategoria(p);
      await db.transaction((trx) => publicarNotificacao(trx, evento([p.id])));
      await processarFilaPush(servicoDePush({ [d.endpoint]: { status: 429, retryAfter: '600' } }).enviador);
      const [item] = await filaDe(p.id);
      expect(item).toMatchObject({ status: 'PENDENTE', tentativas: 1, ultimo_status_http: 429 });
      const { rows } = await db.raw('SELECT extract(epoch FROM proxima_execucao_em - clock_timestamp()) AS s FROM notificacao_outbox WHERE id = ?', [item.id]);
      expect(Number(rows[0].s)).toBeGreaterThan(590);
      await db('notificacao_outbox').where({ id: item.id }).update({ proxima_execucao_em: db.raw("clock_timestamp() - interval '1 second'") });
      const { recebidos, enviador } = servicoDePush();
      await processarFilaPush(enviador);
      expect(recebidos).toEqual([d.endpoint]);
      expect((await filaDe(p.id))[0]).toMatchObject({ status: 'ENVIADO', tentativas: 2 });
    });

    it('5xx repetido: 5 tentativas e falha definitiva, sem expirar a assinatura', async () => {
      const p = await pessoa();
      const d = aparelho();
      await assinar(p, d);
      await ligarCategoria(p);
      await db.transaction((trx) => publicarNotificacao(trx, evento([p.id])));
      const { recebidos, enviador } = servicoDePush({ [d.endpoint]: 503 });
      for (let i = 0; i < 5; i += 1) {
        await db('notificacao_outbox').where({ usuario_id: p.id, status: 'PENDENTE' })
          .update({ proxima_execucao_em: db.raw("clock_timestamp() - interval '1 second'") });
        await processarFilaPush(enviador);
      }
      expect(recebidos).toHaveLength(5);
      expect((await filaDe(p.id))[0]).toMatchObject({ status: 'FALHA_DEFINITIVA', tentativas: 5, ultimo_status_http: 503 });
      expect((await assinaturasDe(p.id))[0]).toMatchObject({ status: 'ATIVA', falhas_consecutivas: 5 });
    });

    it('categoria desligada: não envia, e o aviso dentro do sistema continua', async () => {
      const p = await pessoa();
      await assinar(p);
      await ligarCategoria(p, 'VIAGENS', false);
      await db.transaction((trx) => publicarNotificacao(trx, evento([p.id])));
      const { recebidos, enviador } = servicoDePush();
      await processarFilaPush(enviador);
      expect(recebidos).toHaveLength(0);
      expect((await filaDe(p.id))[0]).toMatchObject({ status: 'IGNORADO', ultimo_erro: 'CATEGORIA_DESLIGADA' });
      expect(await db('notificacoes').where({ usuario_id: p.id })).toHaveLength(1);
    });

    it('sem push no evento ou sem assinatura: só o aviso dentro do sistema', async () => {
      const [semPush, semAparelho] = [await pessoa(), await pessoa()];
      await ligarCategoria(semAparelho);
      await db.transaction((trx) => publicarNotificacao(trx, evento([semPush.id], { push: undefined })));
      await db.transaction((trx) => publicarNotificacao(trx, evento([semAparelho.id])));
      await processarFilaPush(servicoDePush().enviador);
      expect(await filaDe(semPush.id)).toHaveLength(0);
      expect((await filaDe(semAparelho.id))[0]).toMatchObject({ status: 'IGNORADO', ultimo_erro: 'SEM_ASSINATURA' });
      expect(await db('notificacoes').whereIn('usuario_id', [semPush.id, semAparelho.id])).toHaveLength(2);
    });

    it('perfil mudou depois da escolha: a categoria do perfil anterior deixa de ser enviada', async () => {
      const p = await pessoa('MOTORISTA_FROTA');
      await assinar(p);
      await ligarCategoria(p, 'ODOMETRO');
      await db('usuarios').where({ id: p.id }).update({ perfil: 'SOLICITANTE', tipo_usuario: 'SOLICITANTE' });
      await db.transaction((trx) => publicarNotificacao(trx, evento([p.id], {
        push: { categoria: 'ODOMETRO', titulo: 'Odômetro', corpo: 'Pendência.' },
      })));
      const { recebidos, enviador } = servicoDePush();
      await processarFilaPush(enviador);
      expect(recebidos).toHaveLength(0);
      expect((await filaDe(p.id))[0]).toMatchObject({ status: 'IGNORADO', ultimo_erro: 'CATEGORIA_DESLIGADA' });
    });

    it('aparelho desligado (unsubscribe) não recebe mais', async () => {
      const p = await pessoa();
      const [d1, d2] = [aparelho(), aparelho()];
      await assinar(p, d1);
      await assinar(p, d2);
      await ligarCategoria(p);
      await request(app).delete(`${BASE}/unsubscribe`).set(com(p)).send({ endpoint: d1.endpoint });
      await db.transaction((trx) => publicarNotificacao(trx, evento([p.id])));
      const { recebidos, enviador } = servicoDePush();
      await processarFilaPush(enviador);
      expect(recebidos).toEqual([d2.endpoint]);
    });
  });
});
