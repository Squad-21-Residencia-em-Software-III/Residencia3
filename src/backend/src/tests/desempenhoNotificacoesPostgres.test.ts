import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { db } from '../config/database';
import { env } from '../config/env';
import { tipoUsuarioDoPerfil, type Perfil } from '../constants/perfis';

// SCRUM-241 (NF-25/26): medição do sino, da central e das métricas com histórico acumulado, no PostgreSQL
// local e descartável. Fora do CI (gera ~270 mil linhas): rode com SCRUM241_DESEMPENHO=1 num banco novo,
// depois de `npm run migrate`. Resultado no console e, com SCRUM241_RELATORIO=<arquivo>, em JSON.
// Mede a API e o banco nesta máquina: não inclui a rede até o Render e o Neon nem a partida a frio.
const habilitado = process.env.SCRUM241_DESEMPENHO === '1';

const USUARIOS = 50;
const AVISOS_POR_USUARIO = 3_000;
const AVISOS_DO_USUARIO_PESADO = 20_000;
const ITENS_NA_FILA = 100_000;

interface Pessoa { id: number; token: string }

const token = (id: number, perfil: Perfil, versao: number) => jwt.sign(
  { typ: 'access', perfil, sv: versao, sessao_exp: Math.floor(Date.now() / 1000) + 3600 },
  env.jwtSecret,
  { algorithm: 'HS256', issuer: 'fsph-frotas-api', audience: 'fsph-frotas-web', subject: String(id), expiresIn: 1800 }
);

const percentil = (valores: number[], p: number) => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return Number(ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)].toFixed(1));
};
const resumo = (tempos: number[]) => ({
  n: tempos.length, p50_ms: percentil(tempos, 50), p95_ms: percentil(tempos, 95), max_ms: percentil(tempos, 100),
});

describe.skipIf(!habilitado)('Desempenho dos avisos com histórico acumulado (SCRUM-241)', () => {
  let servidor: Server;
  let base: string;
  const pessoas: Pessoa[] = [];
  let pesado: Pessoa;
  let admin: Pessoa;
  const relatorio: Record<string, unknown> = {};

  const chamar = async (p: Pessoa, caminho: string) => {
    const inicio = performance.now();
    const resposta = await fetch(`${base}${caminho}`, { headers: { Authorization: `Bearer ${p.token}` } });
    await resposta.arrayBuffer();
    return { status: resposta.status, ms: performance.now() - inicio };
  };

  // Consultas que a API fez de verdade, para o EXPLAIN
  async function consultasDe(acao: () => Promise<unknown>): Promise<{ sql: string; bindings: unknown[] }[]> {
    const capturadas: { sql: string; bindings: unknown[] }[] = [];
    const ouvir = (q: { sql: string; bindings?: unknown[] }) => capturadas.push({ sql: q.sql, bindings: q.bindings ?? [] });
    db.on('query', ouvir);
    try {
      await acao();
    } finally {
      db.removeListener('query', ouvir);
    }
    return capturadas.filter(({ sql }) => /^\s*select/i.test(sql));
  }

  async function explicar(sql: string, bindings: unknown[]) {
    // O knex do pg entrega $1, $2...; o raw espera ? na mesma ordem
    const ordem: unknown[] = [];
    const comInterrogacao = sql.replace(/\$(\d+)/g, (_m, n: string) => {
      ordem.push(bindings[Number(n) - 1]);
      return '?';
    });
    const { rows } = await db.raw(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${comInterrogacao}`, ordem as never[]);
    const [{ Plan: plano, 'Execution Time': execucao }] = rows[0]['QUERY PLAN'];
    const nos: string[] = [];
    const visitar = (no: { 'Node Type': string; 'Relation Name'?: string; 'Index Name'?: string; Plans?: unknown[] }) => {
      nos.push([no['Node Type'], no['Index Name'] ?? no['Relation Name']].filter(Boolean).join(' '));
      for (const filho of (no.Plans ?? []) as typeof no[]) visitar(filho);
    };
    visitar(plano);
    return { execucao_ms: Number(execucao.toFixed(2)), plano: nos, sql: sql.replace(/\s+/g, ' ').slice(0, 160) };
  }

  beforeAll(async () => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('A medição exige PostgreSQL descartável em 127.0.0.1/frotas_teste');
    }
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const perfis: Perfil[] = ['SOLICITANTE', 'GESTOR_FROTA', 'MOTORISTA_FROTA', 'SOLICITANTE', 'ADMINISTRADOR'];
    const linhas = Array.from({ length: USUARIOS }, (_, i) => {
      const perfil = perfis[i % perfis.length];
      return {
        nome: `Medição ${i}`, email: `medicao-${randomBytes(6).toString('hex')}@testes.invalid`, senha: 'hash-de-teste',
        perfil, tipo_usuario: tipoUsuarioDoPerfil(perfil),
      };
    });
    const criados: { id: number; perfil: Perfil; versao_sessao: number }[] =
      await db('usuarios').insert(linhas).returning(['id', 'perfil', 'versao_sessao']);
    for (const u of criados) pessoas.push({ id: u.id, token: token(u.id, u.perfil, u.versao_sessao) });
    pesado = pessoas[0];
    admin = pessoas[criados.findIndex((u) => u.perfil === 'ADMINISTRADOR')];
    const ids = criados.map((u) => u.id);

    const inicio = performance.now();
    // Avisos espalhados por 90 dias (o máximo da retenção), 3 em 4 lidos, 2 em 3 com registro de origem
    await db.raw(
      `INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, severidade, operacao, referencia_tipo, referencia_id,
         url_destino, chave_idempotencia, criado_em, lida_em)
       SELECT u.id, 'SOLICITACAO_APROVADA', 'Solicitação aprovada', 'A solicitação foi aprovada e aguarda agendamento.',
              'info', 'Administrativo',
              CASE WHEN g % 3 = 0 THEN NULL ELSE 'SOLICITACAO_VIAGEM' END, CASE WHEN g % 3 = 0 THEN NULL ELSE g END,
              '/solicitacoes', 'medicao:' || g, c.criado, CASE WHEN g % 4 = 0 THEN NULL ELSE c.criado + (clock_timestamp() - c.criado) * random() END
         FROM unnest(?::int[]) WITH ORDINALITY AS u(id, ordem)
         CROSS JOIN LATERAL generate_series(1, CASE WHEN u.ordem = 1 THEN ?::int ELSE ?::int END) AS g
         CROSS JOIN LATERAL (SELECT clock_timestamp() - random() * interval '90 days' + (g - g) * interval '1 second' AS criado) AS c`,
      [ids, AVISOS_DO_USUARIO_PESADO, AVISOS_POR_USUARIO]
    );
    // Fila: itens de 90 dias, quase todos encerrados, alguns pendentes
    await db.raw(
      `INSERT INTO notificacao_outbox (notificacao_id, usuario_id, evento_tipo, categoria, operacao, ocorrencia_versao,
         chave_idempotencia, payload_push, status, ultimo_erro, criado_em, processado_em)
       SELECT n.id, n.usuario_id, 'SOLICITACAO_APROVADA', 'SOLICITACOES', 'Administrativo', n.id::text, 'medicao:' || n.id,
              '{}'::jsonb, s.status,
              CASE s.status WHEN 'IGNORADO' THEN 'CATEGORIA_DESLIGADA' WHEN 'FALHA_DEFINITIVA' THEN 'HTTP_410' END,
              n.criado_em, CASE WHEN s.status = 'PENDENTE' THEN NULL ELSE n.criado_em + interval '2 seconds' END
         FROM (SELECT id, usuario_id, criado_em, row_number() OVER (ORDER BY id) AS r FROM notificacoes
                WHERE chave_idempotencia LIKE 'medicao:%' ORDER BY id LIMIT ?::int) AS n
         CROSS JOIN LATERAL (SELECT CASE WHEN n.r % 2000 = 0 THEN 'PENDENTE' WHEN n.r % 50 = 0 THEN 'FALHA_DEFINITIVA'
                                         WHEN n.r % 3 = 0 THEN 'IGNORADO' ELSE 'ENVIADO' END AS status) AS s`,
      [ITENS_NA_FILA]
    );
    // Até 5 aparelhos por pessoa (o limite)
    await db.raw(
      `INSERT INTO push_subscriptions (usuario_id, endpoint, p256dh, auth)
       SELECT u.id, 'https://fcm.googleapis.com/fcm/send/medicao-' || u.id || '-' || g, md5(random()::text), md5(random()::text)
         FROM unnest(?::int[]) AS u(id) CROSS JOIN generate_series(1, 1 + (u.id % 5)) AS g`,
      [ids]
    );
    await db.raw('ANALYZE notificacoes, notificacao_outbox, push_subscriptions, usuarios');
    const [{ avisos }] = (await db.raw('SELECT count(*)::int AS avisos FROM notificacoes')).rows;
    const [{ fila }] = (await db.raw('SELECT count(*)::int AS fila FROM notificacao_outbox')).rows;
    const [{ aparelhos }] = (await db.raw('SELECT count(*)::int AS aparelhos FROM push_subscriptions')).rows;
    relatorio.massa = { usuarios: USUARIOS, avisos, fila, aparelhos, carga_s: Number(((performance.now() - inicio) / 1000).toFixed(1)) };

    servidor = createServer(app).listen(0, '127.0.0.1');
    await new Promise((resolve) => servidor.once('listening', resolve));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  }, 300_000);

  afterAll(async () => {
    if (servidor) await new Promise((resolve) => servidor.close(resolve));
    if (pessoas.length > 0) await db('usuarios').whereIn('id', pessoas.map((p) => p.id)).del();
    console.info(JSON.stringify(relatorio, null, 2));
    if (process.env.SCRUM241_RELATORIO) writeFileSync(process.env.SCRUM241_RELATORIO, JSON.stringify(relatorio, null, 2));
    vi.restoreAllMocks();
    await db.destroy();
  }, 120_000);

  it('planos: contador, primeira página, página antiga e métricas usam índice e respondem em milissegundos', async () => {
    const planos: Record<string, Awaited<ReturnType<typeof explicar>>[]> = {};
    const caminhos = {
      contador: '/api/notificacoes/contador',
      central_primeira_pagina: '/api/notificacoes?limit=20',
      metricas: '/api/notificacoes/metricas',
    };
    for (const [nome, caminho] of Object.entries(caminhos)) {
      const quem = nome === 'metricas' ? admin : pesado;
      const consultas = await consultasDe(() => chamar(quem, caminho));
      planos[nome] = await Promise.all(consultas.map(({ sql, bindings }) => explicar(sql, bindings)));
    }
    // Página antiga: o cursor do aviso mais velho do usuário pesado
    const { rows: [antigo] } = await db.raw(
      `SELECT to_char(criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS em, id FROM notificacoes
        WHERE usuario_id = ? ORDER BY criado_em, id OFFSET 100 LIMIT 1`, [pesado.id]
    );
    const cursor = encodeURIComponent(`${antigo.em}|${antigo.id}`);
    const paginaAntiga = await consultasDe(async () => {
      expect((await chamar(pesado, `/api/notificacoes?limit=20&cursor=${cursor}`)).status).toBe(200);
    });
    planos.central_pagina_antiga = await Promise.all(paginaAntiga.map(({ sql, bindings }) => explicar(sql, bindings)));
    relatorio.planos = planos;

    // As tabelas que crescem com o uso nunca são lidas inteiras (usuarios e as de origem são pequenas aqui)
    const todas = Object.values(planos).flat();
    // Contador, central (lista e contador) duas vezes e as três consultas da fila e dos avisos nas métricas
    expect(todas.filter((p) => p.plano.some((no) => /notificac/.test(no))).length).toBe(8);
    for (const p of todas) expect(p.plano.join(' | '), p.sql).not.toMatch(/Seq Scan (notificacoes|notificacao_outbox)\b/);
  }, 120_000);

  it('em sequência: contador, central e métricas', async () => {
    const medir = async (quem: Pessoa, caminho: string, vezes: number) => {
      const tempos: number[] = [];
      for (let i = 0; i < vezes; i += 1) {
        const { status, ms } = await chamar(quem, caminho);
        expect(status).toBe(200);
        tempos.push(ms);
      }
      return resumo(tempos);
    };
    relatorio.sequencial = {
      contador_usuario_tipico: await medir(pessoas[1], '/api/notificacoes/contador', 200),
      contador_usuario_pesado: await medir(pesado, '/api/notificacoes/contador', 200),
      central_usuario_pesado: await medir(pesado, '/api/notificacoes?limit=20', 100),
      metricas: await medir(admin, '/api/notificacoes/metricas', 30),
    };
  }, 120_000);

  it('rajada: todas as abas consultando no mesmo instante', async () => {
    const rajadas: Record<string, unknown> = {};
    for (const abasPorPessoa of [1, 2, 3]) {
      const chamadas = pessoas.flatMap((p) => Array.from({ length: abasPorPessoa }, () => p));
      const inicio = performance.now();
      const respostas = await Promise.all(chamadas.map((p) => chamar(p, '/api/notificacoes/contador')));
      const porStatus: Record<number, number> = {};
      for (const { status } of respostas) porStatus[status] = (porStatus[status] ?? 0) + 1;
      rajadas[`${chamadas.length}_simultaneas`] = {
        abas_por_pessoa: abasPorPessoa, total_ms: Number((performance.now() - inicio).toFixed(1)), status: porStatus,
        ...resumo(respostas.filter((r) => r.status === 200).map((r) => r.ms)),
      };
    }
    relatorio.rajada = { limite_simultaneas: env.maxRequisicoesSimultaneas, ...rajadas };
  }, 120_000);

  it('vazão: quantas consultas por segundo a API atende, contra a demanda do sino', async () => {
    const vazao: Record<string, unknown> = {};
    for (const clientes of [5, 20]) {
      let atendidas = 0;
      const fim = performance.now() + 5_000;
      await Promise.all(Array.from({ length: clientes }, async (_, i) => {
        const p = pessoas[i % pessoas.length];
        while (performance.now() < fim) {
          const { status } = await chamar(p, '/api/notificacoes/contador');
          if (status === 200) atendidas += 1;
        }
      }));
      vazao[`${clientes}_clientes`] = { por_segundo: Number((atendidas / 5).toFixed(1)) };
    }
    relatorio.vazao = vazao;
    // Demanda estimada (não medida): uma consulta por minuto por aba visível
    relatorio.demanda_estimada_por_segundo = { '10_pessoas_1_aba': 0.17, '50_pessoas_1_aba': 0.83, '50_pessoas_3_abas': 2.5 };
  }, 120_000);
});
