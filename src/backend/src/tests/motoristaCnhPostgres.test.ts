import { randomBytes, randomInt } from 'node:crypto';
import jwt from 'jsonwebtoken';
import knex, { type Knex } from 'knex';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';
import { configMotoristas } from '../config/motoristas';
import { tipoUsuarioDoPerfil, type Perfil } from '../constants/perfis';
import { auditoriaModel } from '../models/auditoriaModel';
import { usarBancoComExclusividade } from './exclusividadeNoBanco';

// SCRUM-308 em PostgreSQL descartável:
// MOTORISTAS_CNH_POSTGRES_TESTS=1 POSTGRES_HOST=127.0.0.1 POSTGRES_DB=frotas_teste npx vitest run src/tests/motoristaCnhPostgres.test.ts
const habilitado = process.env.MOTORISTAS_CNH_POSTGRES_TESTS === '1';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const migracao = require('../../database/migrations/20261128120000_scrum_308_unicidade_cnh_motoristas.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const knexfile = require('../../knexfile');

interface Conta { id: number; token: string }
const nonce = () => randomBytes(4).toString('hex');

async function conta(perfil: Perfil): Promise<Conta> {
  const [u] = await db('usuarios').insert({ nome: `Sintético ${nonce()}`, email: `${nonce()}@testes.invalid`,
    senha: 'hash-de-teste', perfil, ativo: true, tipo_usuario: tipoUsuarioDoPerfil(perfil) }).returning(['id', 'versao_sessao']);
  const token = jwt.sign({ typ: 'access', perfil, sv: u.versao_sessao, sessao_exp: Math.floor(Date.now() / 1000) + 3600 },
    env.jwtSecret, { algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web', subject: String(u.id), expiresIn: 1800 });
  return { id: u.id, token: `Bearer ${token}` };
}

/** 11 dígitos com zero à esquerda, sem repetir todos os dígitos. */
function cnhSintetica(): string {
  return `0${String(randomInt(1_000_000_000, 9_999_999_999))}`;
}
const formatada = (c: string) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
const canonicas = (c: string) => db('motoristas').whereRaw("regexp_replace(numero_cnh, '[[:space:].-]', '', 'g') = ?", [c]);

describe.skipIf(!habilitado)('SCRUM-308 cadastro de CNH em PostgreSQL descartável', { timeout: 60000 }, () => {
  usarBancoComExclusividade();
  let admin: Conta, gestorFrota: Conta, gestorSvo: Conta;

  const criar = (autor: Conta, corpo: object) => request(app).post('/api/motoristas').set('Authorization', autor.token).send(corpo);
  const editar = (autor: Conta, id: number, corpo: object) =>
    request(app).patch(`/api/motoristas/${id}`).set('Authorization', autor.token).send(corpo);
  const corpo = async (perfil: Perfil = 'MOTORISTA_FROTA', numero = cnhSintetica()) => ({
    usuario_id: (await conta(perfil)).id, numero_cnh: numero, categoria_cnh: 'B', validade_cnh: '2030-12-31',
  });

  beforeAll(async () => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') throw new Error('Banco descartável obrigatório');
    [admin, gestorFrota, gestorSvo] = await Promise.all([conta('ADMINISTRADOR'), conta('GESTOR_FROTA'), conta('GESTOR_SVO')]);
    const svo = await db('unidades').where({ nome: 'SVO' }).first('id');
    await db('gestores_unidades').insert({ unidade_id: svo.id, usuario_id: gestorSvo.id });
  });
  beforeEach(() => { configMotoristas.escritaAtiva = true; vi.restoreAllMocks(); });
  afterAll(async () => { configMotoristas.escritaAtiva = false; await db.destroy(); });

  it('grava do HTTP ao banco com zeros preservados, audita sem o número e mascara as listas', async () => {
    const dados = await corpo('MOTORISTA_FROTA', cnhSintetica());
    const res = await criar(admin, { ...dados, numero_cnh: formatada(dados.numero_cnh) });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ numero_cnh: dados.numero_cnh, tipo_motorista: 'FROTA', status: 'DISPONIVEL', cnh_vencida: false });
    const linha = await db('motoristas').where({ id: res.body.id }).first();
    expect(linha.numero_cnh).toBe(dados.numero_cnh);
    expect(linha.numero_cnh.startsWith('0')).toBe(true);
    const [{ validade }] = (await db.raw("SELECT to_char(validade_cnh, 'YYYY-MM-DD') AS validade FROM motoristas WHERE id = ?", [res.body.id])).rows;
    expect(validade).toBe('2030-12-31');

    const auditoria = await db('auditorias').where({ modulo: 'MOTORISTAS' }).whereLike('acao', `CADASTROU_MOTORISTA id=${res.body.id} %`);
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].usuario_id).toBe(admin.id);

    const lista = await request(app).get('/api/motoristas').set('Authorization', admin.token);
    const vencimentos = await request(app).get('/api/documentos/vencimentos').set('Authorization', admin.token);
    const auditorias = await request(app).get('/api/auditorias').set('Authorization', admin.token);
    expect(lista.body.find((m: { id: number }) => m.id === res.body.id)).toMatchObject({ cnh_final: dados.numero_cnh.slice(-4) });
    for (const resposta of [lista, vencimentos, auditorias]) {
      expect(resposta.status).toBe(200);
      expect(JSON.stringify(resposta.body)).not.toContain(dados.numero_cnh);
    }
    expect(JSON.stringify(await db('auditorias').where({ modulo: 'MOTORISTAS' }))).not.toContain(dados.numero_cnh);
  });

  it('aceita CNH vencida como condição distinta', async () => {
    const res = await criar(admin, { ...(await corpo()), validade_cnh: '2001-01-01' });

    expect(res.status).toBe(201);
    expect(res.body.cnh_vencida).toBe(true);
  });

  it('dois cadastros concorrentes com representação equivalente deixam no máximo um registro', async () => {
    const numero = cnhSintetica();
    const [a, b] = await Promise.all([corpo('MOTORISTA_FROTA', numero), corpo('MOTORISTA_FROTA', numero)]);

    const respostas = await Promise.all([
      criar(admin, { ...a, numero_cnh: formatada(numero) }),
      criar(gestorFrota, { ...b, numero_cnh: numero }),
    ]);

    expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);
    const conflito = respostas.find((r) => r.status === 409)!;
    expect(conflito.body).toEqual({ erro: 'Já existe um motorista cadastrado com esta CNH', codigo: 'CNH_DUPLICADA' });
    expect(await canonicas(numero)).toHaveLength(1);
  });

  it('o índice canônico barra a corrida mesmo sem a pré-checagem da aplicação', async () => {
    const numero = cnhSintetica();
    const usuario = await conta('MOTORISTA_FROTA');
    await db('motoristas').insert({ usuario_id: usuario.id, numero_cnh: formatada(numero), categoria_cnh: 'B', validade_cnh: '2030-12-31', tipo_motorista: 'FROTA' });

    await expect(db('motoristas').insert({ usuario_id: (await conta('MOTORISTA_FROTA')).id, numero_cnh: numero, categoria_cnh: 'B', validade_cnh: '2030-12-31', tipo_motorista: 'FROTA' }))
      .rejects.toMatchObject({ code: '23505', constraint: 'uq_motoristas_numero_cnh_canonico' });
  });

  it('a mesma pessoa cadastrada duas vezes ao mesmo tempo gera um único registro', async () => {
    const usuario = await conta('MOTORISTA_SVO');
    const base = { usuario_id: usuario.id, categoria_cnh: 'D', validade_cnh: '2031-05-05' };

    const respostas = await Promise.all([
      criar(admin, { ...base, numero_cnh: cnhSintetica() }),
      criar(gestorSvo, { ...base, numero_cnh: cnhSintetica() }),
    ]);

    expect(respostas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(respostas.find((r) => r.status === 409)!.body.codigo).toBe('MOTORISTA_JA_CADASTRADO');
    expect(await db('motoristas').where({ usuario_id: usuario.id })).toHaveLength(1);
  });

  it('edição preserva os campos omitidos e audita só os nomes', async () => {
    const criado = await criar(admin, { ...(await corpo()), categoria_cnh: 'AB' });
    const antes = criado.body;

    const res = await editar(gestorFrota, antes.id, { validade_cnh: '2032-02-29' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ numero_cnh: antes.numero_cnh, categoria_cnh: 'AB', validade_cnh: '2032-02-29', usuario_id: antes.usuario_id, tipo_motorista: 'FROTA' });
    const auditoria = await db('auditorias').where({ modulo: 'MOTORISTAS', acao: `ATUALIZOU_MOTORISTA id=${antes.id} campos=validade_cnh` });
    expect(auditoria).toHaveLength(1);
  });

  it('edição para CNH equivalente de outro motorista responde 409 e não altera nada', async () => {
    const primeiro = (await criar(admin, await corpo())).body;
    const segundo = (await criar(admin, await corpo())).body;

    const res = await editar(admin, segundo.id, { numero_cnh: formatada(primeiro.numero_cnh) });

    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toMatch(new RegExp(`${primeiro.id}|${primeiro.usuario_id}|${primeiro.nome}`));
    expect((await db('motoristas').where({ id: segundo.id }).first()).numero_cnh).toBe(segundo.numero_cnh);
  });

  it('competência por operação: Gestor de Frota não lê nem escreve motorista SVO', async () => {
    const svo = (await criar(admin, await corpo('MOTORISTA_SVO'))).body;

    expect((await request(app).get(`/api/motoristas/${svo.id}`).set('Authorization', gestorFrota.token)).status).toBe(403);
    expect((await editar(gestorFrota, svo.id, { categoria_cnh: 'E' })).status).toBe(403);
    expect((await criar(gestorFrota, await corpo('MOTORISTA_SVO'))).status).toBe(403);
    expect((await db('motoristas').where({ id: svo.id }).first()).categoria_cnh).toBe('B');
  });

  it('Gestor SVO sem associação à unidade SVO recebe 403', async () => {
    await db('gestores_unidades').where({ usuario_id: gestorSvo.id }).del();

    expect((await criar(gestorSvo, await corpo('MOTORISTA_SVO'))).status).toBe(403);
  });

  it('usuário fora do perfil de motorista não vira motorista', async () => {
    const res = await criar(admin, { ...(await corpo()), usuario_id: (await conta('SOLICITANTE')).id });

    expect(res.status).toBe(422);
  });

  it('falha na auditoria desfaz o cadastro (mesmo commit lógico)', async () => {
    vi.spyOn(auditoriaModel, 'registrar').mockRejectedValueOnce(new Error('auditoria indisponível'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const dados = await corpo();

    const res = await criar(admin, dados);

    expect(res.status).toBe(500);
    expect(await db('motoristas').where({ usuario_id: dados.usuario_id })).toHaveLength(0);
  });

  describe('migração não destrutiva', () => {
    // Role de migração: a role da aplicação não cria esquemas
    let dbMigracao: Knex;
    beforeAll(() => { dbMigracao = knex(knexfile.criarConfigKnex({ ...process.env, DB_ROLE: 'migration' })); });
    afterAll(() => dbMigracao.destroy());
    const emEsquema = async (linhas: object[], acao: (trx: Knex.Transaction) => Promise<void>) => {
      const trx = await dbMigracao.transaction();
      try {
        const esquema = `scrum308_${nonce()}`;
        await trx.raw(`CREATE SCHEMA ${esquema}`);
        await trx.raw(`SET LOCAL search_path TO ${esquema}`);
        await trx.raw(`CREATE TABLE motoristas (id serial PRIMARY KEY, usuario_id integer, numero_cnh varchar(20) NOT NULL UNIQUE,
          categoria_cnh varchar(5) NOT NULL, validade_cnh date NOT NULL, tipo_motorista varchar(20) NOT NULL, status varchar(30) NOT NULL DEFAULT 'DISPONIVEL')`);
        if (linhas.length) await trx('motoristas').insert(linhas);
        await acao(trx);
      } finally {
        await trx.rollback();
      }
    };
    const linha = (usuario_id: number | null, numero_cnh: string) =>
      ({ usuario_id, numero_cnh, categoria_cnh: 'B', validade_cnh: '2030-12-31', tipo_motorista: 'FROTA' });
    const instantaneo = async (trx: Knex.Transaction) =>
      JSON.stringify(await trx('motoristas').orderBy('id'));

    it('aplica em banco vazio e o down remove os índices', async () => {
      await emEsquema([], async (trx) => {
        await migracao.up(trx);
        const indices = (await trx.raw("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname LIKE 'uq_motoristas_%'")).rows;
        expect(indices.map((i: { indexname: string }) => i.indexname).sort()).toEqual(['uq_motoristas_numero_cnh_canonico', 'uq_motoristas_usuario_id']);
        await migracao.down(trx);
        expect((await trx.raw("SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname LIKE 'uq_motoristas_%'")).rows).toHaveLength(0);
      });
    });

    it('aplica em banco populado sem alterar linhas (inclui usuário nulo repetido)', async () => {
      await emEsquema([linha(1, '00012345678'), linha(2, '000.123.456-79'), linha(null, '10000000001'), linha(null, '10000000002')], async (trx) => {
        const antes = await instantaneo(trx);
        await migracao.up(trx);
        expect(await instantaneo(trx)).toBe(antes);
      });
    });

    it.each([
      ['CNH equivalente', [linha(1, '00012345678'), linha(2, '000.123.456-78')], 'Grupos de CNH equivalente: 1'],
      ['usuário duplicado', [linha(1, '00012345678'), linha(1, '00012345679')], 'mais de um registro de motorista: 1'],
    ])('aborta com %s e preserva as linhas', async (_caso, linhas, mensagem) => {
      await emEsquema(linhas, async (trx) => {
        const antes = await instantaneo(trx);
        await expect(migracao.up(trx)).rejects.toThrow(mensagem);
        expect(await instantaneo(trx)).toBe(antes);
      });
    });

    it('no banco real os vínculos de viagens e abastecimentos continuam íntegros', async () => {
      const orfaos = await db.raw(`
        SELECT (SELECT count(*) FROM viagens_frota v LEFT JOIN motoristas m ON m.id = v.motorista_id WHERE v.motorista_id IS NOT NULL AND m.id IS NULL)::int AS viagens,
               (SELECT count(*) FROM abastecimentos a LEFT JOIN motoristas m ON m.id = a.motorista_id WHERE a.motorista_id IS NOT NULL AND m.id IS NULL)::int AS abastecimentos`);
      expect(orfaos.rows[0]).toEqual({ viagens: 0, abastecimentos: 0 });
      const indices = (await db.raw("SELECT indexname FROM pg_indexes WHERE tablename = 'motoristas' AND indexname LIKE 'uq_motoristas_%'")).rows;
      expect(indices).toHaveLength(2);
    });
  });
});
