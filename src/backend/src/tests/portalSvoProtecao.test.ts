import knex from 'knex';
import { createHmac, randomBytes } from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';
import { carregarRecursosOperacionais } from '../config/recursosOperacionais';
import { PERFIS } from '../constants/perfis';
import type { Usuario } from '../models/usuarioModel';
import { authService } from '../services/authService';
import { acompanhamentoExternoSvoService } from '../services/acompanhamentoExternoSvoService';

const PUBLICO = '/api/portal-svo/mapas';
const FORMULARIO = '/api/solicitacoes-svo/externas';
const tabela = 'limites_portal_svo';
const recursosAnteriores = env.recursosOperacionais;
const portalAtivo = { PORTAL_SVO_ATIVO: 'true', MAPAS_SVO_ATIVOS: 'true' };
const executarPostgres = process.env.PORTAL_SVO_POSTGRES_TESTS === '1';

afterEach(() => {
  env.recursosOperacionais = recursosAnteriores;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('mantém o mapa público desligado e as rotas internas autenticadas', async () => {
  env.recursosOperacionais = carregarRecursosOperacionais({ PORTAL_SVO_ATIVO: 'true' });
  await request(app).get(PUBLICO + '/buscar?cep=49000-000').expect(404).expect('Cache-Control', 'private, no-store');
  await request(app).get('/api/mapas/buscar?cep=49000-000').expect(401);
  env.recursosOperacionais = carregarRecursosOperacionais({});
  await request(app).post(FORMULARIO).send({}).expect(404).expect('Cache-Control', 'private, no-store');
});

describe.skipIf(!executarPostgres)('portal SVO por HTTP com PostgreSQL descartável', () => {
  const http = vi.fn<typeof fetch>();
  const cliente = (ip: string) => request(app).get(PUBLICO + '/reverso?lat=0&lon=0').set('X-Forwarded-For', ip);
  const appTrustProxy = app.get('trust proxy');
  const admin = knex({
    client: 'pg',
    pool: { min: 0, max: 1 },
    connection: {
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_MIGRATION_USER || process.env.POSTGRES_USER,
      password: process.env.POSTGRES_MIGRATION_PASSWORD || process.env.POSTGRES_PASSWORD,
    },
  });

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1'].includes(process.env.POSTGRES_HOST ?? '') ||
        !process.env.POSTGRES_DB?.endsWith('_teste') || !process.env.POSTGRES_APP_USER) {
      throw new Error('Os testes exigem PostgreSQL local descartável com sufixo _teste e POSTGRES_APP_USER.');
    }
    const { rows } = await db.raw('SELECT current_user');
    expect(rows[0].current_user).toBe(process.env.POSTGRES_APP_USER);
  });

  beforeEach(async () => {
    env.recursosOperacionais = carregarRecursosOperacionais(portalAtivo);
    app.set('trust proxy', 1);
    await db(tabela).delete();
    http.mockReset().mockImplementation(async () => Response.json({ type: 'FeatureCollection', features: [] }));
    vi.stubGlobal('fetch', http);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    app.set('trust proxy', appTrustProxy);
  });

  afterAll(async () => {
    await Promise.all([db.destroy(), admin.destroy()]);
  });

  it('expõe CEP e reverso e rejeita texto livre, parâmetros internos e roteirização', async () => {
    await request(app).get(PUBLICO + '/buscar?q=texto+reservado').expect(400);
    await request(app).get(PUBLICO + '/buscar?cep=49000-000&operacao=SVO').expect(400);
    await request(app).get(PUBLICO + '/rota?pontos=0,0&pontos=1,1').expect(404);
    await request(app).get(PUBLICO + '/reverso?lat=0&lon=' + '1'.repeat(520)).expect(414);
    expect(http).not.toHaveBeenCalled();
    await cliente('203.0.113.10').expect(200).expect('Cache-Control', 'private, no-store');
    expect(http).toHaveBeenCalledTimes(1);
    expect(String(http.mock.calls[0]![0])).toContain('/reverse?');
  });

  it('respeita NAT, cota por IP e cota global efetiva no banco', async () => {
    const ip = '203.0.113.20';
    await cliente(ip).expect(200);
    await cliente(ip).expect(200);
    const chaveIp = createHmac('sha256', env.jwtSecret).update('portal-svo:' + ip).digest('hex');
    await db.raw(`INSERT INTO limites_portal_svo (expira_em, escopo, total)
      SELECT (floor(extract(epoch FROM clock_timestamp()) / 60) + j) * 60, ?, 12
      FROM generate_series(1, 2) j
      ON CONFLICT (expira_em, escopo) DO UPDATE SET total = excluded.total`, ['geocodificar:' + chaveIp]);
    await cliente('203.0.113.20').set('X-Vercel-Forwarded-For', '198.51.100.20').expect(429)
      .expect(({ headers }) => expect(Number(headers['retry-after'])).toBeGreaterThan(0));
    await cliente('203.0.113.21').expect(200);

    // Reserva as janelas corrente e seguinte para o teste poder cruzar o limite do segundo.
    await db.raw(`INSERT INTO limites_portal_svo (expira_em, escopo, total)
      SELECT (floor(extract(epoch FROM clock_timestamp()) / 60) + j) * 60, 'portal:minuto', 50
      FROM generate_series(1, 2) j
      ON CONFLICT (expira_em, escopo) DO UPDATE SET total = excluded.total`);
    await cliente('203.0.113.22').expect(429).expect('Cache-Control', 'private, no-store');
    expect(await db(tabela).where('escopo', 'like', '%203.0.113%')).toEqual([]);
  });

  it('usa o prefixo IPv6 do proxy autorizado e ignora o cabeçalho sem autorização', async () => {
    const segredoAnterior = env.proxySecret;
    const segredo = randomBytes(24).toString('hex');
    env.proxySecret = segredo;
    const chave = (ip: string) => 'geocodificar:' + createHmac('sha256', env.jwtSecret)
      .update('portal-svo:' + ipKeyGenerator(ip)).digest('hex');
    const porProxy = (ip: string) => cliente('203.0.113.42')
      .set('X-Proxy-Secret', segredo).set('X-Vercel-Forwarded-For', ip);
    try {
      await porProxy('2001:db8:1234::1').expect(200);
      await porProxy('2001:db8:1234::2').expect(200);
      await cliente('203.0.113.42').set('X-Proxy-Secret', 'incorreto')
        .set('X-Vercel-Forwarded-For', '2001:db8:5678::1').expect(200);
      expect(await db(tabela).where({ escopo: chave('2001:db8:1234::1') }).sum({ total: 'total' }).first())
        .toEqual({ total: '2' });
      expect(await db(tabela).where({ escopo: chave('203.0.113.42') }).first()).toMatchObject({ total: 1 });
      expect(await db(tabela).where({ escopo: chave('2001:db8:5678::1') }).first()).toBeUndefined();
    } finally {
      env.proxySecret = segredoAnterior;
    }
  });

  it('limpa cotas vencidas em lotes e ignora uma linha bloqueada em outra conexão', async () => {
    await admin(tabela).insert(Array.from({ length: 51 }, (_, indice) => ({
      expira_em: indice + 1, escopo: `teste-vencido:${indice + 1}`, total: 1,
    })));
    const vencidas = () => admin(tabela).where('escopo', 'like', 'teste-vencido:%').orderBy('expira_em');
    await admin.transaction(async (trx) => {
      await trx(tabela).where({ expira_em: 1, escopo: 'teste-vencido:1' }).forUpdate().first();
      await cliente('203.0.113.43').expect(200);
      expect(await vencidas().transacting(trx)).toEqual([{ expira_em: '1', escopo: 'teste-vencido:1', total: 1 }]);
    });
    await cliente('203.0.113.43').expect(200);
    expect(await vencidas()).toEqual([]);
  });

  it('aplica a mesma cota de rajada ao cadastro e à geocodificação', async () => {
    await db.raw(`INSERT INTO limites_portal_svo (expira_em, escopo, total)
      SELECT (floor(extract(epoch FROM clock_timestamp()) / 10) + j) * 10, 'portal:rajada', 20
      FROM generate_series(1, 2) j`);
    await cliente('203.0.113.32').expect(429);
    await request(app).post(FORMULARIO).send({}).expect(429);
    expect(http).not.toHaveBeenCalled();
  });

  it('cobre ambos os caminhos de acompanhamento com a mesma cota e flag independente', async () => {
    const acompanhamento = FORMULARIO + '/acompanhamento';
    await request(app).post(acompanhamento).send({}).expect(404);
    env.recursosOperacionais = carregarRecursosOperacionais({ ACOMPANHAMENTO_EXTERNO_SVO_ATIVO: 'true' });
    await db.raw(`INSERT INTO limites_portal_svo (expira_em, escopo, total)
      SELECT (floor(extract(epoch FROM clock_timestamp()) / 60) + j) * 60, 'acompanhar', 40
      FROM generate_series(1, 2) j`);
    await request(app).post(acompanhamento).send({}).expect(429).expect('Cache-Control', /no-store/);
    await request(app).get(acompanhamento + '/PROTOCOLO-SINTETICO').expect(429)
      .expect(({ headers }) => expect(Number(headers['retry-after'])).toBeGreaterThan(0));
  });

  it('mantém as vagas da consulta depois do timeout até o trabalho real do controlador terminar', async () => {
    env.recursosOperacionais = carregarRecursosOperacionais({ ACOMPANHAMENTO_EXTERNO_SVO_ATIVO: 'true' });
    const timeoutAnterior = env.requestTimeoutMs;
    env.requestTimeoutMs = 1_000;
    let liberar!: () => void;
    const pendente = new Promise<never>((_resolve, rejeitar) => {
      liberar = () => rejeitar(new Error('Falha sintética do processamento'));
    });
    const consulta = vi.spyOn(acompanhamentoExternoSvoService, 'consultarAcompanhamentoPublico')
      .mockReturnValue(pendente);
    const caminho = FORMULARIO + '/acompanhamento';
    const corpo = { protocolo: 'SVO-20261128-ABCDEFGHJKLM', credencial: 'a'.repeat(43) };
    const consultar = () => request(app).post(caminho).send(corpo);
    try {
      await Promise.all(Array.from({ length: 4 }, () => consultar().expect(503)));
      expect(consulta).toHaveBeenCalledTimes(4);
      await consultar().expect(429).expect('Retry-After', '1');
      expect(consulta).toHaveBeenCalledTimes(4);
      consulta.mockRestore();
      liberar();
      await consultar().expect(401);
    } finally {
      env.requestTimeoutMs = timeoutAnterior;
      liberar();
    }
  });

  it('limita concorrência antes de alocar processamento no provedor', async () => {
    let liberar!: () => void;
    const espera = new Promise<void>((resolve) => { liberar = resolve; });
    let iniciou!: () => void;
    const entradas = new Promise<void>((resolve) => { iniciou = resolve; });
    http.mockImplementation(async () => {
      if (http.mock.calls.length === 2) iniciou();
      await espera;
      return Response.json({ type: 'FeatureCollection', features: [] });
    });
    const pendentes = [1, 2].map((lat) => request(app).get(PUBLICO + '/reverso?lon=0&lat=' + lat).then((res) => res));
    try {
      await Promise.race([entradas, Promise.all(pendentes).then(() => { throw new Error('Consultas terminaram cedo.'); })]);
      await cliente('203.0.113.40').expect(429).expect('Retry-After', '1');
    } finally {
      liberar();
      for (const resposta of await Promise.all(pendentes)) expect(resposta.status).toBe(200);
    }
  });

  it('sinaliza duplicidade somente no detalhe autorizado e preserva os chamados', async () => {
    const documento = 'DOC-' + randomBytes(8).toString('hex');
    const ids = await db.transaction(async (trx) => {
      const solicitacoes = [];
      for (const [indice, documentoFalecido] of [documento, documento, documento + '-DISTINTO', null].entries()) {
        const protocolo = 'SVO-' + randomBytes(12).toString('hex').toUpperCase();
        const [{ id }] = await trx('solicitacoes_svo').insert({
          canal_origem: 'EXTERNA', protocolo, dados_solicitante: 'Solicitação externa',
          local_ocorrencia: 'Endereço sintético', status: 'EM_TRIAGEM',
        }).returning('id');
        await trx('solicitacoes_svo_dados_externos').insert({
          solicitacao_id: id, tipo_solicitante: 'PESSOA_FISICA',
          nome_solicitante: 'Pessoa sintética', telefone_solicitante: '(79) 99911-2233',
          email_solicitante: 'sintetico@example.invalid',
          cpf_solicitante: '52998224725', nome_falecido: 'Falecido sintético',
          documento_falecido: documentoFalecido,
          sem_numero_imovel: true, descricao_ocorrencia: 'Ocorrência sintética',
          data_hora_ocorrencia: new Date(Date.UTC(2025, 0, 1, 10, indice)),
          ciencia_aviso_privacidade: true, versao_aviso_privacidade: 'teste',
        });
        await trx('solicitacoes_svo_credenciais_externas').insert({
          solicitacao_id: id, algoritmo_digest: 'SHA-256', chave_idempotencia_criacao: protocolo,
          segredo_digest: randomBytes(32).toString('hex'), payload_criacao_digest: randomBytes(32).toString('hex'),
          prova_tentativa_digest: randomBytes(32).toString('hex'),
        });
        solicitacoes.push(id);
      }
      return solicitacoes;
    });
    try {
      const auth = vi.spyOn(authService, 'usuarioDoToken').mockResolvedValue({
        id: 1, perfil: PERFIS.ADMINISTRADOR, ativo: true,
      } as Usuario);
      const consultar = (id: number) => request(app).get('/api/solicitacoes-svo/' + id)
        .set('Authorization', 'Bearer token-sintetico');
      for (const [indice, id] of ids.entries()) {
        await consultar(id).expect(200).expect(({ body }) => {
          expect(body).toMatchObject({ status: 'EM_TRIAGEM', possivel_duplicidade: indice < 2 });
          expect(JSON.stringify(body)).not.toContain(documento);
        });
      }
      auth.mockResolvedValue({ id: 2, perfil: PERFIS.MOTORISTA_SVO, ativo: true } as Usuario);
      await consultar(ids[0]!).expect(403);
    } finally {
      await admin.transaction(async (trx) => {
        await trx('solicitacoes_svo_credenciais_externas').whereIn('solicitacao_id', ids).delete();
        await trx('solicitacoes_svo_dados_externos').whereIn('solicitacao_id', ids).delete();
        await trx('solicitacoes_svo').whereIn('id', ids).delete();
      });
    }
  });

  it('aplica honeypot, tamanho e no-store sem depender dos mapas', async () => {
    env.recursosOperacionais = carregarRecursosOperacionais({ PORTAL_SVO_ATIVO: 'true' });
    await request(app).post(FORMULARIO).send({ website_hp: 'valor-sintetico' }).expect(400)
      .expect('Cache-Control', 'private, no-store');
    await request(app).post(FORMULARIO).send({ endereco: 'a'.repeat(103000) }).expect(413);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('valor-sintetico');
    expect(http).not.toHaveBeenCalled();
  });
});
