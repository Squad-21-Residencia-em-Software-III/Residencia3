import { createECDH, createPublicKey, randomBytes, verify } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateVAPIDKeys } from 'web-push';
import { HOSTS_PUSH_PADRAO } from '../config/env';
import type { PayloadPush } from '../models/notificacaoOutboxModel';
import {
  conteudoDoPush,
  criarEnviadorWebPush,
  segundosRetryAfter,
  type TransporteHttp,
} from '../services/enviadorWebPush';

// Envio Web Push (SCRUM-237) sem simular a biblioteca: cifra e VAPID reais, conferidos como um serviço de push
// conferiria (assinatura ES256 com a chave pública e decifragem com a chave do aparelho).

const vapid = generateVAPIDKeys();
const config = { ...vapid, subject: 'mailto:frota@fsph.invalid', hostsPermitidos: HOSTS_PUSH_PADRAO };
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';

// Aparelho: par de chaves e segredo como o navegador gera em pushManager.subscribe()
function aparelho() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh,
    authSecret: auth,
    assinatura: { id: 1, geracao_vinculo: 1, endpoint: ENDPOINT, p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
  };
}

const payload: PayloadPush = { notificacao_id: 42, titulo: 'Viagem agendada', corpo: 'Confira o horário.', url: '/viagens', tag: 'viagem-108' };

interface Capturada { url: string; init: RequestInit }

function transporteFalso(status = 201, cabecalhos: Record<string, string> = {}) {
  const chamadas: Capturada[] = [];
  const transporte: TransporteHttp = async (url, init) => {
    chamadas.push({ url, init });
    return new Response(status === 204 ? null : 'corpo ignorado', { status, headers: cabecalhos });
  };
  return { chamadas, transporte };
}

async function decifrar(corpo: Uint8Array, dispositivo: ReturnType<typeof aparelho>): Promise<unknown> {
  const { decrypt } = (await import('http_ece' as string)) as {
    decrypt: (buffer: Buffer, params: Record<string, unknown>) => Buffer;
  };
  const texto = decrypt(Buffer.from(corpo), {
    version: 'aes128gcm',
    privateKey: dispositivo.ecdh,
    authSecret: dispositivo.authSecret.toString('base64url'),
  });
  return JSON.parse(texto.toString('utf8'));
}

// Confere o cabeçalho "vapid t=<jwt>, k=<chave pública>" como o serviço de push faria
function conferirVapid(autorizacao: string, publica: string, origem: string) {
  const partes = /^vapid t=([^,]+), k=(.+)$/.exec(autorizacao);
  expect(partes).not.toBeNull();
  const [, jwt, k] = partes!;
  expect(k).toBe(publica);
  const [cabecalho, corpo, assinatura] = jwt!.split('.');
  const bytes = Buffer.from(publica, 'base64url');
  const chave = createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: bytes.subarray(1, 33).toString('base64url'), y: bytes.subarray(33).toString('base64url') },
    format: 'jwk',
  });
  const valida = verify('sha256', Buffer.from(`${cabecalho}.${corpo}`), { key: chave, dsaEncoding: 'ieee-p1363' },
    Buffer.from(assinatura!, 'base64url'));
  expect(valida).toBe(true);
  const declaracoes = JSON.parse(Buffer.from(corpo!, 'base64url').toString());
  expect(declaracoes).toMatchObject({ aud: origem, sub: config.subject });
  expect(declaracoes.exp).toBeGreaterThan(Date.now() / 1000);
  expect(declaracoes.exp).toBeLessThanOrEqual(Date.now() / 1000 + 24 * 3600);
}

describe('Enviador Web Push: cifra, VAPID e requisição', () => {
  it('envia cifrado (aes128gcm), assinado com VAPID e só com os campos do alerta', async () => {
    const dispositivo = aparelho();
    const { chamadas, transporte } = transporteFalso(201);
    const enviar = criarEnviadorWebPush(config, transporte);
    const extra = { ...payload, entregues: [1, 2], usuario_id: 7 } as PayloadPush;

    await expect(enviar(dispositivo.assinatura, extra, new AbortController().signal)).resolves.toEqual({ status: 201, retryAfterSegundos: 0 });

    expect(chamadas).toHaveLength(1);
    const { url, init } = chamadas[0]!;
    expect(url).toBe(ENDPOINT);
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual' });
    const cabecalhos = init.headers as Record<string, string>;
    expect(cabecalhos).toMatchObject({ 'Content-Encoding': 'aes128gcm', TTL: '86400', Urgency: 'normal', Topic: 'viagem-108' });
    conferirVapid(cabecalhos.Authorization!, vapid.publicKey, 'https://fcm.googleapis.com');
    // A chave privada nunca sai do servidor
    expect(JSON.stringify(init)).not.toContain(vapid.privateKey);

    expect(await decifrar(init.body as Uint8Array, dispositivo)).toEqual({
      vinculo: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      notificacao_id: 42, titulo: 'Viagem agendada', corpo: 'Confira o horário.', url: '/viagens', tag: 'viagem-108',
    });
  });

  it('só o aparelho dono das chaves consegue ler o conteúdo', async () => {
    const { chamadas, transporte } = transporteFalso();
    await criarEnviadorWebPush(config, transporte)(aparelho().assinatura, payload, new AbortController().signal);
    await expect(decifrar(chamadas[0]!.init.body as Uint8Array, aparelho())).rejects.toThrow();
  });

  it('repassa o cancelamento da fila para a requisição', async () => {
    const { chamadas, transporte } = transporteFalso();
    const controle = new AbortController();
    await criarEnviadorWebPush(config, transporte)(aparelho().assinatura, payload, controle.signal);
    expect(chamadas[0]!.init.signal).toBe(controle.signal);
  });

  it.each([
    [201, {}, { status: 201, retryAfterSegundos: 0 }],
    [404, {}, { status: 404, retryAfterSegundos: 0 }],
    [410, {}, { status: 410, retryAfterSegundos: 0 }],
    [429, { 'Retry-After': '120' }, { status: 429, retryAfterSegundos: 120 }],
    [503, { 'Retry-After': '99999' }, { status: 503, retryAfterSegundos: 3600 }],
    [500, {}, { status: 500, retryAfterSegundos: 0 }],
    [400, {}, { status: 400, retryAfterSegundos: 0 }],
    [301, { Location: 'http://10.0.0.1/' }, { status: 301, retryAfterSegundos: 0 }],
  ])('responde o status do serviço de push (%i) para a fila classificar', async (status, cabecalhos, esperado) => {
    const { transporte } = transporteFalso(status, cabecalhos);
    await expect(criarEnviadorWebPush(config, transporte)(aparelho().assinatura, payload, new AbortController().signal))
      .resolves.toEqual(esperado);
  });

  it('rejeita em erro de rede (a fila trata como temporário)', async () => {
    const transporte: TransporteHttp = async () => { throw new TypeError('fetch failed'); };
    await expect(criarEnviadorWebPush(config, transporte)(aparelho().assinatura, payload, new AbortController().signal))
      .rejects.toThrow('fetch failed');
  });

  it('recusa, sem requisição, endpoint de host que não é serviço de push', async () => {
    const { chamadas, transporte } = transporteFalso();
    const assinatura = { ...aparelho().assinatura, endpoint: 'https://169.254.169.254/latest/meta-data' };
    await expect(criarEnviadorWebPush(config, transporte)(assinatura, payload, new AbortController().signal))
      .resolves.toEqual({ status: 400 });
    expect(chamadas).toHaveLength(0);
  });

  it('recusa, sem requisição, chaves de aparelho que não cifram', async () => {
    const { chamadas, transporte } = transporteFalso();
    const assinatura = { ...aparelho().assinatura, p256dh: 'AAAAAAAAAAAAAAAAAAAAAA' };
    await expect(criarEnviadorWebPush(config, transporte)(assinatura, payload, new AbortController().signal))
      .resolves.toEqual({ status: 400 });
    expect(chamadas).toHaveLength(0);
  });

  it('omite o tópico quando a tag não cabe nas regras do cabeçalho', async () => {
    const { chamadas, transporte } = transporteFalso();
    await criarEnviadorWebPush(config, transporte)(aparelho().assinatura, { ...payload, tag: 'tag com espaço' }, new AbortController().signal);
    expect(chamadas[0]!.init.headers).not.toHaveProperty('Topic');
  });
});

describe('Conteúdo do alerta (LGPD)', () => {
  it('aplica de novo os limites de 45 e 110 caracteres, sem partir emoji', () => {
    const conteudo = conteudoDoPush({ ...payload, titulo: '🚗'.repeat(50), corpo: 'á'.repeat(120) });
    expect([...conteudo.titulo]).toHaveLength(45);
    expect(conteudo.titulo.endsWith('…')).toBe(true);
    expect([...conteudo.titulo.slice(0, -1)].every((c) => c === '🚗')).toBe(true);
    expect([...conteudo.corpo]).toHaveLength(110);
  });

  it.each(['https://golpe.invalid', '//golpe.invalid', 'javascript:alert(1)', '/a b', '/a\\b'])(
    'troca link externo ou malformado (%s) pela página inicial', (url) => {
      expect(conteudoDoPush({ ...payload, url }).url).toBe('/');
    }
  );

  it('leva só notificacao_id, titulo, corpo, url e tag', () => {
    const conteudo = conteudoDoPush({ ...payload, entregues: [3], email: 'x@y' } as PayloadPush);
    expect(Object.keys(conteudo).sort()).toEqual(['corpo', 'notificacao_id', 'tag', 'titulo', 'url']);
  });
});

describe('Retry-After', () => {
  const agora = Date.parse('2026-11-25T12:00:00Z');
  it.each([
    [null, 0], ['', 0], ['30', 30], ['abc', 0], ['-5', 0], ['7200', 3600],
    ['Wed, 25 Nov 2026 12:01:00 GMT', 60], ['Wed, 25 Nov 2026 11:00:00 GMT', 0],
  ])('%s → %i s', (valor, esperado) => {
    expect(segundosRetryAfter(valor, agora)).toBe(esperado);
  });
});

// Integração por HTTP de verdade: fetch nativo até um servidor local no papel do serviço de push
describe('Enviador Web Push por HTTP', () => {
  let servidor: Server;
  let recebidas: { req: IncomingMessage; corpo: Buffer }[] = [];
  let proximaResposta = { status: 201, cabecalhos: {} as Record<string, string> };
  let base = '';

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      const partes: Buffer[] = [];
      req.on('data', (p: Buffer) => partes.push(p));
      req.on('end', () => {
        recebidas.push({ req, corpo: Buffer.concat(partes) });
        res.writeHead(proximaResposta.status, proximaResposta.cabecalhos).end();
      });
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => servidor.close(() => resolve())));

  // Mesmo pedido, só o destino trocado pelo servidor local
  const transporteLocal: TransporteHttp = (url, init) => fetch(`${base}${new URL(url).pathname}`, init);

  it('entrega o alerta que o aparelho consegue decifrar', async () => {
    recebidas = [];
    proximaResposta = { status: 201, cabecalhos: {} };
    const dispositivo = aparelho();
    const resultado = await criarEnviadorWebPush(config, transporteLocal)(dispositivo.assinatura, payload, AbortSignal.timeout(5000));
    expect(resultado).toEqual({ status: 201, retryAfterSegundos: 0 });
    expect(recebidas).toHaveLength(1);
    const { req, corpo } = recebidas[0]!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/fcm/send/abc123');
    expect(req.headers).toMatchObject({ 'content-encoding': 'aes128gcm', ttl: '86400', urgency: 'normal' });
    conferirVapid(String(req.headers.authorization), vapid.publicKey, 'https://fcm.googleapis.com');
    expect(await decifrar(corpo, dispositivo)).toMatchObject({ titulo: 'Viagem agendada', url: '/viagens' });
  });

  it('lê o Retry-After de um 429 real', async () => {
    proximaResposta = { status: 429, cabecalhos: { 'Retry-After': '45' } };
    await expect(criarEnviadorWebPush(config, transporteLocal)(aparelho().assinatura, payload, AbortSignal.timeout(5000)))
      .resolves.toEqual({ status: 429, retryAfterSegundos: 45 });
  });

  it('não segue redirecionamento', async () => {
    recebidas = [];
    proximaResposta = { status: 307, cabecalhos: { Location: `${base}/outro` } };
    await expect(criarEnviadorWebPush(config, transporteLocal)(aparelho().assinatura, payload, AbortSignal.timeout(5000)))
      .resolves.toMatchObject({ status: 307 });
    expect(recebidas).toHaveLength(1);
  });

  it('cancela quando o prazo acaba', async () => {
    const controle = new AbortController();
    controle.abort();
    await expect(criarEnviadorWebPush(config, transporteLocal)(aparelho().assinatura, payload, controle.signal)).rejects.toThrow();
  });
});
