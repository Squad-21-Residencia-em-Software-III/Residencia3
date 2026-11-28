import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';

// API In-App (SCRUM-226) contra a tabela da SCRUM-225. Só executa num banco descartável explicitamente
// identificado, depois de `npm run migrate`.
const habilitado = process.env.NOTIFICACOES_IN_APP_POSTGRES_TESTS === '1';
const nonce = () => randomBytes(8).toString('hex');

interface Conta { id: number; token: string }

async function conta(perfil: string, associado = true): Promise<Conta> {
  const [u] = await db('usuarios').insert({
    nome: 'Teste', email: `${nonce()}@testes.invalid`, senha: 'hash-de-teste', perfil,
    tipo_usuario: perfil.startsWith('MOTORISTA_') ? 'MOTORISTA' : perfil,
  }).returning(['id', 'versao_sessao']);
  if (perfil === 'GESTOR_SVO' && associado) {
    const unidade = await db('unidades').where({ nome: 'SVO' }).first('id');
    await db('gestores_unidades').insert({ unidade_id: unidade.id, usuario_id: u.id });
  }
  const token = jwt.sign(
    { typ: 'access', perfil, sv: u.versao_sessao, sessao_exp: Math.floor(Date.now() / 1000) + 3600 },
    env.jwtSecret,
    { algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web', subject: String(u.id), expiresIn: 1800 },
  );
  return { id: u.id, token: `Bearer ${token}` };
}

async function avisar(usuario: Conta, dados: Record<string, unknown> = {}, conexao = db): Promise<number> {
  const [linha] = await conexao('notificacoes').insert({
    usuario_id: usuario.id, tipo: 'VIAGEM_AGENDADA', titulo: 'Viagem agendada', mensagem: 'Saída às 14:00.',
    operacao: 'Administrativo', url_destino: '/viagens', chave_idempotencia: nonce(), ...dados,
  }).returning('id');
  return linha.id;
}

const get = (u: Conta, caminho = '') => request(app).get(`/api/notificacoes${caminho}`).set('Authorization', u.token);
const patch = (u: Conta, caminho: string, corpo?: object) =>
  request(app).patch(`/api/notificacoes${caminho}`).set('Authorization', u.token).send(corpo);
const naoLidas = async (u: Conta): Promise<number> => (await get(u, '/contador')).body.nao_lidas;

async function percorrer(u: Conta, limite: number, aCadaPagina?: () => Promise<unknown>): Promise<number[]> {
  const ids: number[] = [];
  let cursor: string | null = null;
  do {
    const { body } = await get(u, `?limit=${limite}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    ids.push(...body.itens.map((i: { id: number }) => i.id));
    cursor = body.proximo_cursor;
    await aCadaPagina?.();
  } while (cursor);
  return ids;
}

describe.skipIf(!habilitado)('API In-App em PostgreSQL descartável', () => {
  beforeAll(() => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('A suíte exige PostgreSQL descartável em 127.0.0.1/frotas_teste');
    }
  });
  afterAll(() => db.destroy());

  it('responde só os campos do contrato, da mais recente para a mais antiga', async () => {
    // O Gestor de Frota acessa qualquer viagem
    const u = await conta('GESTOR_FROTA');
    const antiga = await avisar(u, { criado_em: '2026-01-01T10:00:00Z' });
    const nova = await avisar(u, {
      criado_em: '2026-01-02T10:00:00Z', severidade: 'warning', referencia_tipo: 'VIAGEM_FROTA', referencia_id: 108,
    });
    const { body } = await get(u);
    expect(body).toMatchObject({ proximo_cursor: null, nao_lidas: 2 });
    expect(body.itens.map((i: { id: number }) => i.id)).toEqual([nova, antiga]);
    expect(body.itens[0]).toEqual({
      id: nova, tipo: 'VIAGEM_AGENDADA', titulo: 'Viagem agendada', mensagem: 'Saída às 14:00.', severidade: 'warning',
      operacao: 'Administrativo', referencia_tipo: 'VIAGEM_FROTA', referencia_id: 108, url_destino: '/viagens',
      lida_em: null, criado_em: '2026-01-02T10:00:00.000Z', acesso_revogado: false,
    });
  });

  it('ninguém lista, conta nem marca avisos de outra pessoa', async () => {
    const a = await conta('SOLICITANTE');
    const b = await conta('ADMINISTRADOR');
    const id = await avisar(a, { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 5 });

    expect((await get(b)).body).toEqual({ itens: [], proximo_cursor: null, nao_lidas: 0, versao: '0-0' });
    expect((await patch(b, `/${id}/lida`)).status).toBe(404);
    expect((await patch(b, '/ler-todas')).body).toEqual({ atualizadas: 0, nao_lidas: 0, versao: '0-0' });
    expect((await patch(b, '/referencia/lida', { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 5 })).body.atualizadas).toBe(0);
    expect(await naoLidas(a)).toBe(1);
    expect((await db('notificacoes').where({ id }).first()).lida_em).toBeNull();
  });

  it('a operação que o perfil não alcança some de todas as rotas', async () => {
    const semVinculo = await conta('GESTOR_SVO', false);
    const svo = await avisar(semVinculo, { operacao: 'SVO', referencia_tipo: 'ORDEM_SVO', referencia_id: 1 });
    const propria = await avisar(semVinculo);

    expect((await get(semVinculo)).body.itens.map((i: { id: number }) => i.id)).toEqual([propria]);
    expect(await naoLidas(semVinculo)).toBe(1);
    expect((await patch(semVinculo, `/${svo}/lida`)).status).toBe(404);
    expect((await patch(semVinculo, '/ler-todas')).body.atualizadas).toBe(1);
    expect((await db('notificacoes').where({ id: svo }).first()).lida_em).toBeNull();

    const associado = await conta('GESTOR_SVO');
    await avisar(associado, { operacao: 'SVO' });
    await avisar(associado);
    expect(await naoLidas(associado)).toBe(2);

    const integrante = await conta('INTEGRANTE_SVO');
    await avisar(integrante, { operacao: 'SVO' });
    await avisar(integrante);
    expect(await naoLidas(integrante)).toBe(1);
  });

  it('a paginação não repete nem pula com datas iguais ou diferentes só nos microssegundos', async () => {
    const u = await conta('SOLICITANTE');
    const esperado: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const micro = String(123450 + Math.floor(i / 3)).padStart(6, '0');
      esperado.unshift(await avisar(u, { criado_em: `2026-01-01T10:00:00.${micro}Z` }));
    }
    for (const limite of [1, 2, 3, 5, 12, 20]) expect(await percorrer(u, limite)).toEqual(esperado);
  });

  it('aviso novo entre as páginas não repete nem desloca os antigos', async () => {
    const u = await conta('SOLICITANTE');
    const ids: number[] = [];
    for (let i = 0; i < 6; i += 1) ids.unshift(await avisar(u, { criado_em: `2026-01-01T10:00:0${i}Z` }));
    expect(await percorrer(u, 2, () => avisar(u))).toEqual(ids);
  });

  it.each([
    [21, [20, 1]],
    [40, [20, 20]],
    [101, [20, 20, 20, 20, 20, 1]],
  ])('pagina %i avisos com o mesmo timestamp sem deslocar o cursor após inserções', async (total, tamanhos) => {
    const u = await conta('SOLICITANTE');
    const criado_em = '2026-01-02T10:00:00.123456Z';
    const originais = await db('notificacoes').insert(Array.from({ length: total }, () => ({
      usuario_id: u.id, tipo: 'VIAGEM_AGENDADA', titulo: 'Viagem agendada', mensagem: 'Aviso sintético.',
      operacao: 'Administrativo', url_destino: '/viagens', chave_idempotencia: nonce(), criado_em,
    }))).returning<{ id: number }[]>('id');
    const esperados = originais.map(({ id }) => id).sort((a, b) => b - a);
    let caminho = '?limit=20';
    const ids: number[] = [];
    let novos: number[] = [];
    for (const [indice, tamanho] of tamanhos.entries()) {
      const { status, body } = await get(u, caminho);
      expect(status).toBe(200);
      expect(body.itens).toHaveLength(tamanho);
      expect(body.nao_lidas).toBe(total + novos.length);
      ids.push(...body.itens.map(({ id }: { id: number }) => id));
      if (indice === tamanhos.length - 1) {
        expect(body.proximo_cursor).toBeNull();
      } else {
        expect(body.proximo_cursor).toBe(`2026-01-02T10:00:00.123456Z|${ids.at(-1)}`);
        caminho = `?limit=20&cursor=${encodeURIComponent(body.proximo_cursor)}`;
      }
      if (indice === 0) novos = await Promise.all([avisar(u, { criado_em }), avisar(u, { criado_em })]);
    }
    expect(ids).toEqual(esperados);
    const novaPrimeiraPagina = await get(u, '?limit=20');
    expect(novaPrimeiraPagina.body.itens.slice(0, 2).map(({ id }: { id: number }) => id))
      .toEqual(novos.sort((a, b) => b - a));
  });

  it('a página seguinte não depende do fuso da conexão', async () => {
    const u = await conta('SOLICITANTE');
    const antiga = await avisar(u, { criado_em: '2026-01-01T23:30:00.000001-03:00' });
    const nova = await avisar(u, { criado_em: '2026-01-01T23:30:00.000002-03:00' });
    const { body } = await get(u, '?limit=1');
    expect(body.proximo_cursor).toBe(`2026-01-02T02:30:00.000002Z|${nova}`);
    const resto = await get(u, `?limit=1&cursor=${encodeURIComponent(body.proximo_cursor)}`);
    expect(resto.body.itens[0].id).toBe(antiga);
  });

  it('filtra as não lidas', async () => {
    const u = await conta('SOLICITANTE');
    const lida = await avisar(u);
    const pendente = await avisar(u);
    await patch(u, `/${lida}/lida`);
    const { body } = await get(u, '?apenas_nao_lidas=true');
    expect(body.itens.map((i: { id: number }) => i.id)).toEqual([pendente]);
    expect((await get(u, '?apenas_nao_lidas=false')).body.itens).toHaveLength(2);
  });

  it('marcar de novo mantém a primeira leitura, e o contador não fica negativo', async () => {
    const u = await conta('SOLICITANTE');
    const id = await avisar(u);
    const primeira = (await patch(u, `/${id}/lida`)).body;
    const repetidas = await Promise.all([1, 2, 3, 4].map(() => patch(u, `/${id}/lida`)));
    for (const { status, body } of repetidas) {
      expect(status).toBe(200);
      expect(body).toEqual(primeira);
    }
    expect(primeira.nao_lidas).toBe(0);
    expect((await patch(u, '/ler-todas')).body).toEqual({ atualizadas: 0, nao_lidas: 0, versao: '0-0' });
  });

  it('marca aviso com data de criação à frente do relógio', async () => {
    const u = await conta('SOLICITANTE');
    const criado_em = new Date(Date.now() + 60_000).toISOString();
    const id = await avisar(u, { criado_em });
    expect((await patch(u, `/${id}/lida`)).body.lida_em).toBe(criado_em);
  });

  it('a referência marca só os avisos daquele registro', async () => {
    const u = await conta('SOLICITANTE');
    await avisar(u, { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 108 });
    await avisar(u, { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 108 });
    await avisar(u, { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 109 });
    await avisar(u, { referencia_tipo: 'SOLICITACAO_VIAGEM', referencia_id: 108 });
    await avisar(u);
    const corpo = { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 108 };
    expect((await patch(u, '/referencia/lida', corpo)).body).toMatchObject({ atualizadas: 2, nao_lidas: 3 });
    expect((await patch(u, '/referencia/lida', corpo)).body).toMatchObject({ atualizadas: 0, nao_lidas: 3 });
  });

  it('a referência não marca a outra operação, mesmo com o mesmo id', async () => {
    const u = await conta('ADMINISTRADOR');
    const viagem = await avisar(u, { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 77 });
    const ordem = await avisar(u, { operacao: 'SVO', referencia_tipo: 'ORDEM_SVO', referencia_id: 77 });
    // Publicado errado, com a operação trocada: também não é atingido
    const trocado = await avisar(u, { operacao: 'SVO', referencia_tipo: 'VIAGEM_FROTA', referencia_id: 77 });
    expect((await patch(u, '/referencia/lida', { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 77 })).body.atualizadas).toBe(1);
    expect(await db('notificacoes').whereIn('id', [viagem, ordem, trocado]).whereNotNull('lida_em').pluck('id')).toEqual([viagem]);
  });

  it('marca somente os avisos vistos quando transações confirmam IDs fora de ordem', async () => {
    const u = await conta('SOLICITANTE');
    const outraConta = await conta('SOLICITANTE');
    const alheia = await avisar(outraConta);
    const antiga = await avisar(u);
    const atrasada = await db.transaction();
    let menor: number;
    let ids: number[];
    try {
      menor = await avisar(u, {}, atrasada);
      const maior = await db.transaction((adiantada) => avisar(u, {}, adiantada));
      expect(menor).toBeLessThan(maior);
      ids = (await get(u)).body.itens.map((item: { id: number }) => item.id);
      expect(ids).toEqual([maior, antiga]);
      await atrasada.commit();
    } finally {
      if (!atrasada.isCompleted()) await atrasada.rollback();
    }
    expect((await patch(u, '/ler-todas', { ids: [...ids, alheia] })).body)
      .toMatchObject({ atualizadas: 2, nao_lidas: 1 });
    expect((await get(u, '?apenas_nao_lidas=true')).body.itens.map((item: { id: number }) => item.id)).toEqual([menor]);
    expect(await naoLidas(outraConta)).toBe(1);
  });

  it('a versão muda quando um aviso é lido e outro chega, mesmo com o total igual', async () => {
    const u = await conta('SOLICITANTE');
    const id = await avisar(u);
    const antes = (await get(u, '/contador')).body;
    expect((await get(u, '/contador')).body).toEqual(antes);
    await patch(u, `/${id}/lida`);
    await avisar(u);
    const depois = (await get(u, '/contador')).body;
    expect(depois.nao_lidas).toBe(antes.nao_lidas);
    expect(depois.versao).not.toBe(antes.versao);
  });

  it('marcações e avisos simultâneos: cada aviso é contado uma vez e nada se perde', async () => {
    const u = await conta('SOLICITANTE');
    for (let i = 0; i < 40; i += 1) await avisar(u, { referencia_tipo: 'VIAGEM_FROTA', referencia_id: 1 + (i % 2) });

    const respostas = await Promise.all([
      ...[1, 2, 3].map(() => patch(u, '/ler-todas')),
      ...[1, 2, 1, 2].map((id) => patch(u, '/referencia/lida', { referencia_tipo: 'VIAGEM_FROTA', referencia_id: id })),
    ]);
    expect(respostas.map((r) => r.status)).toEqual(respostas.map(() => 200));
    expect(respostas.reduce((soma, r) => soma + r.body.atualizadas, 0)).toBe(40);

    const [, novas] = await Promise.all([
      patch(u, '/ler-todas'),
      Promise.all(Array.from({ length: 10 }, () => avisar(u))),
    ]);
    const pendentes = await db('notificacoes').where({ usuario_id: u.id }).whereNull('lida_em');
    expect(await naoLidas(u)).toBe(pendentes.length);
    expect((await patch(u, '/ler-todas')).body).toEqual({ atualizadas: pendentes.length, nao_lidas: 0, versao: '0-0' });
    expect(novas).toHaveLength(10);
  });

  it('marcar trava os avisos sempre na ordem do id (sem deadlock entre abas)', async () => {
    const u = await conta('SOLICITANTE');
    const [menor, maior] = [await avisar(u, { criado_em: '2026-01-02T00:00:00Z' }), await avisar(u, { criado_em: '2026-01-01T00:00:00Z' })];
    await db.transaction(async (trx) => {
      await trx('notificacoes').where({ id: menor }).forUpdate().first('id');
      const marcando = patch(u, '/ler-todas').then((r) => r);
      await new Promise((r) => setTimeout(r, 300));
      // Quem espera pelo menor ainda não pode ter travado o maior
      await trx('notificacoes').where({ id: maior }).forUpdate().noWait().first('id');
      await trx.commit();
      expect((await marcando).body).toMatchObject({ atualizadas: 2, nao_lidas: 0 });
    });
  });
});
