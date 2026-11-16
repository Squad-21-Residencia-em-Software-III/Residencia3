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

  it('sem a consulta do backend, as pendentes vêm das solicitações SVO confirmadas (todas as páginas)', async () => {
    const pagina = (n: number, ids: number[]) => ({
      dados: ids.map((id) => ({
        id,
        local_ocorrencia: `Rua ${id}`,
        material_sensivel: false,
        confirmado_em: null,
      })),
      paginacao: { pagina: n, limite: 100, total: 3, totalPaginas: 2 },
    });
    req.mockResolvedValueOnce(pagina(1, [1, 2])).mockResolvedValueOnce(pagina(2, [3]));

    const pendentes = await viagensApi.listarOrdensPendentesSvo();

    expect(req).toHaveBeenCalledWith('GET', '/solicitacoes-svo', {
      query: { pagina: 1, limite: 100, status: 'CONFIRMADA' },
    });
    expect(pendentes.map((p) => p.solicitacao_id)).toEqual([1, 2, 3]);
    expect(pendentes[0]).toMatchObject({ ordem_id: null, local_ocorrencia: 'Rua 1' });
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
