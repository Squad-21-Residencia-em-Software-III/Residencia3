
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { app } from '../app';
import { AppError } from '../errors/AppError';
import { authService } from '../services/authService';
import { solicitacaoViagemService } from '../services/solicitacaoViagemService';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/solicitacaoViagemService', () => ({
  solicitacaoViagemService: {
    criar: vi.fn(),
  },
}));

describe('POST /api/solicitacoes-viagem', () => {
  const endpoint = '/api/solicitacoes-viagem';

  const dadosValidos = {
    origem: 'Aracaju',
    destino: 'Itabaiana',
    finalidade: 'Visita técnica institucional',
    data_saida_desejada: '2099-12-10T08:00:00-03:00',
    data_chegada_desejada: '2099-12-10T17:00:00-03:00',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(authService.usuarioDoToken).mockResolvedValue({
      id: 1,
    } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

    vi.mocked(solicitacaoViagemService.criar).mockResolvedValue({
      id: 10,
      solicitante_id: 1,
      ...dadosValidos,
      status: 'PENDENTE_APROVACAO',
    });
  });

  it('deve retornar 201 para uma solicitação válida', async () => {
    const resposta = await request(app)
      .post(endpoint)
      .set('Authorization', 'Bearer token-teste')
      .send(dadosValidos);

    expect(resposta.status).toBe(201);
    expect(resposta.body.status).toBe('PENDENTE_APROVACAO');

    expect(solicitacaoViagemService.criar).toHaveBeenCalledWith(
      dadosValidos,
      1
    );
  });

  it('deve retornar 400 quando faltar um campo obrigatório', async () => {
    const resposta = await request(app)
      .post(endpoint)
      .set('Authorization', 'Bearer token-teste')
      .send({
        ...dadosValidos,
        origem: '',
      });

    expect(resposta.status).toBe(400);

    expect(
      solicitacaoViagemService.criar
    ).not.toHaveBeenCalled();
  });

  it('deve retornar 400 quando a saída estiver no passado', async () => {
    vi.mocked(
      solicitacaoViagemService.criar
    ).mockRejectedValueOnce(
      new AppError('A data de saída deve ser futura', 400)
    );

    const resposta = await request(app)
      .post(endpoint)
      .set('Authorization', 'Bearer token-teste')
      .send({
        ...dadosValidos,
        data_saida_desejada: '2020-01-01T08:00:00-03:00',
      });

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro).toBe(
      'A data de saída deve ser futura'
    );
  });

  it('deve retornar 400 quando a chegada for anterior à saída', async () => {
    vi.mocked(
      solicitacaoViagemService.criar
    ).mockRejectedValueOnce(
      new AppError(
        'A data de chegada deve ser posterior à saída',
        400
      )
    );

    const resposta = await request(app)
      .post(endpoint)
      .set('Authorization', 'Bearer token-teste')
      .send({
        ...dadosValidos,
        data_chegada_desejada: '2099-12-09T17:00:00-03:00',
      });

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro).toBe(
      'A data de chegada deve ser posterior à saída'
    );
  });
});
