import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { PERFIS, type Perfil } from '../constants/perfis';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    transaction: vi.fn(async (callback: Function) => callback('trx')),
  },
}));

vi.mock('../config/database', () => ({
  db: mockDb,
}));

vi.mock('../models/solicitacaoViagemModel', () => ({
  solicitacaoViagemModel: {
    buscarParaAtualizar: vi.fn(),
    atualizarStatus: vi.fn(
      async (id: number, status: string, _trx?: unknown, motivo_recusa?: string | null) => ({
        id,
        status,
        ...(motivo_recusa ? { motivo_recusa } : {}),
      })
    ),
  },
}));

vi.mock('../models/auditoriaModel', () => ({
  auditoriaModel: { registrar: vi.fn() },
  MODULOS_AUDITORIA: { SOLICITACOES_VIAGEM: 'SOLICITACOES_VIAGEM' },
}));

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

import { app } from '../app';
import { authService } from '../services/authService';
import { solicitacaoViagemService } from '../services/solicitacaoViagemService';
import { solicitacaoViagemModel } from '../models/solicitacaoViagemModel';
import { auditoriaModel } from '../models/auditoriaModel';

const pendente = {
  id: 1,
  status: 'PENDENTE_APROVACAO',
  data_saida_desejada: '2099-12-10T08:00:00',
};

const autenticarComo = (perfil: Perfil) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id: 3,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockResolvedValue(
    pendente as Awaited<ReturnType<typeof solicitacaoViagemModel.buscarParaAtualizar>>
  );
  autenticarComo(PERFIS.GESTOR_FROTA);
});

describe('solicitacaoViagemService.aprovar / recusar', () => {
  it('deve aprovar solicitação pendente e registrar auditoria', async () => {
    await expect(solicitacaoViagemService.aprovar(1, 3)).resolves.toEqual({ id: 1, status: 'APROVADA' });

    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'APROVOU_SOLICITACAO_VIAGEM id=1' }),
      'trx'
    );
  });

  it('deve recusar registrando o motivo na solicitação e na auditoria', async () => {
    await expect(solicitacaoViagemService.recusar(1, 3, 'Sem veículo')).resolves.toEqual({
      id: 1,
      status: 'RECUSADA',
      motivo_recusa: 'Sem veículo',
    });

    expect(solicitacaoViagemModel.atualizarStatus).toHaveBeenCalledWith(1, 'RECUSADA', 'trx', 'Sem veículo');
    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'RECUSOU_SOLICITACAO_VIAGEM id=1 motivo="Sem veículo"' }),
      'trx'
    );
  });

  it('deve rejeitar solicitação inexistente', async () => {
    vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockResolvedValue(undefined);

    await expect(solicitacaoViagemService.aprovar(1, 3)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deve rejeitar solicitação que já foi analisada', async () => {
    vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockResolvedValue({
      ...pendente,
      status: 'RECUSADA',
    } as Awaited<ReturnType<typeof solicitacaoViagemModel.buscarParaAtualizar>>);

    await expect(solicitacaoViagemService.aprovar(1, 3)).rejects.toMatchObject({ statusCode: 400 });
    expect(solicitacaoViagemModel.atualizarStatus).not.toHaveBeenCalled();
  });

  it('não deve aprovar solicitação com saída no passado', async () => {
    vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockResolvedValue({
      ...pendente,
      data_saida_desejada: '2020-01-01T08:00:00',
    } as Awaited<ReturnType<typeof solicitacaoViagemModel.buscarParaAtualizar>>);

    await expect(solicitacaoViagemService.aprovar(1, 3)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('deve permitir recusar solicitação com saída no passado', async () => {
    vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockResolvedValue({
      ...pendente,
      data_saida_desejada: '2020-01-01T08:00:00',
    } as Awaited<ReturnType<typeof solicitacaoViagemModel.buscarParaAtualizar>>);

    await expect(solicitacaoViagemService.recusar(1, 3)).resolves.toMatchObject({ status: 'RECUSADA' });
  });
});

describe('PATCH /api/solicitacoes-viagem/:id/aprovar e /recusar', () => {
  const token = 'Bearer token-teste';

  it('deve aprovar como Gestor de Frota', async () => {
    const resposta = await request(app).patch('/api/solicitacoes-viagem/1/aprovar').set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ id: 1, status: 'APROVADA' });
  });

  it('deve retornar 403 para o solicitante', async () => {
    autenticarComo(PERFIS.SOLICITANTE);

    const resposta = await request(app).patch('/api/solicitacoes-viagem/1/aprovar').set('Authorization', token);

    expect(resposta.status).toBe(403);
  });

  it('deve recusar sem corpo', async () => {
    const resposta = await request(app).patch('/api/solicitacoes-viagem/1/recusar').set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.body.status).toBe('RECUSADA');
  });

  it('deve retornar 400 para motivo longo demais', async () => {
    const resposta = await request(app)
      .patch('/api/solicitacoes-viagem/1/recusar')
      .set('Authorization', token)
      .send({ motivo: 'x'.repeat(201) });

    expect(resposta.status).toBe(400);
  });

  it('deve retornar 400 para ID inválido', async () => {
    const resposta = await request(app).patch('/api/solicitacoes-viagem/abc/aprovar').set('Authorization', token);

    expect(resposta.status).toBe(400);
  });
});