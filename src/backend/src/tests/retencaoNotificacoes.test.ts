import knex, { type Knex } from 'knex';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { inventariarRetencaoPush, lerPrazosSimulados } from '../services/inventarioRetencaoPush';
import {
  executarRetencaoNotificacoes,
  lerArgumentosRetencaoNotificacoes,
  processarRetencaoNotificacoes,
} from '../services/retencaoNotificacoes';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validarEstadoMinimoPrivilegio } = require('../../scripts/provisionar-usuario-app.cjs') as {
  validarEstadoMinimoPrivilegio: (estado: Record<string, unknown>, opcoes?: Record<string, unknown>) => boolean;
};

const DIA_MS = 24 * 60 * 60 * 1000;
const AGORA = new Date('2026-11-25T12:00:00.000Z');
const antes = (dias: number, extraMs = 0) => new Date(AGORA.getTime() - dias * DIA_MS - extraMs);

function dbFalso(linhas: Array<{ lidas: string; nao_lidas: string }>) {
  const raw = vi.fn();
  for (const linha of linhas) raw.mockResolvedValueOnce({ rows: [linha] });
  return { raw, db: { raw } as unknown as Knex };
}

describe('Inventário de retenção Push', () => {
  it('só aceita prazos e rejeita argumentos de aplicação ou duplicados', () => {
    expect(lerPrazosSimulados(['--outbox=180', '--assinaturas=90'])).toEqual({ assinaturas: 90, outbox: 180 });
    expect(() => lerPrazosSimulados(['--aplicar'])).toThrow();
    expect(() => lerPrazosSimulados(['--outbox=180', '--outbox=90'])).toThrow();
  });

  it('rejeita prazo ausente ou fora do intervalo numérico antes de acessar o banco', async () => {
    const { db: falso, raw } = dbFalso([]);
    await expect(inventariarRetencaoPush(falso, lerPrazosSimulados(['--outbox=180']))).rejects.toThrow();
    await expect(inventariarRetencaoPush(falso, { assinaturas: Number.POSITIVE_INFINITY, outbox: 180 })).rejects.toThrow();
    expect(raw).not.toHaveBeenCalled();
  });
});

describe('Retenção de notificações — argumentos e orquestração (sem banco)', () => {
  it('usa padrões seguros: simulação, lote de 100 e 1 lote', () => {
    expect(lerArgumentosRetencaoNotificacoes([])).toEqual({ aplicar: false, limite: 100, lotes: 1 });
  });

  it('aceita --aplicar com limite e lotes dentro dos intervalos', () => {
    expect(lerArgumentosRetencaoNotificacoes(['--aplicar', '--limite=200', '--lotes=20'])).toEqual({
      aplicar: true, limite: 200, lotes: 20,
    });
  });

  it.each([
    ['argumento desconhecido', ['--tudo']],
    ['limite zero', ['--limite=0']],
    ['limite acima do máximo', ['--limite=501']],
    ['lotes zero', ['--aplicar', '--lotes=0']],
    ['lotes acima do máximo', ['--aplicar', '--lotes=51']],
    ['vários lotes sem --aplicar', ['--lotes=2']],
    ['valor não numérico', ['--limite=abc']],
  ])('rejeita %s', (_nome, argumentos) => {
    expect(() => lerArgumentosRetencaoNotificacoes(argumentos)).toThrow();
  });

  it('rejeita lote fora do intervalo antes de tocar o banco', async () => {
    const { raw, db: falso } = dbFalso([]);
    await expect(processarRetencaoNotificacoes(falso, { aplicar: true, limite: 0 })).rejects.toThrow(/1 a 500/);
    await expect(processarRetencaoNotificacoes(falso, { aplicar: true, limite: 501 })).rejects.toThrow(/1 a 500/);
    expect(raw).not.toHaveBeenCalled();
  });

  it('na simulação conta os candidatos e nunca emite DELETE', async () => {
    const { raw, db: falso } = dbFalso([{ lidas: '2', nao_lidas: '1' }]);

    const resultado = await processarRetencaoNotificacoes(falso, { aplicar: false, limite: 100, agora: AGORA });

    expect(resultado).toEqual({ candidatos: 3, lidas: 2, naoLidas: 1, removidas: 0, falhas: 0 });
    expect(raw.mock.calls[0][0]).not.toMatch(/DELETE/i);
  });

  it('usa os cortes de 30 dias (lidas) e 90 dias (não lidas) em horas fixas', async () => {
    const { raw, db: falso } = dbFalso([{ lidas: '0', nao_lidas: '0' }]);

    await processarRetencaoNotificacoes(falso, { aplicar: true, limite: 50, agora: AGORA });

    expect(raw.mock.calls[0][1]).toEqual([AGORA.toISOString(), 720, AGORA.toISOString(), 2160, 50,
      AGORA.toISOString(), 720, AGORA.toISOString(), 2160]);
  });

  it('em caso de falha não repassa a mensagem do erro e marca a falha', async () => {
    const raw = vi.fn().mockRejectedValue(new Error('senha=segredo host=interno'));
    const resultado = await processarRetencaoNotificacoes(
      { raw } as unknown as Knex, { aplicar: true, limite: 10, agora: AGORA },
    );

    expect(resultado).toEqual({ candidatos: 0, lidas: 0, naoLidas: 0, removidas: 0, falhas: 1 });
    expect(JSON.stringify(resultado)).not.toContain('segredo');
  });

  it('para ao primeiro lote com falha e sinaliza o erro', async () => {
    const raw = vi.fn()
      .mockResolvedValueOnce({ rows: [{ lidas: '2', nao_lidas: '0' }] })
      .mockRejectedValueOnce(new Error('queda de conexão'));

    const { lotes, falhou } = await executarRetencaoNotificacoes(
      { raw } as unknown as Knex, { aplicar: true, limite: 2, lotes: 5, agora: AGORA },
    );

    expect(falhou).toBe(true);
    expect(lotes.map((l) => l.falhas)).toEqual([0, 1]);
    expect(raw).toHaveBeenCalledTimes(2);
  });

  it('para quando o lote vem incompleto (acabaram os elegíveis)', async () => {
    const { raw, db: falso } = dbFalso([{ lidas: '2', nao_lidas: '0' }, { lidas: '1', nao_lidas: '0' }]);

    const { lotes, falhou } = await executarRetencaoNotificacoes(
      falso, { aplicar: true, limite: 2, lotes: 10, agora: AGORA },
    );

    expect(falhou).toBe(false);
    expect(lotes.map((l) => l.removidas)).toEqual([2, 1]);
    expect(raw).toHaveBeenCalledTimes(2);
  });

  it('exige --aplicar para executar mais de um lote', async () => {
    const { raw, db: falso } = dbFalso([]);
    await expect(executarRetencaoNotificacoes(falso, { aplicar: false, limite: 10, lotes: 2 })).rejects.toThrow();
    expect(raw).not.toHaveBeenCalled();
  });
});

describe('Privilégio DELETE em notificações (SCRUM-242)', () => {
  const estadoBase = {
    rolname: 'cron_teste', rolcanlogin: true, rolsuper: false, rolcreatedb: false, rolcreaterole: false,
    rolreplication: false, rolbypassrls: false, rolinherit: false, rolesHerdadas: [],
    podeCriarNoPublic: false, podeUsarPublic: true, podeAcessarMigrations: false,
    privilegiosExcessivosTabelas: [],
  };

  it('continua proibindo DELETE em notificacoes por padrão (role da aplicação e de expiração)', () => {
    expect(() => validarEstadoMinimoPrivilegio({ ...estadoBase, podeDeletarNotificacoes: true }))
      .toThrow(/DELETE sobre a tabela notificacoes/);
  });

  it('só aceita DELETE em notificacoes quando a role de retenção é validada explicitamente', () => {
    expect(validarEstadoMinimoPrivilegio(
      { ...estadoBase, podeDeletarNotificacoes: true }, { permitirDeletarNotificacoes: true },
    )).toBe(true);
  });

  it('mesmo para a role de retenção, as demais violações continuam sendo barradas', () => {
    expect(() => validarEstadoMinimoPrivilegio(
      { ...estadoBase, podeDeletarNotificacoes: true, rolsuper: true }, { permitirDeletarNotificacoes: true },
    )).toThrow(/rolsuper/);
  });
});

// Exige PostgreSQL descartável com as migrations aplicadas (o CI já provê frotas_teste).
const habilitado = process.env.NOTIFICACOES_POSTGRES_TESTS === '1';
// Importado só quando a suíte de banco está ligada, para os testes unitários não exigirem .env/conexão.
let db: Knex;

/** Executa o teste numa transação que SEMPRE sofre rollback, sem deixar dados no banco. */
async function emTransacaoDescartavel(corpo: (trx: Knex.Transaction) => Promise<void>) {
  let erro: unknown;
  await db.transaction(async (trx) => {
    try {
      await corpo(trx);
    } catch (e) {
      erro = e;
    }
    await trx.rollback();
  }).catch(() => undefined);
  if (erro) throw erro;
}

async function criarUsuario(trx: Knex, rotulo: string) {
  const [usuario] = await trx('usuarios').insert({
    nome: `Teste ${rotulo}`, email: `${randomBytes(8).toString('hex')}@testes.invalid`,
    senha: 'hash-de-teste', perfil: 'SOLICITANTE', tipo_usuario: 'SOLICITANTE',
  }).returning('id');
  return usuario.id as number;
}

async function criarNotificacao(
  trx: Knex,
  usuarioId: number,
  { criadoEm, lidaEm = null }: { criadoEm: Date; lidaEm?: Date | null },
) {
  const [nova] = await trx('notificacoes').insert({
    usuario_id: usuarioId, tipo: 'teste', titulo: 'Título', mensagem: 'Mensagem',
    severidade: 'info', operacao: 'Administrativo', url_destino: '/dashboard',
    chave_idempotencia: randomBytes(12).toString('hex'),
    criado_em: criadoEm, lida_em: lidaEm,
  }).returning('id');
  return nova.id as number;
}

async function idsRestantes(trx: Knex.Transaction, ids: number[]) {
  const linhas = await trx('notificacoes').whereIn('id', ids).select('id');
  return new Set(linhas.map(({ id }) => id as number));
}

describe.skipIf(!habilitado)('Retenção de notificações em PostgreSQL descartável', () => {
  beforeAll(async () => {
    if (process.env.POSTGRES_HOST !== '127.0.0.1' || process.env.POSTGRES_DB !== 'frotas_teste') {
      throw new Error('A suíte exige PostgreSQL descartável em 127.0.0.1/frotas_teste');
    }
    ({ db } = await import('../config/database.js'));
  });
  afterAll(async () => { if (db) await db.destroy(); });

  it('simula o corte estrito com role somente leitura e preserva todos os registros Push', async () => {
    await emTransacaoDescartavel(async (trx) => {
      const antesDaCarga = await inventariarRetencaoPush(trx, { assinaturas: 90, outbox: 180 }, AGORA);
      const usuario = await criarUsuario(trx, 'inventario-push');
      const criadoEm = antes(365);
      for (const [status, atualizadoEm] of [
        ['ATIVA', antes(100)], ['INVALIDA', antes(90, 1)], ['INVALIDA', antes(90)],
        ['REVOGADA', antes(90, 1)], ['EXPIRADA', antes(89)],
      ] as const) {
        await trx('push_subscriptions').insert({
          usuario_id: usuario, endpoint: `https://push.testes.invalid/${randomBytes(8).toString('hex')}`,
          p256dh: 'chave-publica-teste', auth: 'chave-auth-teste',
          status, ativa: status === 'ATIVA', criado_em: criadoEm, atualizado_em: atualizadoEm,
          ultimo_erro_em: status === 'INVALIDA' ? atualizadoEm : null,
          revogada_em: status === 'REVOGADA' ? atualizadoEm : null,
          expirada_em: status === 'EXPIRADA' ? atualizadoEm : null,
        });
      }
      for (const [status, processadoEm] of [
        ['PENDENTE', null], ['PROCESSANDO', null], ['ENVIADO', antes(180)],
        ['FALHA_DEFINITIVA', antes(180, 1)], ['IGNORADO', antes(181)],
      ] as const) {
        const chave = randomBytes(8).toString('hex');
        await trx('notificacao_outbox').insert({
          usuario_id: usuario, evento_tipo: 'TESTE_RETENCAO', operacao: 'Administrativo',
          chave_idempotencia: chave, ocorrencia_versao: chave, status,
          criado_em: criadoEm, processado_em: processadoEm,
        });
      }

      const role = 'qa_inventario_' + randomBytes(5).toString('hex');
      await trx.raw('CREATE ROLE ?? NOLOGIN', [role]);
      await trx.raw('GRANT USAGE ON SCHEMA public TO ??', [role]);
      await trx.raw('GRANT SELECT (status, ativa, atualizado_em) ON push_subscriptions TO ??', [role]);
      await trx.raw('GRANT SELECT (status, processado_em) ON notificacao_outbox TO ??', [role]);
      await trx.raw('SET LOCAL ROLE ??', [role]);
      const ler = () => inventariarRetencaoPush(trx, { assinaturas: 90, outbox: 180 }, AGORA);
      const depoisDaCarga = await ler();
      expect(await ler()).toEqual(depoisDaCarga);
      const { rows: [permissoes] } = await trx.raw(`
        SELECT has_column_privilege('push_subscriptions', 'endpoint', 'SELECT') AS endpoint,
          has_column_privilege('notificacao_outbox', 'payload_push', 'SELECT') AS payload,
          has_table_privilege('push_subscriptions', 'DELETE') AS excluir_assinatura,
          has_table_privilege('notificacao_outbox', 'DELETE') AS excluir_outbox
      `);
      expect(permissoes).toEqual({ endpoint: false, payload: false, excluir_assinatura: false, excluir_outbox: false });
      await trx.raw('RESET ROLE');

      const delta = (origem: string, status: string) => {
        const antes = antesDaCarga.contagens.find((linha) => linha.origem === origem && linha.status === status);
        const depois = depoisDaCarga.contagens.find((linha) => linha.origem === origem && linha.status === status)!;
        return [depois.total - (antes?.total ?? 0), depois.anterioresAoCorte - (antes?.anterioresAoCorte ?? 0)];
      };
      expect(delta('assinaturas', 'ATIVA')).toEqual([1, 0]);
      expect(delta('assinaturas', 'INVALIDA')).toEqual([2, 1]);
      expect(delta('assinaturas', 'REVOGADA')).toEqual([1, 1]);
      expect(delta('assinaturas', 'EXPIRADA')).toEqual([1, 0]);
      expect(delta('outbox', 'PENDENTE')).toEqual([1, 0]);
      expect(delta('outbox', 'PROCESSANDO')).toEqual([1, 0]);
      expect(delta('outbox', 'ENVIADO')).toEqual([1, 0]);
      expect(delta('outbox', 'FALHA_DEFINITIVA')).toEqual([1, 1]);
      expect(delta('outbox', 'IGNORADO')).toEqual([1, 1]);
      expect(await trx('push_subscriptions').where({ usuario_id: usuario })).toHaveLength(5);
      expect(await trx('notificacao_outbox').where({ usuario_id: usuario })).toHaveLength(5);
    });
  });

  it('revalida a elegibilidade após uma leitura concorrente liberar a linha', async () => {
    const usuario = await criarUsuario(db, 'concorrencia');
    const id = await criarNotificacao(db, usuario, { criadoEm: antes(100) });
    const leitura = await db.transaction();
    const expurgo = await db.transaction();
    let resultado: Promise<unknown> | undefined;
    try {
      await leitura('notificacoes').where({ id }).update({ lida_em: AGORA });
      const { rows: [{ pid }] } = await expurgo.raw('SELECT pg_backend_pid() AS pid');
      resultado = processarRetencaoNotificacoes(expurgo, { aplicar: true, limite: 500, agora: AGORA });
      await vi.waitFor(async () => {
        const { rows } = await db.raw('SELECT pg_blocking_pids(?) AS bloqueadores', [pid]);
        expect(rows[0].bloqueadores.length).toBeGreaterThan(0);
      });
      await leitura.commit();
      await expect(resultado).resolves.toMatchObject({ falhas: 0 });
      expect(await expurgo('notificacoes').where({ id }).first('lida_em'))
        .toEqual({ lida_em: AGORA });
    } finally {
      if (!leitura.isCompleted()) await leitura.rollback();
      await resultado;
      await expurgo.rollback();
      await db('usuarios').where({ id: usuario }).del();
    }
  });

  it('expurga com a role real provisionada e mantém o DELETE vedado à expiração', async () => {
    const { provisionarRolesCron } = require('../../scripts/provisionar-roles-cron.cjs') as {
      provisionarRolesCron: (opcoes: { env: Record<string, string | undefined> }) => Promise<void>;
    };
    const sufixo = randomBytes(5).toString('hex');
    const retencao = 'qa_retencao_' + sufixo;
    const expiracao = 'qa_expiracao_' + sufixo;
    const senha = 'credencial-exclusiva-do-teste';
    await provisionarRolesCron({ env: { ...process.env,
      FSPH_CRON_EXPIRACAO_USER: expiracao, FSPH_CRON_EXPIRACAO_PASSWORD: senha,
      FSPH_CRON_RETENCAO_USER: retencao, FSPH_CRON_RETENCAO_PASSWORD: senha,
    } });
    const restrita = knex({ client: 'pg', connection: {
      host: '127.0.0.1', port: Number(process.env.POSTGRES_PORT ?? 5432), database: 'frotas_teste',
      user: retencao, password: senha,
    } });
    const usuario = await criarUsuario(db, 'role');
    try {
      const alvo = await criarNotificacao(db, usuario, { criadoEm: antes(105) });
      await restrita.transaction(async (trx) => {
        const resultado = await processarRetencaoNotificacoes(trx, { aplicar: true, limite: 500, agora: AGORA });
        expect(resultado.falhas).toBe(0);
        expect(await trx('notificacoes').where({ id: alvo }).first('id')).toBeUndefined();
        await trx.rollback();
      }).catch((erro) => { if (erro) throw erro; });
      const { rows } = await db.raw(
        "SELECT has_table_privilege(?, 'notificacoes', 'DELETE') AS pode_excluir",
        [expiracao],
      );
      expect(rows[0].pode_excluir).toBe(false);
    } finally {
      await restrita.destroy();
      await db('usuarios').where({ id: usuario }).del();
      for (const role of [retencao, expiracao]) {
        await db.raw('DROP OWNED BY ??', [role]);
        await db.raw('DROP ROLE ??', [role]);
      }
    }
  });

  it('lidas: mantém 29 e 30 dias, remove 31 dias (a contagem parte de lida_em)', async () => {
    await emTransacaoDescartavel(async (trx) => {
      await trx('notificacoes').del();
      const u = await criarUsuario(trx, 'lidas');
      const criadoEm = antes(200);
      const d29 = await criarNotificacao(trx, u, { criadoEm, lidaEm: antes(29) });
      const d30 = await criarNotificacao(trx, u, { criadoEm, lidaEm: antes(30) });
      const d30mais = await criarNotificacao(trx, u, { criadoEm, lidaEm: antes(30, 1) });
      const d31 = await criarNotificacao(trx, u, { criadoEm, lidaEm: antes(31) });

      const resultado = await processarRetencaoNotificacoes(trx, { aplicar: true, limite: 100, agora: AGORA });

      expect(resultado).toMatchObject({ lidas: 2, naoLidas: 0, removidas: 2, falhas: 0 });
      expect(await idsRestantes(trx, [d29, d30, d30mais, d31])).toEqual(new Set([d29, d30]));
    });
  });

  it('não lidas: mantém 89 e 90 dias, remove 91 dias (a contagem parte de criado_em)', async () => {
    await emTransacaoDescartavel(async (trx) => {
      await trx('notificacoes').del();
      const u = await criarUsuario(trx, 'nao-lidas');
      const d89 = await criarNotificacao(trx, u, { criadoEm: antes(89) });
      const d90 = await criarNotificacao(trx, u, { criadoEm: antes(90) });
      const d90mais = await criarNotificacao(trx, u, { criadoEm: antes(90, 1) });
      const d91 = await criarNotificacao(trx, u, { criadoEm: antes(91) });

      const resultado = await processarRetencaoNotificacoes(trx, { aplicar: true, limite: 100, agora: AGORA });

      expect(resultado).toMatchObject({ lidas: 0, naoLidas: 2, removidas: 2, falhas: 0 });
      expect(await idsRestantes(trx, [d89, d90, d90mais, d91])).toEqual(new Set([d89, d90]));
    });
  });

  it('não confunde os dois prazos: lida há pouco (criada há muito) e não lida de 31 dias ficam', async () => {
    await emTransacaoDescartavel(async (trx) => {
      await trx('notificacoes').del();
      const u = await criarUsuario(trx, 'prazos');
      const lidaRecente = await criarNotificacao(trx, u, { criadoEm: antes(200), lidaEm: antes(1) });
      const naoLida31 = await criarNotificacao(trx, u, { criadoEm: antes(31) });

      const resultado = await processarRetencaoNotificacoes(trx, { aplicar: true, limite: 100, agora: AGORA });

      expect(resultado.removidas).toBe(0);
      expect(await idsRestantes(trx, [lidaRecente, naoLida31])).toEqual(new Set([lidaRecente, naoLida31]));
    });
  });

  it('trata usuários diferentes de forma independente e só remove o que é elegível', async () => {
    await emTransacaoDescartavel(async (trx) => {
      await trx('notificacoes').del();
      const [ana, bia, caio] = [
        await criarUsuario(trx, 'ana'), await criarUsuario(trx, 'bia'), await criarUsuario(trx, 'caio'),
      ];
      const anaVelha = await criarNotificacao(trx, ana, { criadoEm: antes(200), lidaEm: antes(31) });
      const anaNova = await criarNotificacao(trx, ana, { criadoEm: antes(2) });
      const biaVelha = await criarNotificacao(trx, bia, { criadoEm: antes(91) });
      const biaLidaRecente = await criarNotificacao(trx, bia, { criadoEm: antes(40), lidaEm: antes(10) });
      const caioNova = await criarNotificacao(trx, caio, { criadoEm: antes(1) });

      const resultado = await processarRetencaoNotificacoes(trx, { aplicar: true, limite: 100, agora: AGORA });

      expect(resultado).toMatchObject({ lidas: 1, naoLidas: 1, removidas: 2 });
      const todas = [anaVelha, anaNova, biaVelha, biaLidaRecente, caioNova];
      expect(await idsRestantes(trx, todas)).toEqual(new Set([anaNova, biaLidaRecente, caioNova]));
    });
  });

  it('é idempotente: a segunda execução seguida não remove nada', async () => {
    await emTransacaoDescartavel(async (trx) => {
      await trx('notificacoes').del();
      const u = await criarUsuario(trx, 'rerun');
      await criarNotificacao(trx, u, { criadoEm: antes(120) });
      await criarNotificacao(trx, u, { criadoEm: antes(5) });

      const primeira = await processarRetencaoNotificacoes(trx, { aplicar: true, limite: 100, agora: AGORA });
      const segunda = await processarRetencaoNotificacoes(trx, { aplicar: true, limite: 100, agora: AGORA });

      expect(primeira.removidas).toBe(1);
      expect(segunda).toMatchObject({ candidatos: 0, removidas: 0, falhas: 0 });
      expect(await trx('notificacoes').count({ total: '*' }).first()).toMatchObject({ total: '1' });
    });
  });

  it('simulação conta os candidatos mas não altera o banco', async () => {
    await emTransacaoDescartavel(async (trx) => {
      await trx('notificacoes').del();
      const u = await criarUsuario(trx, 'simular');
      await criarNotificacao(trx, u, { criadoEm: antes(120) });
      await criarNotificacao(trx, u, { criadoEm: antes(200), lidaEm: antes(40) });

      const resultado = await processarRetencaoNotificacoes(trx, { aplicar: false, limite: 100, agora: AGORA });

      expect(resultado).toMatchObject({ candidatos: 2, lidas: 1, naoLidas: 1, removidas: 0 });
      expect(await trx('notificacoes').count({ total: '*' }).first()).toMatchObject({ total: '2' });
    });
  });

  it('respeita o limite do lote e conclui em vários lotes, sempre dos mais antigos', async () => {
    await emTransacaoDescartavel(async (trx) => {
      await trx('notificacoes').del();
      const u = await criarUsuario(trx, 'lotes');
      const ids: number[] = [];
      for (let i = 0; i < 5; i++) ids.push(await criarNotificacao(trx, u, { criadoEm: antes(100 + i) }));
      const recente = await criarNotificacao(trx, u, { criadoEm: antes(3) });

      const primeiro = await processarRetencaoNotificacoes(trx, { aplicar: true, limite: 2, agora: AGORA });
      expect(primeiro.removidas).toBe(2);
      // os mais antigos (maior idade) saem primeiro
      expect(await idsRestantes(trx, ids)).toEqual(new Set([ids[0], ids[1], ids[2]]));

      const { lotes, falhou } = await executarRetencaoNotificacoes(
        trx, { aplicar: true, limite: 2, lotes: 5, agora: AGORA },
      );
      expect(falhou).toBe(false);
      expect(lotes.reduce((soma, l) => soma + l.removidas, 0)).toBe(3);
      expect(await idsRestantes(trx, [...ids, recente])).toEqual(new Set([recente]));
    });
  });

  it('falha no banco mantém todos os dados e permite novo rerun com sucesso', async () => {
    await emTransacaoDescartavel(async (trx) => {
      await trx('notificacoes').del();
      const u = await criarUsuario(trx, 'falha');
      const velha = await criarNotificacao(trx, u, { criadoEm: antes(120) });

      const quebrado = { raw: async () => { throw new Error('conexão perdida'); } } as unknown as Knex;
      const falha = await processarRetencaoNotificacoes(quebrado, { aplicar: true, limite: 10, agora: AGORA });
      expect(falha.falhas).toBe(1);
      expect(await idsRestantes(trx, [velha])).toEqual(new Set([velha]));

      const rerun = await processarRetencaoNotificacoes(trx, { aplicar: true, limite: 10, agora: AGORA });
      expect(rerun).toMatchObject({ removidas: 1, falhas: 0 });
      expect(await idsRestantes(trx, [velha])).toEqual(new Set());
    });
  });
});
