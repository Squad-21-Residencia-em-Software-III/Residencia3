import type { Knex } from 'knex';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// SCRUM-234: regras de quem recebe S3, S4 e S5, sem banco. O fluxo real está em avisosSvoS3S5Postgres.test.ts.
vi.mock('../config/notificacoes', () => ({ configNotificacoes: { ativas: true } }));
vi.mock('../services/publicacaoNotificacoes', () => ({ publicarNotificacao: vi.fn(async () => ({ criadas: 1 })) }));

import { configNotificacoes } from '../config/notificacoes';
import { notificacaoSvoService, type EquipeDaOrdem } from '../services/notificacaoSvoService';
import { publicarNotificacao } from '../services/publicacaoNotificacoes';

const trx = { isTransaction: true } as unknown as Knex.Transaction;
const inicio = new Date('2026-11-27T13:00:00Z');
const fim = new Date('2026-11-27T14:00:00Z');

const equipe = (dados: Partial<EquipeDaOrdem> = {}): EquipeDaOrdem => ({
  ordemId: 50, motoristaUsuarioId: 7, integrantes: new Map([[11, 101], [12, 102]]), inicio, fim, veiculoId: 3, ...dados,
});
const chamadas = () => vi.mocked(publicarNotificacao).mock.calls.map(([, e]) => ({
  tipo: e.tipo, destinatarios: e.destinatarios, urlDestino: e.urlDestino, ocorrencia: e.ocorrencia, tag: e.push?.tag,
}));

beforeEach(() => {
  vi.clearAllMocks();
  configNotificacoes.ativas = true;
});

describe('S3 na alocação', () => {
  it('um aviso por pessoa designada, com o link de cada perfil e a tag da ordem', async () => {
    await notificacaoSvoService.publicarDesignacoes(null, equipe(), 1, trx);
    expect(chamadas()).toEqual([
      { tipo: 'SVO_ORDEM_ATRIBUIDA', destinatarios: [7], urlDestino: '/viagens', ocorrencia: expect.stringMatching(/^motorista:/), tag: 'ordem-svo-50' },
      { tipo: 'SVO_ORDEM_ATRIBUIDA', destinatarios: [11], urlDestino: '/minhas-coletas', ocorrencia: 'designacao:101', tag: 'ordem-svo-50' },
      { tipo: 'SVO_ORDEM_ATRIBUIDA', destinatarios: [12], urlDestino: '/minhas-coletas', ocorrencia: 'designacao:102', tag: 'ordem-svo-50' },
    ]);
    expect(vi.mocked(publicarNotificacao).mock.calls.every(([, e]) => e.autorId === 1 && e.push?.categoria === 'SVO')).toBe(true);
  });

  it('sem motorista SVO nem integrantes, nada é publicado', async () => {
    await notificacaoSvoService.publicarDesignacoes(null, equipe({ motoristaUsuarioId: null, integrantes: new Map() }), 1, trx);
    expect(publicarNotificacao).not.toHaveBeenCalled();
  });
});

describe('S3 e S4 na reprogramação', () => {
  it('horário novo: S4 para quem continua, em um aviso por perfil', async () => {
    await notificacaoSvoService.publicarDesignacoes(equipe(), equipe({ inicio: new Date('2026-11-27T15:00:00Z') }), 1, trx);
    expect(chamadas()).toEqual([
      expect.objectContaining({ tipo: 'SVO_ORDEM_REAGENDADA', destinatarios: [7], urlDestino: '/viagens', tag: 'ordem-svo-50' }),
      expect.objectContaining({ tipo: 'SVO_ORDEM_REAGENDADA', destinatarios: [11, 12], urlDestino: '/minhas-coletas' }),
    ]);
  });

  it('troca de veículo também é reagendamento', async () => {
    await notificacaoSvoService.publicarDesignacoes(equipe(), equipe({ veiculoId: 4 }), 1, trx);
    expect(chamadas().map((c) => c.tipo)).toEqual(['SVO_ORDEM_REAGENDADA', 'SVO_ORDEM_REAGENDADA']);
  });

  it('mesma agenda e mesma equipe: nenhum aviso', async () => {
    await notificacaoSvoService.publicarDesignacoes(equipe(), equipe(), 1, trx);
    expect(publicarNotificacao).not.toHaveBeenCalled();
  });

  it('quem entra recebe S3, quem sai nada; motorista novo recebe S3 e não S4', async () => {
    const depois = equipe({ motoristaUsuarioId: 8, integrantes: new Map([[11, 101], [13, 103]]), inicio: new Date('2026-11-27T15:00:00Z') });
    await notificacaoSvoService.publicarDesignacoes(equipe(), depois, 1, trx);
    expect(chamadas()).toEqual([
      expect.objectContaining({ tipo: 'SVO_ORDEM_ATRIBUIDA', destinatarios: [8], urlDestino: '/viagens' }),
      expect.objectContaining({ tipo: 'SVO_ORDEM_ATRIBUIDA', destinatarios: [13], ocorrencia: 'designacao:103' }),
      expect.objectContaining({ tipo: 'SVO_ORDEM_REAGENDADA', destinatarios: [11] }),
    ]);
    expect(chamadas().flatMap((c) => c.destinatarios)).not.toContain(12);
    expect(chamadas().flatMap((c) => c.destinatarios)).not.toContain(7);
  });

  it('nova designação da mesma pessoa (outra linha) é uma nova atribuição', async () => {
    await notificacaoSvoService.publicarDesignacoes(equipe(), equipe({ integrantes: new Map([[11, 201], [12, 102]]) }), 1, trx);
    expect(chamadas()).toEqual([expect.objectContaining({ tipo: 'SVO_ORDEM_ATRIBUIDA', destinatarios: [11], ocorrencia: 'designacao:201' })]);
  });
});

describe('S5 no cancelamento', () => {
  it('motorista e integrantes designados, cada perfil com o seu link', async () => {
    await notificacaoSvoService.publicarCancelamento(equipe(), 1, trx);
    expect(chamadas()).toEqual([
      { tipo: 'SVO_ORDEM_CANCELADA', destinatarios: [7], urlDestino: '/viagens', ocorrencia: 'cancelamento', tag: 'ordem-svo-50' },
      { tipo: 'SVO_ORDEM_CANCELADA', destinatarios: [11, 12], urlDestino: '/minhas-coletas', ocorrencia: 'cancelamento', tag: 'ordem-svo-50' },
    ]);
  });
});

it('desligado ou sem equipe: nada é publicado nem consultado', async () => {
  configNotificacoes.ativas = false;
  expect(await notificacaoSvoService.equipeParaAvisos(trx, 50)).toBeNull();
  await notificacaoSvoService.publicarDesignacoes(null, equipe(), 1, trx);
  await notificacaoSvoService.publicarCancelamento(equipe(), 1, trx);
  configNotificacoes.ativas = true;
  await notificacaoSvoService.publicarDesignacoes(null, null, 1, trx);
  await notificacaoSvoService.publicarCancelamento(null, 1, trx);
  expect(publicarNotificacao).not.toHaveBeenCalled();
});
