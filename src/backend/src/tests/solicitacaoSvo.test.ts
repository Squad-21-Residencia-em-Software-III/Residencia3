import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { PERFIS, type Perfil } from '../constants/perfis';

const { trx, transaction } = vi.hoisted(() => {
  const trx = {};
  return { trx, transaction: vi.fn(async (callback: (conn: unknown) => unknown) => callback(trx)) };
});
// Gestor SVO associado à unidade SVO (exigirAssociacaoSvo)
vi.mock('../models/unidadeModel', async (importOriginal) => {
  const original = await importOriginal<typeof import('../models/unidadeModel')>();
  return { ...original, unidadeModel: { ...original.unidadeModel, estaAssociadoPorNome: vi.fn(async () => true) } };
});

vi.mock('../config/database', () => ({ db: { transaction } }));
vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn() } }));
vi.mock('../models/solicitacaoSvoModel', () => ({
  STATUS_SOLICITACAO_SVO: ['EM_TRIAGEM', 'CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'RECUSADA', 'CANCELADA'],
  solicitacaoSvoModel: {
    cadastrar: vi.fn(), listar: vi.fn(), buscarPorId: vi.fn(), buscarParaAtualizar: vi.fn(),
    buscarOrdemAtiva: vi.fn(), confirmar: vi.fn(), recusar: vi.fn(), gerarOrdem: vi.fn(),
  },
}));

import { app } from '../app';
import { authService } from '../services/authService';
import { solicitacaoSvoModel as model } from '../models/solicitacaoSvoModel';
import { auditoriaModel } from '../models/auditoriaModel';
import { solicitacaoSvoService as service } from '../services/solicitacaoSvoService';

// Mantém o service real nas requisições: cobre autorização, validação e estados.
vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() }, MODULOS_AUDITORIA: { SOLICITACOES_SVO: 'SOLICITACOES_SVO' },
}));

const autor = { id: 4, perfil: PERFIS.GESTOR_SVO };
const solicitacao = {
  id: 7, registrante_id: 2, dados_solicitante: 'Hospital', local_ocorrencia: 'Aracaju',
  material_sensivel: false, status: 'EM_TRIAGEM' as const, motivo_recusa: null,
  confirmado_por: null, confirmado_em: null,
};
const confirmada = { ...solicitacao, status: 'CONFIRMADA' as const, confirmado_por: 4, confirmado_em: new Date() };
const recusada = {
  ...solicitacao,
  status: 'RECUSADA' as const,
  motivo_recusa: 'Caso de causa externa encaminhado ao IML',
};
const ordem = {
  id: 11, solicitacao_id: 7, status: 'AGUARDANDO_ALOCACAO' as const,
  veiculo_id: null, motorista_id: null, equipe_id: null, capacidade_utilizada: 1,
};
const token = 'Bearer teste';
const autenticarComo = (perfil: Perfil) => vi.mocked(authService.usuarioDoToken).mockResolvedValue({
  id: autor.id, perfil,
} as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation(async (callback) => callback(trx));
  autenticarComo(PERFIS.GESTOR_SVO);
  vi.mocked(model.buscarPorId).mockResolvedValue(solicitacao);
  vi.mocked(model.buscarParaAtualizar).mockResolvedValue(solicitacao);
  vi.mocked(model.buscarOrdemAtiva).mockResolvedValue(undefined);
  vi.mocked(model.confirmar).mockResolvedValue(confirmada);
  vi.mocked(model.recusar).mockResolvedValue(recusada);
  vi.mocked(model.gerarOrdem).mockResolvedValue(ordem);
  vi.mocked(model.listar).mockResolvedValue({ dados: [solicitacao], total: 1 });
});

// Listagem e paginação são cobertas em solicitacaoSvoRoutes.test.ts (BL26)
describe('BL27 — análise SVO', () => {
  it('expõe os dados da ocorrência e a ordem atual para análise', async () => {
    const resposta = await request(app).get('/api/solicitacoes-svo/7').set('Authorization', token);
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ ...solicitacao, ordem: null });
    vi.mocked(model.buscarPorId).mockResolvedValue(confirmada);
    vi.mocked(model.buscarOrdemAtiva).mockResolvedValue(ordem);
    const confirmadaResposta = await request(app).get('/api/solicitacoes-svo/7').set('Authorization', token);
    expect(confirmadaResposta.body.ordem.id).toBe(11);
  });
});

describe('BL27 — confirmação e geração automática', () => {
  it.each([PERFIS.GESTOR_SVO, PERFIS.ADMINISTRADOR])('permite confirmar como %s', async (perfil) => {
    autenticarComo(perfil);
    const resposta = await request(app).patch('/api/solicitacoes-svo/7/confirmar').set('Authorization', token);
    expect(resposta.status).toBe(201);
    expect(resposta.body.solicitacao.status).toBe('CONFIRMADA');
    expect(resposta.body.ordem).toEqual(ordem);
    expect(model.buscarParaAtualizar).toHaveBeenCalledWith(7, trx);
    expect(model.confirmar).toHaveBeenCalledWith(7, 4, trx);
    expect(model.gerarOrdem).toHaveBeenCalledWith(7, trx);
    expect(vi.mocked(model.confirmar).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(model.gerarOrdem).mock.invocationCallOrder[0]!);
    expect(auditoriaModel.registrar).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: 4, modulo: 'SOLICITACOES_SVO', acao: expect.stringContaining('GEROU_ORDEM_COLETA id=11'),
    }), trx);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['CONFIRMADA', 'AGUARDANDO_ALOCACAO'],
    ['EM_ANDAMENTO', 'ALOCADA'],
    ['EM_ANDAMENTO', 'EM_DESLOCAMENTO'],
  ] as const)('repete confirmação em %s com ordem %s sem duplicação', async (status, statusOrdem) => {
    vi.mocked(model.buscarParaAtualizar).mockResolvedValue({ ...confirmada, status });
    vi.mocked(model.buscarOrdemAtiva).mockResolvedValue({ ...ordem, status: statusOrdem });
    const resposta = await request(app).patch('/api/solicitacoes-svo/7/confirmar').set('Authorization', token).send({});
    expect(resposta.status).toBe(200);
    expect(resposta.body.ordem.id).toBe(11);
    expect(model.confirmar).not.toHaveBeenCalled();
    expect(model.gerarOrdem).not.toHaveBeenCalled();
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it.each(['RECUSADA', 'CANCELADA', 'CONCLUIDA'] as const)('rejeita confirmação de solicitação %s', async (status) => {
    vi.mocked(model.buscarParaAtualizar).mockResolvedValue({ ...solicitacao, status });
    const resposta = await request(app).patch('/api/solicitacoes-svo/7/confirmar').set('Authorization', token);
    expect(resposta.status).toBe(409);
    expect(model.gerarOrdem).not.toHaveBeenCalled();
    expect(model.confirmar).not.toHaveBeenCalled();
  });

  it.each(['CONFIRMADA', 'EM_ANDAMENTO'] as const)('não gera ordem para %s sem ordem ativa', async (status) => {
    vi.mocked(model.buscarParaAtualizar).mockResolvedValue({ ...confirmada, status });
    await expect(service.confirmar(7, autor)).rejects.toMatchObject({ statusCode: 409 });
    expect(model.gerarOrdem).not.toHaveBeenCalled();
  });

  it.each([
    ['CONFIRMADA', 'ALOCADA'],
    ['CONFIRMADA', 'EM_DESLOCAMENTO'],
    ['EM_ANDAMENTO', 'AGUARDANDO_ALOCACAO'],
  ] as const)('rejeita solicitação %s com ordem %s', async (status, statusOrdem) => {
    vi.mocked(model.buscarParaAtualizar).mockResolvedValue({ ...confirmada, status });
    vi.mocked(model.buscarOrdemAtiva).mockResolvedValue({ ...ordem, status: statusOrdem });
    const resposta = await request(app).patch('/api/solicitacoes-svo/7/confirmar').set('Authorization', token);
    expect(resposta.status).toBe(409);
    expect(model.confirmar).not.toHaveBeenCalled();
    expect(model.gerarOrdem).not.toHaveBeenCalled();
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it('rejeita solicitação em triagem que já tenha ordem ativa', async () => {
    vi.mocked(model.buscarOrdemAtiva).mockResolvedValue(ordem);
    await expect(service.confirmar(7, autor)).rejects.toMatchObject({ statusCode: 409 });
    expect(model.confirmar).not.toHaveBeenCalled();
  });

  it.each(['detalhar', 'confirmar'] as const)('retorna 404 ao %s solicitação inexistente', async (metodo) => {
    vi.mocked(model.buscarPorId).mockResolvedValue(undefined);
    vi.mocked(model.buscarParaAtualizar).mockResolvedValue(undefined);
    const resposta = metodo === 'detalhar'
      ? await request(app).get('/api/solicitacoes-svo/999').set('Authorization', token)
      : await request(app).patch('/api/solicitacoes-svo/999/confirmar').set('Authorization', token);
    expect(resposta.status).toBe(404);
    expect(resposta.body.erro).toBe('Solicitação SVO não encontrada');
    expect(model.gerarOrdem).not.toHaveBeenCalled();
  });

  it('propaga falha da geração para abortar a transação de confirmação', async () => {
    const erro = new Error('Falha ao persistir ordem');
    vi.mocked(model.gerarOrdem).mockRejectedValue(erro);
    await expect(service.confirmar(7, autor)).rejects.toBe(erro);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(model.confirmar).toHaveBeenCalledWith(7, 4, trx);
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it('propaga falha da auditoria para abortar confirmação e ordem', async () => {
    const erro = new Error('Falha na auditoria');
    vi.mocked(auditoriaModel.registrar).mockRejectedValue(erro);
    await expect(service.confirmar(7, autor)).rejects.toBe(erro);
    expect(model.gerarOrdem).toHaveBeenCalledWith(7, trx);
  });

  it.each([{ status: 'CONFIRMADA' }, { confirmado_por: 1 }, { veiculo_id: 2 }, { confirmada: true }])(
    'rejeita tentativa de definir dados da confirmação pelo cliente: %j', async (corpo) => {
      const resposta = await request(app).patch('/api/solicitacoes-svo/7/confirmar').set('Authorization', token).send(corpo);
      expect(resposta.status).toBe(400);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('retorna 400 para JSON malformado sem alterar dados', async () => {
    const resposta = await request(app).patch('/api/solicitacoes-svo/7/confirmar')
      .set('Authorization', token).set('Content-Type', 'application/json').send('{');
    expect(resposta.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('SCRUM-166 — recusa SVO com justificativa obrigatória', () => {
  it.each([PERFIS.GESTOR_SVO, PERFIS.ADMINISTRADOR])(
    'recusa solicitação em triagem como %s sem gerar ordem e registra auditoria',
    async (perfil) => {
      autenticarComo(perfil);
      const resposta = await request(app)
        .patch('/api/solicitacoes-svo/7/recusar')
        .set('Authorization', token)
        .send({ motivo_recusa: '  Caso de causa externa encaminhado ao IML  ' });

      expect(resposta.status).toBe(200);
      expect(resposta.body.solicitacao.status).toBe('RECUSADA');
      expect(resposta.body.solicitacao.motivo_recusa).toBe('Caso de causa externa encaminhado ao IML');
      expect(model.buscarParaAtualizar).toHaveBeenCalledWith(7, trx);
      expect(model.recusar).toHaveBeenCalledWith(7, 'Caso de causa externa encaminhado ao IML', trx);
      expect(model.gerarOrdem).not.toHaveBeenCalled();
      expect(model.confirmar).not.toHaveBeenCalled();
      expect(auditoriaModel.registrar).toHaveBeenCalledWith(
        expect.objectContaining({
          usuario_id: 4,
          modulo: 'SOLICITACOES_SVO',
          acao: expect.stringContaining('RECUSOU_SOLICITACAO_SVO id=7'),
        }),
        trx,
      );
      expect(transaction).toHaveBeenCalledTimes(1);
    },
  );

  it('aceita também o campo motivo como alias normalizado', async () => {
    const resposta = await request(app)
      .patch('/api/solicitacoes-svo/7/recusar')
      .set('Authorization', token)
      .send({ motivo: 'A' });

    expect(resposta.status).toBe(200);
    expect(model.recusar).toHaveBeenCalledWith(7, 'A', trx);
  });

  it('aceita motivo no tamanho limite de 500 caracteres e rejeita 501', async () => {
    const motivo500 = 'x'.repeat(500);
    vi.mocked(model.recusar).mockResolvedValue({
      ...solicitacao,
      status: 'RECUSADA',
      motivo_recusa: motivo500,
    });

    const ok = await request(app)
      .patch('/api/solicitacoes-svo/7/recusar')
      .set('Authorization', token)
      .send({ motivo_recusa: motivo500 });
    expect(ok.status).toBe(200);
    expect(model.recusar).toHaveBeenCalledWith(7, motivo500, trx);

    const excedido = await request(app)
      .patch('/api/solicitacoes-svo/7/recusar')
      .set('Authorization', token)
      .send({ motivo_recusa: 'x'.repeat(501) });
    expect(excedido.status).toBe(400);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined,
    {},
    { motivo_recusa: '' },
    { motivo_recusa: '    ' },
    { motivo: '   ' },
    { motivo_recusa: null },
    { motivo_recusa: 123 },
    { motivo_recusa: 'Válido', status: 'RECUSADA' },
  ])('rejeita payload inválido na recusa com 400: %j', async (corpo) => {
    const req = request(app).patch('/api/solicitacoes-svo/7/recusar').set('Authorization', token);
    const resposta = corpo === undefined ? await req : await req.send(corpo);

    expect(resposta.status).toBe(400);
    expect(model.recusar).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('retorna 404 ao tentar recusar solicitação inexistente', async () => {
    vi.mocked(model.buscarParaAtualizar).mockResolvedValue(undefined);
    const resposta = await request(app)
      .patch('/api/solicitacoes-svo/999/recusar')
      .set('Authorization', token)
      .send({ motivo_recusa: 'Solicitação inexistente' });

    expect(resposta.status).toBe(404);
    expect(resposta.body.erro).toBe('Solicitação SVO não encontrada');
    expect(model.recusar).not.toHaveBeenCalled();
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it.each(['RECUSADA', 'CONFIRMADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'] as const)(
    'bloqueia recusa com 409 quando solicitação está em %s',
    async (status) => {
      vi.mocked(model.buscarParaAtualizar).mockResolvedValue({ ...solicitacao, status });
      const resposta = await request(app)
        .patch('/api/solicitacoes-svo/7/recusar')
        .set('Authorization', token)
        .send({ motivo_recusa: 'Tentativa fora da triagem' });

      expect(resposta.status).toBe(409);
      expect(model.recusar).not.toHaveBeenCalled();
      expect(model.gerarOrdem).not.toHaveBeenCalled();
      expect(auditoriaModel.registrar).not.toHaveBeenCalled();
    },
  );

  it('serializa recusa vs confirmação simultâneas sem gerar ordem quando a recusa vence', async () => {
    let estadoAtual: typeof solicitacao | typeof recusada = { ...solicitacao };
    let liberarLock!: () => void;
    const bloqueio = new Promise<void>((resolve) => {
      liberarLock = resolve;
    });

    vi.mocked(model.buscarParaAtualizar).mockImplementation(async (_id, _trx) => {
      if (estadoAtual.status === 'EM_TRIAGEM') {
        await bloqueio;
      }
      return estadoAtual;
    });

    vi.mocked(model.recusar).mockImplementation(async (_id, motivo) => {
      estadoAtual = { ...solicitacao, status: 'RECUSADA', motivo_recusa: motivo };
      return estadoAtual;
    });

    const promessaRecusa = request(app)
      .patch('/api/solicitacoes-svo/7/recusar')
      .set('Authorization', token)
      .send({ motivo_recusa: 'Causa externa — encaminhar ao IML' });

    const promessaConfirmacao = request(app)
      .patch('/api/solicitacoes-svo/7/confirmar')
      .set('Authorization', token);

    liberarLock();
    const [respRecusa, respConfirmacao] = await Promise.all([promessaRecusa, promessaConfirmacao]);

    expect(respRecusa.status).toBe(200);
    expect(respRecusa.body.solicitacao.status).toBe('RECUSADA');
    expect(respConfirmacao.status).toBe(409);
    expect(model.gerarOrdem).not.toHaveBeenCalled();
    expect(model.confirmar).not.toHaveBeenCalled();
    expect(auditoriaModel.registrar).toHaveBeenCalledTimes(1);
  });

  it('impede recusa duplicada simultânea sem regravar o estado nem duplicar auditoria', async () => {
    let estadoAtual: typeof solicitacao | typeof recusada = { ...solicitacao };
    let liberarLock!: () => void;
    const bloqueio = new Promise<void>((resolve) => {
      liberarLock = resolve;
    });

    vi.mocked(model.buscarParaAtualizar).mockImplementation(async () => {
      if (estadoAtual.status === 'EM_TRIAGEM') {
        await bloqueio;
      }
      return estadoAtual;
    });

    vi.mocked(model.recusar).mockImplementation(async (_id, motivo) => {
      estadoAtual = { ...solicitacao, status: 'RECUSADA', motivo_recusa: motivo };
      return estadoAtual;
    });

    const p1 = request(app)
      .patch('/api/solicitacoes-svo/7/recusar')
      .set('Authorization', token)
      .send({ motivo_recusa: 'Primeira recusa' });

    const p2 = request(app)
      .patch('/api/solicitacoes-svo/7/recusar')
      .set('Authorization', token)
      .send({ motivo_recusa: 'Segunda recusa concorrente' });

    liberarLock();
    const [r1, r2] = await Promise.all([p1, p2]);

    const statusOrdenados = [r1.status, r2.status].sort();
    expect(statusOrdenados).toEqual([200, 409]);
    expect(model.recusar).toHaveBeenCalledTimes(1);
    expect(auditoriaModel.registrar).toHaveBeenCalledTimes(1);
  });

  it('expõe o motivo_recusa no detalhe para perfil autorizado e bloqueia terceiros com 403', async () => {
    vi.mocked(model.buscarPorId).mockResolvedValue(recusada);

    autenticarComo(PERFIS.GESTOR_SVO);
    const detalheAutorizado = await request(app).get('/api/solicitacoes-svo/7').set('Authorization', token);
    expect(detalheAutorizado.status).toBe(200);
    expect(detalheAutorizado.body.status).toBe('RECUSADA');
    expect(detalheAutorizado.body.motivo_recusa).toBe('Caso de causa externa encaminhado ao IML');

    autenticarComo(PERFIS.SOLICITANTE);
    const detalheTerceiro = await request(app).get('/api/solicitacoes-svo/7').set('Authorization', token);
    expect(detalheTerceiro.status).toBe(403);
    expect(detalheTerceiro.body.motivo_recusa).toBeUndefined();
  });

  it('propaga falha da auditoria para abortar a transação de recusa', async () => {
    const erro = new Error('Falha na auditoria da recusa');
    vi.mocked(auditoriaModel.registrar).mockRejectedValue(erro);

    await expect(service.recusar(7, 'Motivo válido', autor)).rejects.toBe(erro);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(model.recusar).toHaveBeenCalledWith(7, 'Motivo válido', trx);
  });
});

describe('BL27 — proteção da API', () => {
  const endpoints = [
    ['get', '/api/solicitacoes-svo'], ['get', '/api/solicitacoes-svo/7'],
    ['patch', '/api/solicitacoes-svo/7/confirmar'], ['patch', '/api/solicitacoes-svo/7/recusar'],
  ] as const;

  it.each(endpoints)('%s %s exige autenticação', async (metodo, url) => {
    expect((await request(app)[metodo](url)).status).toBe(401);
    expect(model.buscarPorId).not.toHaveBeenCalled();
  });

  it.each([PERFIS.SOLICITANTE, PERFIS.GESTOR_FROTA, PERFIS.MOTORISTA_FROTA, PERFIS.MOTORISTA_SVO])(
    'bloqueia %s nas ações SVO', async (perfil) => {
      autenticarComo(perfil);
      for (const [metodo, url] of endpoints) {
        const req = request(app)[metodo](url).set('Authorization', token);
        const res = url.endsWith('/recusar') ? await req.send({ motivo_recusa: 'Motivo' }) : await req;
        expect(res.status).toBe(403);
      }
      await expect(service.confirmar(7, { id: 1, perfil })).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.recusar(7, 'Motivo', { id: 1, perfil })).rejects.toMatchObject({ statusCode: 403 });
      expect(transaction).not.toHaveBeenCalled();
      expect(model.listar).not.toHaveBeenCalled();
    },
  );

  it.each(['abc', '0', '-1', '1.5'])('rejeita ID inválido %s', async (id) => {
    for (const [metodo, url] of endpoints.slice(1)) {
      const req = request(app)[metodo](url.replace('/7', `/${id}`)).set('Authorization', token);
      const resposta = url.endsWith('/recusar') ? await req.send({ motivo_recusa: 'Motivo' }) : await req;
      expect(resposta.status).toBe(400);
    }
    expect(model.buscarPorId).not.toHaveBeenCalled();
    expect(model.buscarParaAtualizar).not.toHaveBeenCalled();
  });
});