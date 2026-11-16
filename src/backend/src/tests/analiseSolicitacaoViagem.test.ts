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
    listarDoSolicitante: vi.fn(async () => ({ dados: [], total: 0 })),
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
  solicitante_id: 10,
  unidade_id: UNIDADE_HEMOSE,
  status: 'PENDENTE_APROVACAO',
  data_saida_desejada: '2099-12-10T08:00:00',
};

const administrador = { id: 9, perfil: PERFIS.ADMINISTRADOR };
const gestorFrota = { id: 3, perfil: PERFIS.GESTOR_FROTA };
const gestorSvo = { id: 4, perfil: PERFIS.GESTOR_SVO };

const solicitacaoNoBanco = (alteracoes: Record<string, unknown>) =>
  vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockResolvedValue({
    ...pendente,
    ...alteracoes,
  } as Awaited<ReturnType<typeof solicitacaoViagemModel.buscarParaAtualizar>>);

const autenticarComo = (perfil: Perfil, id = 3) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.transaction.mockImplementation(async (callback: Function) => callback('trx'));
  vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockResolvedValue(
    pendente as Awaited<ReturnType<typeof solicitacaoViagemModel.buscarParaAtualizar>>
  );
  vi.mocked(solicitacaoViagemModel.atualizarStatus).mockImplementation(
    async (id: number, status: string, _trx?: unknown, motivo_recusa?: string | null) =>
      ({
        id,
        status,
        ...(motivo_recusa ? { motivo_recusa } : {}),
      }) as Awaited<ReturnType<typeof solicitacaoViagemModel.atualizarStatus>>
  );
  autenticarComo(PERFIS.GESTOR_FROTA);
});

describe('solicitacaoViagemService.aprovar / recusar', () => {
  it('deve aprovar solicitação pendente e registrar auditoria', async () => {
    await expect(solicitacaoViagemService.aprovar(1, gestorFrota)).resolves.toEqual({
      id: 1,
      status: 'APROVADA',
    });

    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario_id: gestorFrota.id,
        acao: 'APROVOU_SOLICITACAO_VIAGEM id=1',
      }),
      'trx'
    );
  });

  it('deve recusar registrando o motivo normalizado na solicitação e na auditoria', async () => {
    await expect(
      solicitacaoViagemService.recusar(1, gestorFrota, '  Sem veículo disponível  ')
    ).resolves.toEqual({
      id: 1,
      status: 'RECUSADA',
      motivo_recusa: 'Sem veículo disponível',
    });

    expect(solicitacaoViagemModel.atualizarStatus).toHaveBeenCalledWith(
      1,
      'RECUSADA',
      'trx',
      'Sem veículo disponível'
    );
    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario_id: gestorFrota.id,
        acao: 'RECUSOU_SOLICITACAO_VIAGEM id=1 motivo="Sem veículo disponível"',
      }),
      'trx'
    );
  });

  it('registra motivo de 200 caracteres completo na auditoria mesmo com id inteiro máximo', async () => {
    const id = 2147483647;
    const motivo = 'x'.repeat(200);

    await solicitacaoViagemService.recusar(id, gestorFrota, motivo);

    const acao = `RECUSOU_SOLICITACAO_VIAGEM id=${id} motivo="${motivo}"`;
    expect(acao.length).toBeLessThanOrEqual(255);
    expect(auditoriaModel.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ usuario_id: gestorFrota.id, acao }),
      'trx'
    );
  });

  it('deve rejeitar no service recusa com motivo vazio ou apenas espaços (400)', async () => {
    await expect(solicitacaoViagemService.recusar(1, gestorFrota, '')).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(solicitacaoViagemService.recusar(1, gestorFrota, '   \n\t  ')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(solicitacaoViagemModel.atualizarStatus).not.toHaveBeenCalled();
  });

  it('deve rejeitar solicitação inexistente (404)', async () => {
    vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockResolvedValue(undefined);

    await expect(solicitacaoViagemService.aprovar(1, gestorFrota)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      solicitacaoViagemService.recusar(1, gestorFrota, 'Motivo válido')
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('deve rejeitar aprovação ou recusa de solicitação que já foi analisada (400)', async () => {
    solicitacaoNoBanco({ status: 'APROVADA' });

    await expect(solicitacaoViagemService.aprovar(1, gestorFrota)).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      solicitacaoViagemService.recusar(1, gestorFrota, 'Tentativa tardia')
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(solicitacaoViagemModel.atualizarStatus).not.toHaveBeenCalled();
  });

  it('não deve aprovar solicitação com saída no passado (400)', async () => {
    solicitacaoNoBanco({ data_saida_desejada: '2020-01-01T08:00:00' });

    await expect(solicitacaoViagemService.aprovar(1, gestorFrota)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('deve permitir recusar solicitação com saída no passado mediante motivo válido', async () => {
    solicitacaoNoBanco({ data_saida_desejada: '2020-01-01T08:00:00' });

    await expect(
      solicitacaoViagemService.recusar(1, gestorFrota, 'Solicitação expirada sem análise prévia')
    ).resolves.toMatchObject({
      status: 'RECUSADA',
      motivo_recusa: 'Solicitação expirada sem análise prévia',
    });
  });

  it('deve manter consistência e auditoria única em duas recusas simultâneas', async () => {
    let estadoAtual = { ...pendente, motivo_recusa: null as string | null };
    let filaLock = Promise.resolve();

    // Simula o isolamento transacional (FOR UPDATE) do banco entre requisições concorrentes
    mockDb.transaction.mockImplementation(async (callback: Function) => {
      const anterior = filaLock;
      let liberar!: () => void;
      filaLock = new Promise<void>((resolve) => {
        liberar = resolve;
      });
      await anterior;
      try {
        return await callback('trx');
      } finally {
        liberar();
      }
    });

    vi.mocked(solicitacaoViagemModel.buscarParaAtualizar).mockImplementation(
      async () =>
        ({ ...estadoAtual }) as unknown as Awaited<
          ReturnType<typeof solicitacaoViagemModel.buscarParaAtualizar>
        >
    );

    vi.mocked(solicitacaoViagemModel.atualizarStatus).mockImplementation(
      async (id, status, _trx, motivo_recusa) => {
        estadoAtual = {
          ...estadoAtual,
          status,
          motivo_recusa: motivo_recusa ?? null,
        };
        return {
          id,
          status,
          ...(motivo_recusa ? { motivo_recusa } : {}),
        } as unknown as Awaited<ReturnType<typeof solicitacaoViagemModel.atualizarStatus>>;
      }
    );

    const resultados = await Promise.allSettled([
      solicitacaoViagemService.recusar(1, gestorFrota, 'Motivo gestor frota'),
      solicitacaoViagemService.recusar(1, administrador, 'Motivo administrador'),
    ]);

    const aprovadas = resultados.filter((r) => r.status === 'fulfilled');
    const rejeitadas = resultados.filter((r) => r.status === 'rejected');

    expect(aprovadas).toHaveLength(1);
    expect(rejeitadas).toHaveLength(1);
    expect((rejeitadas[0] as PromiseRejectedResult).reason).toMatchObject({ statusCode: 400 });
    expect(estadoAtual.status).toBe('RECUSADA');
    expect(estadoAtual.motivo_recusa).toBe('Motivo gestor frota');
    expect(auditoriaModel.registrar).toHaveBeenCalledTimes(1);
  });
});

describe('Segregação de permissões administrativas (GESTOR_FROTA, ADMINISTRADOR e GESTOR_SVO)', () => {
  it('Gestor de Frota analisa qualquer unidade sem precisar de associação', async () => {
    await expect(solicitacaoViagemService.aprovar(1, gestorFrota)).resolves.toMatchObject({
      status: 'APROVADA',
    });
    expect(unidadeModel.estaAssociado).not.toHaveBeenCalled();
  });

  it('Administrador analisa solicitação de qualquer unidade ou sem unidade', async () => {
    solicitacaoNoBanco({ unidade_id: null });

    await expect(solicitacaoViagemService.aprovar(1, administrador)).resolves.toMatchObject({
      status: 'APROVADA',
    });
    await expect(
      solicitacaoViagemService.recusar(1, administrador, 'Dados insuficientes')
    ).resolves.toMatchObject({
      status: 'RECUSADA',
      motivo_recusa: 'Dados insuficientes',
    });
  });

  it('Gestor SVO associado à unidade SVO recebe 403 ao tentar aprovar ou recusar solicitação da própria unidade', async () => {
    solicitacaoNoBanco({ unidade_id: UNIDADE_SVO, solicitante_id: gestorSvo.id });
    vi.mocked(unidadeModel.estaAssociado).mockResolvedValue(true);

    await expect(solicitacaoViagemService.aprovar(1, gestorSvo)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      solicitacaoViagemService.recusar(1, gestorSvo, 'Tentativa de autoanálise')
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(solicitacaoViagemModel.atualizarStatus).not.toHaveBeenCalled();
    expect(auditoriaModel.registrar).not.toHaveBeenCalled();
  });

  it('Gestor SVO recebe 403 ao tentar analisar solicitação de terceiros ou de outra unidade', async () => {
    solicitacaoNoBanco({ unidade_id: UNIDADE_HEMOSE, solicitante_id: 99 });

    await expect(solicitacaoViagemService.aprovar(1, gestorSvo)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      solicitacaoViagemService.recusar(1, gestorSvo, 'Motivo não autorizado')
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(solicitacaoViagemModel.atualizarStatus).not.toHaveBeenCalled();
  });

  it('Gestor SVO recebe 403 ao tentar listar painel administrativo de análise', async () => {
    await expect(
      solicitacaoViagemService.listar(gestorSvo, { pagina: 1, limite: 20 })
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(solicitacaoViagemModel.listar).not.toHaveBeenCalled();
  });
});

describe('solicitacaoViagemService.listar (encaminhamento administrativo)', () => {
  const primeiraPagina = { pagina: 1, limite: 20 };

  it('Gestor de Frota recebe as solicitações de todas as unidades', async () => {
    await solicitacaoViagemService.listar(gestorFrota, {
      ...primeiraPagina,
      status: 'PENDENTE_APROVACAO',
    });

    expect(solicitacaoViagemModel.listar).toHaveBeenCalledWith({
      ...primeiraPagina,
      status: 'PENDENTE_APROVACAO',
    });
    expect(unidadeModel.idsDasUnidadesDoGestor).not.toHaveBeenCalled();
  });

  it('Administrador recebe as solicitações de todas as unidades', async () => {
    await solicitacaoViagemService.listar(administrador, primeiraPagina);

    expect(solicitacaoViagemModel.listar).toHaveBeenCalledWith(primeiraPagina);
  });

  it('deve calcular o total de páginas', async () => {
    vi.mocked(solicitacaoViagemModel.listar).mockResolvedValueOnce({ dados: [], total: 45 });

    const resultado = await solicitacaoViagemService.listar(gestorFrota, {
      pagina: 2,
      limite: 20,
    });

    expect(resultado.paginacao).toEqual({ pagina: 2, limite: 20, total: 45, totalPaginas: 3 });
  });
});

describe('PATCH /api/solicitacoes-viagem/:id/aprovar e /recusar (HTTP)', () => {
  const token = 'Bearer token-teste';

  it('deve aprovar como Gestor de Frota (200)', async () => {
    const resposta = await request(app)
      .patch('/api/solicitacoes-viagem/1/aprovar')
      .set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ id: 1, status: 'APROVADA' });
  });

  it('deve recusar com motivo válido de 1 caractere e de 200 caracteres (200)', async () => {
    const resp1 = await request(app)
      .patch('/api/solicitacoes-viagem/1/recusar')
      .set('Authorization', token)
      .send({ motivo: 'X' });

    expect(resp1.status).toBe(200);
    expect(resp1.body).toEqual({ id: 1, status: 'RECUSADA', motivo_recusa: 'X' });

    const motivo200 = 'a'.repeat(200);
    const resp200 = await request(app)
      .patch('/api/solicitacoes-viagem/1/recusar')
      .set('Authorization', token)
      .send({ motivo: motivo200 });

    expect(resp200.status).toBe(200);
    expect(resp200.body).toEqual({ id: 1, status: 'RECUSADA', motivo_recusa: motivo200 });
  });

  it('deve retornar 400 ao recusar sem body, com objeto vazio, string vazia ou apenas espaços', async () => {
    const semBody = await request(app)
      .patch('/api/solicitacoes-viagem/1/recusar')
      .set('Authorization', token);
    expect(semBody.status).toBe(400);

    const objVazio = await request(app)
      .patch('/api/solicitacoes-viagem/1/recusar')
      .set('Authorization', token)
      .send({});
    expect(objVazio.status).toBe(400);

    const strVazia = await request(app)
      .patch('/api/solicitacoes-viagem/1/recusar')
      .set('Authorization', token)
      .send({ motivo: '' });
    expect(strVazia.status).toBe(400);

    const apenasEspacos = await request(app)
      .patch('/api/solicitacoes-viagem/1/recusar')
      .set('Authorization', token)
      .send({ motivo: '     ' });
    expect(apenasEspacos.status).toBe(400);

    expect(solicitacaoViagemModel.atualizarStatus).not.toHaveBeenCalled();
  });

  it('deve retornar 400 para motivo com 201 caracteres', async () => {
    const resposta = await request(app)
      .patch('/api/solicitacoes-viagem/1/recusar')
      .set('Authorization', token)
      .send({ motivo: 'x'.repeat(201) });

    expect(resposta.status).toBe(400);
    expect(solicitacaoViagemModel.atualizarStatus).not.toHaveBeenCalled();
  });

  it('deve retornar 400 ao tentar recusar solicitação já aprovada', async () => {
    solicitacaoNoBanco({ status: 'APROVADA' });

    const resposta = await request(app)
      .patch('/api/solicitacoes-viagem/1/recusar')
      .set('Authorization', token)
      .send({ motivo: 'Motivo válido' });

    expect(resposta.status).toBe(400);
    expect(solicitacaoViagemModel.atualizarStatus).not.toHaveBeenCalled();
  });

  it('deve retornar 403 para o solicitante', async () => {
    autenticarComo(PERFIS.SOLICITANTE);

    const resposta = await request(app)
      .patch('/api/solicitacoes-viagem/1/aprovar')
      .set('Authorization', token);

    expect(resposta.status).toBe(403);
  });

  it('deve retornar 403 para Gestor SVO tanto na própria unidade quanto em outra unidade', async () => {
    autenticarComo(PERFIS.GESTOR_SVO, gestorSvo.id);
    solicitacaoNoBanco({ unidade_id: UNIDADE_SVO, solicitante_id: gestorSvo.id });

    const respAprovarPropria = await request(app)
      .patch('/api/solicitacoes-viagem/1/aprovar')
      .set('Authorization', token);
    expect(respAprovarPropria.status).toBe(403);

    const respRecusarPropria = await request(app)
      .patch('/api/solicitacoes-viagem/1/recusar')
      .set('Authorization', token)
      .send({ motivo: 'Motivo válido' });
    expect(respRecusarPropria.status).toBe(403);

    solicitacaoNoBanco({ unidade_id: UNIDADE_HEMOSE, solicitante_id: 99 });

    const respRecusarTerceiros = await request(app)
      .patch('/api/solicitacoes-viagem/1/recusar')
      .set('Authorization', token)
      .send({ motivo: 'Motivo válido' });
    expect(respRecusarTerceiros.status).toBe(403);

    expect(solicitacaoViagemModel.atualizarStatus).not.toHaveBeenCalled();
  });

  it('deve retornar 400 para ID inválido', async () => {
    const resposta = await request(app)
      .patch('/api/solicitacoes-viagem/abc/aprovar')
      .set('Authorization', token);

    expect(resposta.status).toBe(400);
  });
});

describe('GET /api/solicitacoes-viagem e /minhas', () => {
  const token = 'Bearer token-teste';

  it('deve listar filtrando pelo status com a paginação padrão', async () => {
    const resposta = await request(app)
      .get('/api/solicitacoes-viagem?status=PENDENTE_APROVACAO')
      .set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(resposta.body.paginacao).toEqual({ pagina: 1, limite: 20, total: 0, totalPaginas: 0 });
    expect(solicitacaoViagemModel.listar).toHaveBeenCalledWith({
      pagina: 1,
      limite: 20,
      status: 'PENDENTE_APROVACAO',
    });
  });

  it('deve repassar página e limite informados', async () => {
    await request(app).get('/api/solicitacoes-viagem?pagina=3&limite=50').set('Authorization', token);

    expect(solicitacaoViagemModel.listar).toHaveBeenCalledWith({ pagina: 3, limite: 50 });
  });

  it('deve retornar 400 para status inválido', async () => {
    const resposta = await request(app)
      .get('/api/solicitacoes-viagem?status=XYZ')
      .set('Authorization', token);

    expect(resposta.status).toBe(400);
  });

  it('deve retornar 400 para limite acima de 100', async () => {
    const resposta = await request(app)
      .get('/api/solicitacoes-viagem?limite=101')
      .set('Authorization', token);

    expect(resposta.status).toBe(400);
    expect(solicitacaoViagemModel.listar).not.toHaveBeenCalled();
  });

  it('deve retornar 403 para o solicitante e para Gestor SVO na listagem administrativa', async () => {
    autenticarComo(PERFIS.SOLICITANTE);
    const respSolicitante = await request(app)
      .get('/api/solicitacoes-viagem')
      .set('Authorization', token);
    expect(respSolicitante.status).toBe(403);

    autenticarComo(PERFIS.GESTOR_SVO, gestorSvo.id);
    const respGestorSvo = await request(app)
      .get('/api/solicitacoes-viagem')
      .set('Authorization', token);
    expect(respGestorSvo.status).toBe(403);
  });

  it('deve permitir ao Gestor SVO consultar suas próprias solicitações e o motivo de recusa em /minhas', async () => {
    autenticarComo(PERFIS.GESTOR_SVO, gestorSvo.id);
    vi.mocked(solicitacaoViagemModel.listarDoSolicitante).mockResolvedValueOnce({
      dados: [
        {
          id: 15,
          status: 'RECUSADA',
          motivo_recusa: 'Frota indisponível na data',
        } as Awaited<ReturnType<typeof solicitacaoViagemModel.listarDoSolicitante>>['dados'][number],
      ],
      total: 1,
    });

    const resposta = await request(app)
      .get('/api/solicitacoes-viagem/minhas')
      .set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(solicitacaoViagemModel.listarDoSolicitante).toHaveBeenCalledWith(gestorSvo.id, {
      pagina: 1,
      limite: 20,
    });
    expect(resposta.body.dados[0]).toMatchObject({
      id: 15,
      status: 'RECUSADA',
      motivo_recusa: 'Frota indisponível na data',
    });
  });
});
