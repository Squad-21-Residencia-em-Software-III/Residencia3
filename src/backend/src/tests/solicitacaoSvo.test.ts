import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { PERFIS, type Perfil } from '../constants/perfis';

const { trx, transaction } = vi.hoisted(() => {
  const trx = {};
  return { trx, transaction: vi.fn(async (callback: (conn: unknown) => unknown) => callback(trx)) };
});
vi.mock('../config/database', () => ({ db: { transaction } }));
vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn() } }));
vi.mock('../models/solicitacaoSvoModel', () => ({
  solicitacaoSvoModel: {
    listar: vi.fn(), buscarPorId: vi.fn(), buscarParaAtualizar: vi.fn(),
    buscarOrdemAtiva: vi.fn(), confirmar: vi.fn(), gerarOrdem: vi.fn(),
  },
}));

import { app } from '../app';
import { authService } from '../services/authService';
import { solicitacaoSvoModel as model } from '../models/solicitacaoSvoModel';
import { auditoriaModel } from '../models/auditoriaModel';
import { solicitacaoSvoService as service } from '../services/solicitacaoSvoService';

// Mantém o service real nas requisições: cobre autorização, validação e estados.
vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() }, MODULOS_AUDITORIA: { SVO: 'SVO' },
}));

const autor = { id: 4, perfil: PERFIS.GESTOR_SVO };
const solicitacao = {
  id: 7, registrante_id: 2, dados_solicitante: 'Hospital', local_ocorrencia: 'Aracaju',
  material_sensivel: false, status: 'EM_TRIAGEM' as const, confirmado_por: null, confirmado_em: null,
};
const confirmada = { ...solicitacao, status: 'CONFIRMADA' as const, confirmado_por: 4, confirmado_em: new Date() };
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
  vi.mocked(model.gerarOrdem).mockResolvedValue(ordem);
  vi.mocked(model.listar).mockResolvedValue({ dados: [solicitacao], total: 1 });
});

describe('BL27 — análise SVO', () => {
  it('usa paginação padrão e aceita listagem vazia', async () => {
    vi.mocked(model.listar).mockResolvedValue({ dados: [], total: 0 });
    const resposta = await request(app).get('/api/solicitacoes-svo').set('Authorization', token);
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({
      dados: [], paginacao: { pagina: 1, limite: 20, total: 0, totalPaginas: 0 },
    });
    expect(model.listar).toHaveBeenCalledWith({ pagina: 1, limite: 20 });
  });

  it('lista solicitações para triagem, com filtro e paginação', async () => {
    const resposta = await request(app).get('/api/solicitacoes-svo?status=EM_TRIAGEM&pagina=2&limite=10')
      .set('Authorization', token);
    expect(resposta.status).toBe(200);
    expect(resposta.body.paginacao).toEqual({ pagina: 2, limite: 10, total: 1, totalPaginas: 1 });
    expect(model.listar).toHaveBeenCalledWith({ status: 'EM_TRIAGEM', pagina: 2, limite: 10 });
  });

  it('expõe os dados da ocorrência e a ordem atual para análise', async () => {
    const resposta = await request(app).get('/api/solicitacoes-svo/7').set('Authorization', token);
    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ solicitacao, ordem: null });
    vi.mocked(model.buscarPorId).mockResolvedValue(confirmada);
    vi.mocked(model.buscarOrdemAtiva).mockResolvedValue(ordem);
    const confirmadaResposta = await request(app).get('/api/solicitacoes-svo/7').set('Authorization', token);
    expect(confirmadaResposta.body.ordem.id).toBe(11);
  });

  it.each(['status=INVALIDO', 'pagina=0', 'pagina=1.5', 'limite=0', 'limite=101', 'limite=abc', 'campo=indevido'])(
    'rejeita filtros inválidos: %s', async (query) => {
      const resposta = await request(app).get(`/api/solicitacoes-svo?${query}`).set('Authorization', token);
      expect(resposta.status).toBe(400);
      expect(model.listar).not.toHaveBeenCalled();
    },
  );
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
      usuario_id: 4, modulo: 'SVO', acao: expect.stringContaining('GEROU_ORDEM_COLETA id=11'),
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

  it.each(['CANCELADA', 'CONCLUIDA'] as const)('rejeita confirmação de solicitação %s', async (status) => {
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

describe('BL27 — proteção da API', () => {
  const endpoints = [
    ['get', '/api/solicitacoes-svo'], ['get', '/api/solicitacoes-svo/7'],
    ['patch', '/api/solicitacoes-svo/7/confirmar'],
  ] as const;

  it.each(endpoints)('%s %s exige autenticação', async (metodo, url) => {
    expect((await request(app)[metodo](url)).status).toBe(401);
    expect(model.buscarPorId).not.toHaveBeenCalled();
  });

  it.each([PERFIS.SOLICITANTE, PERFIS.GESTOR_FROTA, PERFIS.MOTORISTA_FROTA, PERFIS.MOTORISTA_SVO])(
    'bloqueia %s nas três ações', async (perfil) => {
      autenticarComo(perfil);
      for (const [metodo, url] of endpoints) {
        expect((await request(app)[metodo](url).set('Authorization', token)).status).toBe(403);
      }
      await expect(service.confirmar(7, { id: 1, perfil })).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.detalhar(7, { id: 1, perfil })).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.listar({ pagina: 1, limite: 20 }, { id: 1, perfil })).rejects.toMatchObject({ statusCode: 403 });
      expect(transaction).not.toHaveBeenCalled();
      expect(model.listar).not.toHaveBeenCalled();
    },
  );

  it.each(['abc', '0', '-1', '1.5'])('rejeita ID inválido %s', async (id) => {
    for (const [metodo, url] of endpoints.slice(1)) {
      const resposta = await request(app)[metodo](url.replace('/7', `/${id}`)).set('Authorization', token);
      expect(resposta.status).toBe(400);
    }
    expect(model.buscarPorId).not.toHaveBeenCalled();
    expect(model.buscarParaAtualizar).not.toHaveBeenCalled();
  });
});
