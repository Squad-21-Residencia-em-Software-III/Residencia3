import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECURSOS_BACKEND } from '../../config/recursosBackend';
import { request } from './http';
import { viagensApi } from './viagensApi';

vi.mock('./http', () => ({ request: vi.fn() }));

const req = vi.mocked(request);

describe('viagensApi (SCRUM-171/172)', () => {
  beforeEach(() => {
    req.mockReset();
  });

  afterEach(() => {
    RECURSOS_BACKEND.agendamentoTemporalSvo = false;
    RECURSOS_BACKEND.ordensPendentesSvo = false;
  });

  it('percorre as páginas das viagens próprias e adapta o DTO reduzido', async () => {
    req.mockResolvedValueOnce({
      dados: [{ id: 7, solicitacao_id: 9, tipo_operacao: 'ADMINISTRATIVA', destino: 'Hospital', status: 'AGENDADA' }],
      paginacao: { pagina: 1, totalPaginas: 2 },
    }).mockResolvedValueOnce({
      dados: [{ id: 8, solicitacao_id: 10, tipo_operacao: 'ADMINISTRATIVA', destino: 'Unidade', status: 'CONCLUIDA' }],
      paginacao: { pagina: 2, totalPaginas: 2 },
    });
    const resultado = await viagensApi.listarMinhasAdministrativas();
    expect(resultado.map((v) => v.id)).toEqual([7, 8]);
    expect(resultado[0]).toMatchObject({ motorista_nome: '', km_inicial: null });
    expect(req).toHaveBeenNthCalledWith(2, 'GET', '/viagens/minhas', { query: { pagina: 2, limite: 100 } });
  });

  it('propaga erro ao consultar páginas das viagens próprias', async () => {
    req.mockResolvedValueOnce({ dados: [], paginacao: { pagina: 1, totalPaginas: 2 } })
      .mockRejectedValueOnce(new Error('Falha na segunda página'));
    await expect(viagensApi.listarMinhasAdministrativas()).rejects.toThrow('Falha na segunda página');
  });

  it('envia reprogramação para a ordem específica com o desafio recebido', async () => {
    req.mockResolvedValue({});
    await viagensApi.reprogramarColetaSvo(9, {
      solicitacao_id: 31, veiculo_id: 2, motorista_id: 5,
      inicio_previsto: '2099-01-01T16:10:00Z', fim_previsto: '2099-01-01T17:10:00Z',
      confirmar_intervalo_reduzido: true, token_confirmacao: 'desafio',
    });
    expect(req).toHaveBeenCalledWith('POST', '/viagens/ordens-svo/9/reprogramar', {
      body: expect.objectContaining({ tipo_operacao: 'SVO', confirmar_intervalo_reduzido: true, token_confirmacao: 'desafio' }),
    });
  });

  it('sem o agendamento temporal, não envia campos que o servidor ignoraria', async () => {
    req.mockResolvedValue({});
    await viagensApi.agendarColetaSvo({
      solicitacao_id: 31,
      veiculo_id: 2,
      motorista_id: 5,
      inicio_previsto: '2026-11-17T17:00:00.000Z',
      fim_previsto: '2026-11-17T19:00:00.000Z',
    });

    expect(req).toHaveBeenCalledWith('POST', '/viagens', {
      body: { tipo_operacao: 'SVO', solicitacao_id: 31, veiculo_id: 2, motorista_id: 5 },
    });
  });

  it('com o agendamento temporal, envia período e confirmação', async () => {
    RECURSOS_BACKEND.agendamentoTemporalSvo = true;
    req.mockResolvedValue({});
    await viagensApi.agendarColetaSvo({
      solicitacao_id: 31,
      veiculo_id: 2,
      motorista_id: 5,
      inicio_previsto: '2026-11-17T17:00:00.000Z',
      fim_previsto: '2026-11-17T19:00:00.000Z',
      confirmar_intervalo_reduzido: true,
    });

    expect(req.mock.calls[0][2]).toEqual({
      body: {
        tipo_operacao: 'SVO',
        solicitacao_id: 31,
        veiculo_id: 2,
        motorista_id: 5,
        inicio_previsto: '2026-11-17T17:00:00.000Z',
        fim_previsto: '2026-11-17T19:00:00.000Z',
        confirmar_intervalo_reduzido: true,
      },
    });
  });

  it('consulta o estado real e preserva o id da ordem, sem incluir alocadas', async () => {
    req.mockImplementation(async (_metodo, url) => {
      if (url === '/solicitacoes-svo') return { dados: [1, 2, 3, 4, 5, 6].map((id) => ({ id })), paginacao: { pagina: 1, total: 6, totalPaginas: 1 } } as never;
      const id = Number(url.split('/').pop());
      return { id, status: 'CONFIRMADA', local_ocorrencia: `Rua ${id}`, material_sensivel: false,
        ordem: { id: id === 1 ? 2 : id + 40, solicitacao_id: id === 6 ? 1 : id, status: ['AGUARDANDO_ALOCACAO', 'ALOCADA', 'EM_DESLOCAMENTO', 'CONCLUIDA', 'CANCELADA', 'AGUARDANDO_ALOCACAO'][id - 1] } } as never;
    });
    const pendentes = await viagensApi.listarOrdensPendentesSvo();
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0]).toMatchObject({ ordem_id: 2, solicitacao_id: 1 });
  });

  it('propaga erro parcial em vez de apresentar lista incompleta', async () => {
    req.mockResolvedValueOnce({ dados: [{ id: 1 }], paginacao: { total: 1, totalPaginas: 1 } } as never)
      .mockRejectedValueOnce(new Error('Falha no detalhe'));
    await expect(viagensApi.listarOrdensPendentesSvo()).rejects.toThrow('Falha no detalhe');
  });

  it('não consulta detalhes em volume acima do limite seguro', async () => {
    req.mockResolvedValueOnce({ dados: [], paginacao: { total: 101, totalPaginas: 2 } } as never);
    await expect(viagensApi.listarOrdensPendentesSvo()).rejects.toThrow('SCRUM-182');
    expect(req).toHaveBeenCalledTimes(1);
  });

  it('com a consulta do backend, usa a listagem de ordens pendentes', async () => {
    RECURSOS_BACKEND.ordensPendentesSvo = true;
    req.mockResolvedValueOnce({
      dados: [{ ordem_id: 40, solicitacao_id: 31 }],
      paginacao: { pagina: 1, totalPaginas: 1 },
    });

    const pendentes = await viagensApi.listarOrdensPendentesSvo();

    expect(req).toHaveBeenCalledWith('GET', '/viagens/ordens-svo/pendentes', {
      query: { pagina: 1, limite: 100 },
    });
    expect(pendentes[0].ordem_id).toBe(40);
  });
});
