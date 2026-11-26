import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Rotas de alerta no aparelho (SCRUM-237) contra o contrato do front (docs/scrum-238-contrato-push.md).
// Banco simulado; as regras do banco (limite, dono do endpoint) têm suíte própria em pushPostgres.test.ts.

const { mockDb } = vi.hoisted(() => ({
  mockDb: { transaction: vi.fn(async (callback: (trx: string) => unknown) => callback('trx')) },
}));
vi.mock('../config/database', () => ({ db: mockDb }));
vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn() } }));
vi.mock('../models/pushAssinaturaModel', () => ({
  pushAssinaturaModel: {
    assinar: vi.fn(async () => ({ criada: true })),
    ativaDoUsuario: vi.fn(async () => false),
    cancelar: vi.fn(async () => undefined),
    preferencias: vi.fn(async () => new Map()),
    salvarPreferencia: vi.fn(async () => undefined),
  },
}));

import { generateVAPIDKeys } from 'web-push';
import { app } from '../app';
import { env, HOSTS_PUSH_PADRAO } from '../config/env';
import { PERFIS, type Perfil } from '../constants/perfis';
import { pushAssinaturaModel } from '../models/pushAssinaturaModel';
import { authService } from '../services/authService';

const vapid = generateVAPIDKeys();
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/dispositivo-1';
const corpoValido = () => ({
  endpoint: ENDPOINT,
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
});
const BASE = '/api/notificacoes';

const autenticarComo = (perfil: Perfil = PERFIS.SOLICITANTE, id = 7) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id, perfil, ativo: true } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);
const ligarPush = () => {
  (env as { webPush: unknown }).webPush = { ...vapid, subject: 'mailto:frota@fsph.invalid', hostsPermitidos: HOSTS_PUSH_PADRAO };
};
const erroDoBanco = (message: string) => Object.assign(new Error(message), { code: '23514' });

beforeEach(() => {
  vi.clearAllMocks();
  autenticarComo();
  ligarPush();
});
afterEach(() => {
  (env as { webPush: unknown }).webPush = null;
});

describe('Rotas de alerta no aparelho: sessão', () => {
  it.each([
    ['get', '/vapid-public-key'],
    ['post', '/subscribe'],
    ['post', '/subscribe/status'],
    ['delete', '/unsubscribe'],
    ['get', '/preferencias'],
    ['patch', '/preferencias/VIAGENS'],
  ] as const)('%s %s exige sessão (401)', async (metodo, rota) => {
    const resposta = await request(app)[metodo](`${BASE}${rota}`).send({});
    expect(resposta.status).toBe(401);
  });

  it('não guarda as respostas no cache do navegador', async () => {
    const resposta = await request(app).get(`${BASE}/vapid-public-key`).set('Authorization', 'Bearer x');
    expect(resposta.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /vapid-public-key', () => {
  it('entrega só a chave pública', async () => {
    const resposta = await request(app).get(`${BASE}/vapid-public-key`).set('Authorization', 'Bearer x');
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ publicKey: vapid.publicKey });
    expect(JSON.stringify(resposta.body)).not.toContain(vapid.privateKey);
  });

  it('responde 503 com o push desligado', async () => {
    (env as { webPush: unknown }).webPush = null;
    const resposta = await request(app).get(`${BASE}/vapid-public-key`).set('Authorization', 'Bearer x');
    expect(resposta.status).toBe(503);
    expect(resposta.body).toMatchObject({ codigo: 'PUSH_DESLIGADO' });
  });
});

describe('POST /subscribe', () => {
  const assinar = (corpo: unknown, ua = 'Mozilla/5.0 (Android)') =>
    request(app).post(`${BASE}/subscribe`).set('Authorization', 'Bearer x').set('User-Agent', ua).send(corpo as object);

  it('cria (201) para o usuário da sessão', async () => {
    const resposta = await assinar(corpoValido());
    expect(resposta.status).toBe(201);
    expect(pushAssinaturaModel.assinar).toHaveBeenCalledWith(
      { usuario_id: 7, endpoint: ENDPOINT, p256dh: corpoValido().keys.p256dh, auth: corpoValido().keys.auth, user_agent: 'Mozilla/5.0 (Android)' },
      'trx'
    );
  });

  it('renovação do mesmo aparelho responde 204 (idempotente)', async () => {
    vi.mocked(pushAssinaturaModel.assinar).mockResolvedValueOnce({ criada: false });
    expect((await assinar(corpoValido())).status).toBe(204);
  });

  it('recusa usuario_id ou campo extra do cliente', async () => {
    const resposta = await assinar({ ...corpoValido(), usuario_id: 99 });
    expect(resposta.status).toBe(400);
    expect(pushAssinaturaModel.assinar).not.toHaveBeenCalled();
  });

  it.each([
    ['http', 'http://fcm.googleapis.com/fcm/send/x'],
    ['rede interna', 'https://169.254.169.254/latest/meta-data/x'],
    ['host parecido', 'https://fcm.googleapis.com.golpe.invalid/x/abc'],
    ['localhost', 'https://localhost/push/abcdef'],
    ['com credenciais', 'https://user:senha@fcm.googleapis.com/x'],
    ['porta própria', 'https://fcm.googleapis.com:8443/fcm/send/x'],
  ])('recusa endpoint fora dos serviços de push (%s)', async (_caso, endpoint) => {
    const resposta = await assinar({ ...corpoValido(), endpoint });
    expect(resposta.status).toBe(400);
    expect(pushAssinaturaModel.assinar).not.toHaveBeenCalled();
  });

  it.each([
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/QGx1Y2Fz',
  ])('aceita serviço de push conhecido: %s', async (endpoint) => {
    expect((await assinar({ ...corpoValido(), endpoint })).status).toBe(201);
  });

  it.each([
    ['sem chaves', { endpoint: ENDPOINT }],
    ['p256dh curta', { endpoint: ENDPOINT, keys: { p256dh: 'abc', auth: 'tBHItJI5svbpez7KI4CCXg' } }],
    ['auth com caractere inválido', { endpoint: ENDPOINT, keys: { p256dh: corpoValido().keys.p256dh, auth: 'tBHItJI5<script>' } }],
    ['chaves iguais', { endpoint: ENDPOINT, keys: { p256dh: 'tBHItJI5svbpez7KI4CCXg', auth: 'tBHItJI5svbpez7KI4CCXg' } }],
  ])('recusa assinatura inválida (%s)', async (_caso, corpo) => {
    expect((await assinar(corpo)).status).toBe(400);
  });

  it('endpoint de outra conta: 409 sem dizer de quem é', async () => {
    vi.mocked(pushAssinaturaModel.assinar).mockRejectedValueOnce(
      erroDoBanco('Transferencia de endpoint de push_subscriptions entre usuarios distintos nao e permitida.')
    );
    const resposta = await assinar(corpoValido());
    expect(resposta.status).toBe(409);
    expect(resposta.body).toMatchObject({ codigo: 'PUSH_ENDPOINT_EM_USO' });
    expect(JSON.stringify(resposta.body)).not.toMatch(/usuario|\d{2,}/i);
  });

  it('limite de aparelhos: 409 com o motivo em erro, sem o id do usuário', async () => {
    vi.mocked(pushAssinaturaModel.assinar).mockRejectedValueOnce(
      erroDoBanco('Limite maximo de 5 dispositivos ativos com Web Push atingido para o usuario 7.')
    );
    const resposta = await assinar(corpoValido());
    expect(resposta.status).toBe(409);
    expect(resposta.body).toMatchObject({ codigo: 'PUSH_LIMITE_DISPOSITIVOS' });
    expect(resposta.body.erro).toContain('5 aparelhos');
    expect(resposta.body.erro).not.toContain('7');
  });

  it('push desligado: 503 sem gravar', async () => {
    (env as { webPush: unknown }).webPush = null;
    const resposta = await assinar(corpoValido());
    expect(resposta.status).toBe(503);
    expect(pushAssinaturaModel.assinar).not.toHaveBeenCalled();
  });

  it('guarda o User-Agent sem caracteres de controle e no tamanho da coluna', async () => {
    await assinar(corpoValido(), `${'a'.repeat(300)}`);
    const [dados] = vi.mocked(pushAssinaturaModel.assinar).mock.calls[0]!;
    expect(dados.user_agent).toHaveLength(255);
  });

  it('não registra endpoint nem chaves no log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(pushAssinaturaModel.assinar).mockRejectedValueOnce(new Error(`falha ${ENDPOINT}`));
    expect((await assinar(corpoValido())).status).toBe(500);
    const escrito = [...log.mock.calls, ...erro.mock.calls].flat().join('\n');
    expect(escrito).not.toContain('dispositivo-1');
    expect(escrito).not.toContain(corpoValido().keys.auth);
    log.mockRestore();
    erro.mockRestore();
  });
});

describe('POST /subscribe/status e DELETE /unsubscribe', () => {
  it('situação: true só para a assinatura ativa do próprio usuário', async () => {
    vi.mocked(pushAssinaturaModel.ativaDoUsuario).mockResolvedValueOnce(true);
    const resposta = await request(app).post(`${BASE}/subscribe/status`).set('Authorization', 'Bearer x').send({ endpoint: ENDPOINT });
    expect(resposta.body).toEqual({ ativa: true });
    expect(pushAssinaturaModel.ativaDoUsuario).toHaveBeenCalledWith(7, ENDPOINT);
  });

  it('situação: false para endpoint de outra conta ou desconhecido', async () => {
    const resposta = await request(app).post(`${BASE}/subscribe/status`).set('Authorization', 'Bearer x').send({ endpoint: ENDPOINT });
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ ativa: false });
  });

  it('cancelar responde 204, também repetido, e só sobre o próprio usuário', async () => {
    for (let i = 0; i < 2; i += 1) {
      const resposta = await request(app).delete(`${BASE}/unsubscribe`).set('Authorization', 'Bearer x').send({ endpoint: ENDPOINT });
      expect(resposta.status).toBe(204);
    }
    expect(pushAssinaturaModel.cancelar).toHaveBeenCalledWith(7, ENDPOINT);
  });

  it('cancelar funciona com o push desligado', async () => {
    (env as { webPush: unknown }).webPush = null;
    const resposta = await request(app).delete(`${BASE}/unsubscribe`).set('Authorization', 'Bearer x').send({ endpoint: ENDPOINT });
    expect(resposta.status).toBe(204);
  });

  it('exige o endpoint no corpo', async () => {
    const resposta = await request(app).delete(`${BASE}/unsubscribe`).set('Authorization', 'Bearer x').send({});
    expect(resposta.status).toBe(400);
  });
});

describe('Preferências por categoria', () => {
  it('lista só as categorias do perfil, desligadas sem escolha registrada', async () => {
    autenticarComo(PERFIS.MOTORISTA_FROTA);
    vi.mocked(pushAssinaturaModel.preferencias).mockResolvedValueOnce(new Map([['VIAGENS', true], ['SVO', true]]));
    const resposta = await request(app).get(`${BASE}/preferencias`).set('Authorization', 'Bearer x');
    expect(resposta.status).toBe(200);
    expect(resposta.body.categorias.map((c: { codigo: string; push: boolean }) => [c.codigo, c.push])).toEqual([
      ['VIAGENS', true],
      ['ODOMETRO', false],
    ]);
    expect(resposta.body.categorias[0]).toEqual({
      codigo: 'VIAGENS', titulo: 'Viagens', descricao: 'Agendamento, mudança e cancelamento.', push: true,
    });
  });

  it.each([
    [PERFIS.ADMINISTRADOR, ['SOLICITACOES']],
    [PERFIS.SOLICITANTE, ['SOLICITACOES', 'VIAGENS']],
    [PERFIS.GESTOR_FROTA, ['SOLICITACOES', 'VIAGENS', 'ODOMETRO']],
    [PERFIS.GESTOR_SVO, ['SVO']],
    [PERFIS.MOTORISTA_SVO, ['SVO']],
    [PERFIS.INTEGRANTE_SVO, ['SVO']],
  ])('%s vê %j', async (perfil, codigos) => {
    autenticarComo(perfil);
    const resposta = await request(app).get(`${BASE}/preferencias`).set('Authorization', 'Bearer x');
    expect(resposta.body.categorias.map((c: { codigo: string }) => c.codigo)).toEqual(codigos);
  });

  it('lista com o push desligado (as preferências continuam disponíveis)', async () => {
    (env as { webPush: unknown }).webPush = null;
    expect((await request(app).get(`${BASE}/preferencias`).set('Authorization', 'Bearer x')).status).toBe(200);
  });

  it('salva a escolha do usuário da sessão e devolve a categoria', async () => {
    const resposta = await request(app).patch(`${BASE}/preferencias/VIAGENS`).set('Authorization', 'Bearer x').send({ push: true });
    expect(resposta.status).toBe(200);
    expect(resposta.body).toMatchObject({ codigo: 'VIAGENS', push: true });
    expect(pushAssinaturaModel.salvarPreferencia).toHaveBeenCalledWith(7, 'VIAGENS', true);
  });

  it.each(['SVO', 'INEXISTENTE'])('categoria fora do perfil (%s): 404 sem gravar', async (codigo) => {
    const resposta = await request(app).patch(`${BASE}/preferencias/${codigo}`).set('Authorization', 'Bearer x').send({ push: true });
    expect(resposta.status).toBe(404);
    expect(pushAssinaturaModel.salvarPreferencia).not.toHaveBeenCalled();
  });

  it.each([
    ['código inválido', 'viagens', { push: true }],
    ['push não booleano', 'VIAGENS', { push: 'sim' }],
    ['campo extra', 'VIAGENS', { push: true, usuario_id: 1 }],
  ])('recusa %s (400)', async (_caso, codigo, corpo) => {
    const resposta = await request(app).patch(`${BASE}/preferencias/${codigo}`).set('Authorization', 'Bearer x').send(corpo);
    expect(resposta.status).toBe(400);
  });
});
