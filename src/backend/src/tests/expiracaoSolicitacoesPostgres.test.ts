import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';
import { solicitacaoViagemModel } from '../models/solicitacaoViagemModel';
import { solicitacaoViagemService } from '../services/solicitacaoViagemService';

const habilitado = process.env.EXPIRACAO_POSTGRES_TESTS === '1';
const campos = { origem: 'Sede', destino: 'Hospital', finalidade: 'Teste de expiração' };

async function criarSolicitacao(status: string, minutos: number) {
  const [linha] = await db('solicitacoes_viagem').insert({
    ...campos, status,
    data_saida_desejada: db.raw("clock_timestamp() - ? * interval '1 minute'", [minutos]),
  }).returning('id');
  return linha.id as number;
}

async function gestor() {
  const [usuario] = await db('usuarios').insert({
    nome: 'Gestor teste', email: `${randomBytes(8).toString('hex')}@testes.invalid`,
    senha: 'hash-de-teste', perfil: 'GESTOR_FROTA', tipo_usuario: 'GESTOR_FROTA',
  }).returning(['id', 'versao_sessao']);
  return jwt.sign({
    typ: 'access', perfil: 'GESTOR_FROTA', sv: usuario.versao_sessao,
    sessao_exp: Math.floor(Date.now() / 1000) + 3600,
  }, env.jwtSecret, {
    algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web',
    subject: String(usuario.id), expiresIn: 1800,
  });
}

describe.skipIf(!habilitado)('Expiração administrativa em PostgreSQL descartável', () => {
  beforeAll(() => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('A suíte exige PostgreSQL descartável em 127.0.0.1/frotas_teste');
    }
  });
  afterAll(() => db.destroy());

  it('inclui exatamente o limite, independentemente do fuso e sem arredondar', async () => {
    await db.transaction(async (trx) => {
      await trx.raw("SET LOCAL TIME ZONE 'America/Fortaleza'");
      const [antes, limite, depois] = await trx('solicitacoes_viagem').insert([
        "interval '29 minutes 59.999999 seconds'",
        "interval '30 minutes'",
        "interval '30 minutes 1 microsecond'",
      ].map((intervalo) => ({
        ...campos, status: 'APROVADA',
        data_saida_desejada: trx.raw(`((transaction_timestamp() - ${intervalo}) AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`),
      }))).returning('id');

      const ids = (await solicitacaoViagemModel.buscarAprovadasVencidas(trx, 100)).map(({ id }) => id);
      expect(ids).toContain(limite.id);
      expect(ids).toContain(depois.id);
      expect(ids).not.toContain(antes.id);
      await trx('solicitacoes_viagem').whereIn('id', [antes.id, limite.id, depois.id]).del();
    });
  });

  it('mantém estados inelegíveis, protege viagens vinculadas e audita uma vez sob concorrência', async () => {
    const alvo = await criarSolicitacao('APROVADA', 1000);
    const antes = await criarSolicitacao('APROVADA', 29);
    const estados = ['AGENDADA', 'CONCLUIDA', 'RECUSADA', 'CANCELADA', 'PENDENTE_APROVACAO', 'EXPIRADA'];
    const outros = await Promise.all(estados.map((s) => criarSolicitacao(s, 60)));
    const vinculadas = await Promise.all(['AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA'].map(async (status) => {
      const solicitacao_id = await criarSolicitacao('APROVADA', 31);
      await db('viagens_frota').insert({
        solicitacao_id, status,
        ...(status === 'AGENDADA' ? {} : { km_inicial: 10, data_hora_efetiva_saida: db.fn.now() }),
        ...(status === 'CONCLUIDA' ? { km_final: 11, data_hora_efetiva_chegada: db.fn.now() } : {}),
      });
      return solicitacao_id;
    }));

    const totais = await Promise.all([solicitacaoViagemService.expirarAprovadas(), solicitacaoViagemService.expirarAprovadas()]);
    expect(totais[0]! + totais[1]!).toBe(1);
    const esperados = new Map([
      [alvo, 'EXPIRADA'], [antes, 'APROVADA'],
      ...outros.map((id, i): [number, string] => [id, estados[i]!]),
      ...vinculadas.map((id): [number, string] => [id, 'APROVADA']),
    ]);
    const linhas = await db('solicitacoes_viagem').whereIn('id', [...esperados.keys()]);
    expect(linhas).toHaveLength(esperados.size);
    for (const linha of linhas) expect(linha.status).toBe(esperados.get(linha.id));
    expect(await db('auditorias').where({ acao: `EXPIROU_SOLICITACAO_VIAGEM id=${alvo} origem=ROTINA_AUTOMATICA` }))
      .toEqual([expect.objectContaining({ usuario_id: null, modulo: 'SOLICITACOES_VIAGEM' })]);
  });

  it('ignora a linha travada pelo agendamento e reavalia no próximo ciclo', async () => {
    const id = await criarSolicitacao('APROVADA', 31);
    await db.transaction(async (trx) => {
      await solicitacaoViagemModel.buscarParaAtualizar(id, trx);
      expect(await solicitacaoViagemService.expirarAprovadas()).toBe(0);
      await solicitacaoViagemModel.atualizarStatus(id, 'AGENDADA', trx);
    });
    expect(await solicitacaoViagemService.expirarAprovadas()).toBe(0);
    expect(await db('solicitacoes_viagem').where({ id }).first('status')).toEqual({ status: 'AGENDADA' });
  });

  it('mantém uma única expiração quando o job e o POST disputam a solicitação vencida', async () => {
    const id = await criarSolicitacao('APROVADA', 31);
    const token = await gestor();
    const [contagem, resposta] = await Promise.all([
      solicitacaoViagemService.expirarAprovadas(),
      request(app).post('/api/viagens').set('Authorization', `Bearer ${token}`)
        .send({ tipo_operacao: 'ADMINISTRATIVA', solicitacao_id: id, veiculo_id: 1, motorista_id: 1 }),
    ]);
    // A rotina pode pular o registro se o HTTP tiver obtido o lock primeiro.
    expect(contagem + await solicitacaoViagemService.expirarAprovadas()).toBe(1);
    expect(resposta.status).toBe(409);
    expect(resposta.body.codigo).toBe('SOLICITACAO_EXPIRADA');
    expect(await db('solicitacoes_viagem').where({ id }).first('status')).toEqual({ status: 'EXPIRADA' });
    expect(await db('viagens_frota').where({ solicitacao_id: id })).toHaveLength(0);
    expect(await db('auditorias').where('acao', `EXPIROU_SOLICITACAO_VIAGEM id=${id} origem=ROTINA_AUTOMATICA`))
      .toHaveLength(1);
  });

  it.skipIf(process.env.GITHUB_ACTIONS !== 'true')('executa o cmd de expiração com a role restrita do cron', async () => {
    const id = await criarSolicitacao('APROVADA', 31);
    await db.raw(`
      CREATE ROLE cron_expiracao_ci LOGIN PASSWORD 'cron-expiracao-ci-apenas';
      GRANT CONNECT ON DATABASE frotas_teste TO cron_expiracao_ci;
      GRANT USAGE ON SCHEMA public TO cron_expiracao_ci;
      GRANT SELECT (id, status, data_saida_desejada), UPDATE (status)
        ON solicitacoes_viagem TO cron_expiracao_ci;
      GRANT SELECT (id, solicitacao_id, status) ON viagens_frota TO cron_expiracao_ci;
      GRANT INSERT (usuario_id, acao, modulo) ON auditorias TO cron_expiracao_ci;
      GRANT USAGE ON SEQUENCE auditorias_id_seq TO cron_expiracao_ci;
    `);
    const { stdout } = await promisify(execFile)(process.execPath, [
      resolve(__dirname, '../../dist/scripts/expirarSolicitacoesViagem.js'),
    ], {
      timeout: 12_000,
      env: {
        ...process.env,
        DB_ROLE: 'app', POSTGRES_APP_USER: 'cron_expiracao_ci', POSTGRES_APP_PASSWORD: 'cron-expiracao-ci-apenas',
        POSTGRES_POOL_MIN: '0', POSTGRES_POOL_MAX: '1',
      },
    });
    expect(JSON.parse(stdout.trim())).toMatchObject({ evento: 'expiracao_solicitacoes_viagem', expiradas: 1 });
    expect(await db('solicitacoes_viagem').where({ id }).first('status')).toEqual({ status: 'EXPIRADA' });
    expect(await db('auditorias').where('acao', `EXPIROU_SOLICITACAO_VIAGEM id=${id} origem=ROTINA_AUTOMATICA`))
      .toHaveLength(1);
  }, 15_000);

  it.each(['APROVADA', 'EXPIRADA'])('bloqueia POST direto de solicitação %s já fora do prazo', async (status) => {
    const id = await criarSolicitacao(status, 31);
    const resposta = await request(app).post('/api/viagens').set('Authorization', `Bearer ${await gestor()}`)
      .send({ tipo_operacao: 'ADMINISTRATIVA', solicitacao_id: id, veiculo_id: 1, motorista_id: 1 });
    expect(resposta.status).toBe(409);
    expect(resposta.body.codigo).toBe('SOLICITACAO_EXPIRADA');
    expect(await db('viagens_frota').where({ solicitacao_id: id })).toHaveLength(0);
    await db('solicitacoes_viagem').where({ id }).del();
  });
});
