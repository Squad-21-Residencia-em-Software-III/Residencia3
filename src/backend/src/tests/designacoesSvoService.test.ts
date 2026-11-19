import { describe, expect, it, vi } from 'vitest';
import type { Knex } from 'knex';
import { atualizarDesignacoesSvo } from '../services/designacoesSvoService';

vi.mock('../models/auditoriaModel', () => ({ auditoriaModel: { registrar: vi.fn() }, MODULOS_AUDITORIA: { VIAGENS: 'VIAGENS' } }));

const trx = vi.fn() as unknown as Knex.Transaction;
const base = { ordemId: 1, equipeId: 2, integrantes: [3], lotacao: 2,
  inicio: new Date('2099-01-01T10:00:00Z'), fim: new Date('2099-01-01T11:00:00Z'), autorId: 1 };

describe('regras de designação SVO', () => {
  it('rejeita equipe sem integrante', async () => {
    await expect(atualizarDesignacoesSvo(trx, { ...base, integrantes: [] })).rejects.toMatchObject({ statusCode: 400 });
  });
  it('rejeita integrante sem equipe', async () => {
    await expect(atualizarDesignacoesSvo(trx, { ...base, equipeId: null })).rejects.toMatchObject({ statusCode: 400 });
  });
  it('rejeita integrante duplicado', async () => {
    await expect(atualizarDesignacoesSvo(trx, { ...base, integrantes: [3, 3], lotacao: 4 })).rejects.toMatchObject({ statusCode: 400 });
  });
  it.each([{ lotacao: 1, integrantes: [3] }, { lotacao: 3, integrantes: [3, 4, 5] }, { lotacao: null, integrantes: [3] }])
   ('rejeita falta ou excesso de lugares na cabine', async ({ lotacao, integrantes }) => {
      await expect(atualizarDesignacoesSvo(trx, { ...base, lotacao, integrantes })).rejects.toMatchObject({ statusCode: 409 });
    });
});

describe('persistência de designações', () => {
  function transacao(iniciada = false) {
    const insercoes: unknown[] = [];
    const fn = (tabela: string) => {
      const q: Record<string, any> = {};
      for (const metodo of ['join', 'where', 'whereNull', 'whereIn', 'whereNot', 'andWhere', 'forUpdate', 'select']) q[metodo] = () => q;
      q.first = async () => tabela === 'ordens_svo' ? { data_hora_saida: iniciada ? new Date() : null } : undefined;
      q.insert = async (dados: unknown) => { insercoes.push(dados); };
      q.then = (resolve: (valor: unknown) => void) => Promise.resolve(tabela === 'equipes_svo_integrantes as v' ? [{ id: 3 }, { id: 4 }] : []).then(resolve);
      return q;
    };
    return { trx: Object.assign(fn, { fn: { now: () => 'agora' } }) as unknown as Knex.Transaction, insercoes };
  }
  it('designa dois integrantes em cabine de três lugares', async () => {
    const t = transacao();
    await atualizarDesignacoesSvo(t.trx, { ...base, integrantes: [3, 4], lotacao: 3 });
    expect(t.insercoes).toEqual([
      expect.objectContaining({ ordem_id: 1, equipe_id: 2, usuario_id: 3 }),
      expect.objectContaining({ ordem_id: 1, equipe_id: 2, usuario_id: 4 }),
    ]);
  });
  it('não altera designações após o início real', async () => {
    const t = transacao(true);
    await expect(atualizarDesignacoesSvo(t.trx, base)).rejects.toMatchObject({ statusCode: 409 });
    expect(t.insercoes).toHaveLength(0);
  });
});
