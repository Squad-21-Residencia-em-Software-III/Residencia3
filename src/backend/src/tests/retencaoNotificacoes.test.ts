import type { Knex } from 'knex';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

    expect(raw.mock.calls[0][1]).toEqual([AGORA.toISOString(), 720, AGORA.toISOString(), 2160, 50]);
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

async function criarUsuario(trx: Knex.Transaction, rotulo: string) {
  const [usuario] = await trx('usuarios').insert({
    nome: `Teste ${rotulo}`, email: `${randomBytes(8).toString('hex')}@testes.invalid`,
    senha: 'hash-de-teste', perfil: 'SOLICITANTE', tipo_usuario: 'SOLICITANTE',
  }).returning('id');
  return usuario.id as number;
}

async function criarNotificacao(
  trx: Knex.Transaction,
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
    ({ db } = await import('../config/database'));
  });
  afterAll(async () => { if (db) await db.destroy(); });

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
