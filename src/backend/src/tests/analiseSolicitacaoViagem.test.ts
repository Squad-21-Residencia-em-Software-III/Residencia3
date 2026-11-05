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
    listar: vi.fn(async () => ({ dados: [], total: 0 })),
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

vi.mock('../models/unidadeModel', () => ({
  unidadeModel: {
    estaAssociado: vi.fn(async () => false),
    idsDasUnidadesDoGestor: vi.fn(async () => []),
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
import { unidadeModel } from '../models/unidadeModel';
import { auditoriaModel } from '../models/auditoriaModel';

const UNIDADE_SVO = 1;
const UNIDADE_HEMOSE = 2;

const pendente = {
  id: 1,
  unidade_id: UNIDADE_HEMOSE,
  status: 'PENDENTE_APROVACAO',
  data_saida_desejada: '2099-12-10T08:00:00',
};

const gestorFrota = { id: 3, perfil: PERFIS.GESTOR_FROTA };
const gestorSvo = { id: 4, perfil: PERFIS.GESTOR_SVO };

const solicitacaoNoBanco = (alteracoes: Record<string, unknown>) =>
  vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockResolvedValue({
    ...pendente,
    ...alteracoes,
  } as Awaited<ReturnType<typeof solicitacaoViagemModel.buscarParaAtualizar>>);

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
    await expect(solicitacaoViagemService.aprovar(1, gestorFrota)).resolves.toEqual({ id: 1, status: 'APROVADA' });

    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ acao: 'APROVOU_SOLICITACAO_VIAGEM id=1' }),
      'trx'
    );
  });

  it('deve recusar registrando o motivo na solicitação e na auditoria', async () => {
    await expect(solicitacaoViagemService.recusar(1, gestorFrota, 'Sem veículo')).resolves.toEqual({
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

    await expect(solicitacaoViagemService.aprovar(1, gestorFrota)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deve rejeitar solicitação que já foi analisada', async () => {
    vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockResolvedValue({
      ...pendente,
      status: 'RECUSADA',
    } as Awaited<ReturnType<typeof solicitacaoViagemModel.buscarParaAtualizar>>);

    await expect(solicitacaoViagemService.aprovar(1, gestorFrota)).rejects.toMatchObject({ statusCode: 400 });
    expect(solicitacaoViagemModel.atualizarStatus).not.toHaveBeenCalled();
  });

  it('não deve aprovar solicitação com saída no passado', async () => {
    vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockResolvedValue({
      ...pendente,
      data_saida_desejada: '2020-01-01T08:00:00',
    } as Awaited<ReturnType<typeof solicitacaoViagemModel.buscarParaAtualizar>>);

    await expect(solicitacaoViagemService.aprovar(1, gestorFrota)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('deve permitir recusar solicitação com saída no passado', async () => {
    vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockResolvedValue({
      ...pendente,
      data_saida_desejada: '2020-01-01T08:00:00',
    } as Awaited<ReturnType<typeof solicitacaoViagemModel.buscarParaAtualizar>>);

    await expect(solicitacaoViagemService.recusar(1, gestorFrota)).resolves.toMatchObject({ status: 'RECUSADA' });
  });
});

describe('Análise conforme a unidade da solicitação', () => {
  it('Gestor de Frota analisa qualquer unidade sem precisar de associação', async () => {
    await expect(solicitacaoViagemService.aprovar(1, gestorFrota)).resolves.toMatchObject({ status: 'APROVADA' });
    expect(unidadeModel.estaAssociado).not.toHaveBeenCalled();
  });

  it('Administrador analisa solicitação sem unidade (anterior à regra)', async () => {
    solicitacaoNoBanco({ unidade_id: null });

    await expect(
      solicitacaoViagemService.aprovar(1, { id: 9, perfil: PERFIS.ADMINISTRADOR })
    ).resolves.toMatchObject({ status: 'APROVADA' });
  });

  it('Gestor SVO associado à unidade SVO aprova solicitação do SVO', async () => {
    solicitacaoNoBanco({ unidade_id: UNIDADE_SVO });
    vi.mocked(unidadeModel.estaAssociado).mockResolvedValueOnce(true);

    await expect(solicitacaoViagemService.aprovar(1, gestorSvo)).resolves.toMatchObject({ status: 'APROVADA' });
    expect(unidadeModel.estaAssociado).toHaveBeenCalledWith(UNIDADE_SVO, gestorSvo.id, 'trx');
  });

  it('Gestor SVO não associado recebe 403 mesmo na unidade SVO', async () => {
    solicitacaoNoBanco({ unidade_id: UNIDADE_SVO });

    await expect(solicitacaoViagemService.aprovar(1, gestorSvo)).rejects.toMatchObject({ statusCode: 403 });
    expect(solicitacaoViagemModel.atualizarStatus).not.toHaveBeenCalled();
  });

  it('Gestor SVO não analisa solicitação de outra unidade', async () => {
    await expect(solicitacaoViagemService.recusar(1, gestorSvo)).rejects.toMatchObject({ statusCode: 403 });
    expect(solicitacaoViagemModel.atualizarStatus).not.toHaveBeenCalled();
  });

  it('Gestor SVO não analisa solicitação sem unidade: ela fica com o Gestor de Frota', async () => {
    solicitacaoNoBanco({ unidade_id: null });

    await expect(solicitacaoViagemService.aprovar(1, gestorSvo)).rejects.toMatchObject({ statusCode: 403 });
    expect(unidadeModel.estaAssociado).not.toHaveBeenCalled();
  });
});

describe('solicitacaoViagemService.listar (encaminhamento)', () => {
  const primeiraPagina = { pagina: 1, limite: 20 };

  it('Gestor de Frota recebe as solicitações de todas as unidades', async () => {
    await solicitacaoViagemService.listar(gestorFrota, { ...primeiraPagina, status: 'PENDENTE_APROVACAO' });

    expect(solicitacaoViagemModel.listar).toHaveBeenCalledWith({ ...primeiraPagina, status: 'PENDENTE_APROVACAO' });
    expect(unidadeModel.idsDasUnidadesDoGestor).not.toHaveBeenCalled();
  });

  it('Gestor SVO recebe apenas as solicitações das unidades associadas', async () => {
    vi.mocked(unidadeModel.idsDasUnidadesDoGestor).mockResolvedValueOnce([UNIDADE_SVO]);

    await solicitacaoViagemService.listar(gestorSvo, primeiraPagina);

    expect(solicitacaoViagemModel.listar).toHaveBeenCalledWith({ ...primeiraPagina, unidadeIds: [UNIDADE_SVO] });
  });

  it('Gestor SVO sem associação recebe página vazia', async () => {
    await expect(solicitacaoViagemService.listar(gestorSvo, primeiraPagina)).resolves.toEqual({
      dados: [],
      paginacao: { pagina: 1, limite: 20, total: 0, totalPaginas: 0 },
    });
    expect(solicitacaoViagemModel.listar).not.toHaveBeenCalled();
  });

  it('deve calcular o total de páginas', async () => {
    vi.mocked(solicitacaoViagemModel.listar).mockResolvedValueOnce({ dados: [], total: 45 });

    const resultado = await solicitacaoViagemService.listar(gestorFrota, { pagina: 2, limite: 20 });

    expect(resultado.paginacao).toEqual({ pagina: 2, limite: 20, total: 45, totalPaginas: 3 });
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

  it('deve retornar 403 para Gestor SVO fora da unidade', async () => {
    autenticarComo(PERFIS.GESTOR_SVO);

    const resposta = await request(app).patch('/api/solicitacoes-viagem/1/aprovar').set('Authorization', token);

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro).toBe('Você não é gestor da unidade desta solicitação');
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

describe('GET /api/solicitacoes-viagem', () => {
  const token = 'Bearer token-teste';

  it('deve listar filtrando pelo status com a paginação padrão', async () => {
    const resposta = await request(app)
      .get('/api/solicitacoes-viagem?status=PENDENTE_APROVACAO')
      .set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.body.paginacao).toEqual({ pagina: 1, limite: 20, total: 0, totalPaginas: 0 });
    expect(solicitacaoViagemModel.listar).toHaveBeenCalledWith({ pagina: 1, limite: 20, status: 'PENDENTE_APROVACAO' });
  });

  it('deve repassar página e limite informados', async () => {
    await request(app).get('/api/solicitacoes-viagem?pagina=3&limite=50').set('Authorization', token);

    expect(solicitacaoViagemModel.listar).toHaveBeenCalledWith({ pagina: 3, limite: 50 });
  });

  it('deve retornar 400 para status inválido', async () => {
    const resposta = await request(app).get('/api/solicitacoes-viagem?status=XYZ').set('Authorization', token);

    expect(resposta.status).toBe(400);
  });

  it('deve retornar 400 para limite acima de 100', async () => {
    const resposta = await request(app).get('/api/solicitacoes-viagem?limite=101').set('Authorization', token);

    expect(resposta.status).toBe(400);
    expect(solicitacaoViagemModel.listar).not.toHaveBeenCalled();
  });

  it('deve retornar 403 para o solicitante', async () => {
    autenticarComo(PERFIS.SOLICITANTE);

    const resposta = await request(app).get('/api/solicitacoes-viagem').set('Authorization', token);

    expect(resposta.status).toBe(403);
  });
});