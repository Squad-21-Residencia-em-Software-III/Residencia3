import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/publicacaoNotificacoes', () => ({ publicarNotificacao: vi.fn() }));

import { configNotificacoes, notificacoesLigadas } from '../config/notificacoes';
import { avisosSolicitacao } from '../services/avisosSolicitacao';
import { publicarNotificacao } from '../services/publicacaoNotificacoes';

const publicar = vi.mocked(publicarNotificacao);
const pedido = {
  id: 12, solicitante_id: 7, unidade_id: 1, origem: 'Rua da Origem', destino: 'Hospital do Destino', finalidade: 'Finalidade reservada',
  data_saida_desejada: '2099-01-01T10:00:00Z', status: 'RECUSADA' as const, motivo_recusa: 'Motivo reservado',
};

/** Consultas de destinatário: devolve sempre o usuário 7; `pedidos` responde a consulta da expiração. */
const trx = () => {
  const consulta = {
    whereIn: () => consulta, where: () => consulta, orderBy: () => consulta,
    pluck: async () => [7], select: async () => [{ id: 12, solicitante_id: 7 }],
  };
  return vi.fn(() => consulta);
};

beforeEach(() => {
  vi.resetAllMocks();
  configNotificacoes.ativas = true;
});
afterEach(() => { configNotificacoes.ativas = false; });

describe('Interruptor', () => {
  it.each([[undefined, false], ['', false], [' ', false], ['false', false], ['true', true], [' true ', true]])(
    'NOTIFICACOES_ATIVAS=%s', (valor, ligado) => expect(notificacoesLigadas(valor)).toBe(ligado));

  it.each(['1', 'sim', 'TRUE'])('recusa %s', (valor) => {
    expect(() => notificacoesLigadas(valor)).toThrow('NOTIFICACOES_ATIVAS deve ser true ou false');
  });

  it('desligado, nem consulta o banco', async () => {
    configNotificacoes.ativas = false;
    const conexao = trx();
    await avisosSolicitacao.criada(conexao as never, pedido);
    await avisosSolicitacao.decidida(conexao as never, pedido, 1);
    await avisosSolicitacao.expiradas(conexao as never, [12]);
    expect(conexao).not.toHaveBeenCalled();
    expect(publicar).not.toHaveBeenCalled();
  });

  it('a rotina de expiração não depende da configuração da API, como o JWT_SECRET', async () => {
    vi.resetModules();
    vi.doUnmock('../services/publicacaoNotificacoes');
    vi.doMock('../config/env', () => { throw new Error('env.ts não pode ser carregado pela rotina'); });
    await expect(vi.importActual('../services/solicitacaoViagemService')).resolves.toBeDefined();
    vi.doUnmock('../config/env');
  });
});

describe('Texto do push', () => {
  it('cabe na tela bloqueada e não tem motivo, local, finalidade nem número', async () => {
    const conexao = trx() as never;
    await avisosSolicitacao.decidida(conexao, { ...pedido, status: 'APROVADA' }, 1);
    await avisosSolicitacao.decidida(conexao, pedido, 1);
    await avisosSolicitacao.expiradas(conexao, [12]);
    const textos = publicar.mock.calls.map(([, e]) => e.push).filter((p) => p !== undefined);
    expect(textos).toHaveLength(3);
    for (const { titulo, corpo } of textos) {
      expect(titulo.length).toBeLessThanOrEqual(45);
      expect(corpo.length).toBeLessThanOrEqual(110);
      expect(`${titulo} ${corpo}`).not.toMatch(/reservad|Rua|Hospital|\d/i);
    }
    // Recusa: o push não revela a decisão
    expect(`${textos[1]!.titulo} ${textos[1]!.corpo}`).not.toMatch(/recus|negad|reprov/i);
  });
});
