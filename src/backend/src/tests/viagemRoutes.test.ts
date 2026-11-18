
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { app } from '../app';
import { authService } from '../services/authService';
import { viagemService } from '../services/viagemService';
import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { unidadeModel } from '../models/unidadeModel';

// Gestor SVO associado à unidade SVO (exigirAssociacaoSvo)
vi.mock('../models/unidadeModel', async (importOriginal) => {
  const original = await importOriginal<typeof import('../models/unidadeModel')>();
  return { ...original, unidadeModel: { ...original.unidadeModel, estaAssociadoPorNome: vi.fn(async () => true) } };
});

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/viagemService', () => ({
  viagemService: {
    listar: vi.fn().mockResolvedValue([]),
    listarMinhasAdministrativas: vi.fn().mockResolvedValue({ dados: [], paginacao: { pagina: 1, limite: 20, total: 0, totalPaginas: 0 } }),
    listarOrdensPendentesSvo: vi.fn().mockResolvedValue({ dados: [], paginacao: { pagina: 1, limite: 20, total: 0, totalPaginas: 0 } }),
    consultarAlertasSvo: vi.fn().mockResolvedValue([]),
    reprogramarOrdemSvo: vi.fn().mockResolvedValue({ id: 9 }),
    criar: vi.fn().mockResolvedValue({ id: 1 }),
    iniciarViagem: vi.fn().mockResolvedValue({ id: 1 }),
    finalizarViagem: vi.fn().mockResolvedValue({ id: 1 }),
    cancelarViagem: vi.fn().mockResolvedValue({ id: 1 }),
  },
}));

const autenticarComo = (perfil: Perfil) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({
    id: 3,
    perfil,
  } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

describe('Rotas de viagens', () => {
  const token = 'Bearer token-teste';

  beforeEach(() => {
    vi.clearAllMocks();
    autenticarComo(PERFIS.GESTOR_FROTA);
  });

  it.each([PERFIS.GESTOR_FROTA, PERFIS.SOLICITANTE, PERFIS.MOTORISTA_SVO])(
    'nega alertas e reprogramação SVO ao perfil %s', async (perfil) => {
      autenticarComo(perfil);
      const alertas = await request(app).get('/api/viagens/ordens-svo/alertas').set('Authorization', token);
      const reagendar = await request(app).post('/api/viagens/ordens-svo/9/reprogramar').set('Authorization', token).send({});
      expect(alertas.status).toBe(403);
      expect(reagendar.status).toBe(403);
      expect(viagemService.consultarAlertasSvo).not.toHaveBeenCalled();
      expect(viagemService.reprogramarOrdemSvo).not.toHaveBeenCalled();
    },
  );

  it('permite reprogramação SVO autenticada com período e impede dados administrativos', async () => {
    autenticarComo(PERFIS.GESTOR_SVO);
    const corpo = { tipo_operacao: 'SVO', solicitacao_id: 5, veiculo_id: 2, motorista_id: 3,
      inicio_previsto: '2099-11-20T14:00:00Z', fim_previsto: '2099-11-20T16:00:00Z' };
    const resultado = await request(app).post('/api/viagens/ordens-svo/9/reprogramar').set('Authorization', token).send(corpo);
    expect(resultado.status).toBe(200);
    expect(viagemService.reprogramarOrdemSvo).toHaveBeenCalledWith(9, expect.objectContaining(corpo), { id: 3, perfil: PERFIS.GESTOR_SVO });
    const administrativo = await request(app).post('/api/viagens/ordens-svo/9/reprogramar').set('Authorization', token)
      .send({ ...corpo, tipo_operacao: 'ADMINISTRATIVA' });
    expect(administrativo.status).toBe(400);
  });

  it('não aceita agendamento SVO sem período', async () => {
    autenticarComo(PERFIS.GESTOR_SVO);
    const resposta = await request(app).post('/api/viagens').set('Authorization', token)
      .send({ tipo_operacao: 'SVO', solicitacao_id: 1, veiculo_id: 2, motorista_id: 3 });
    expect(resposta.status).toBe(400);
    expect(viagemService.criar).not.toHaveBeenCalled();
  });

  it('consulta viagens próprias usando apenas a identidade autenticada', async () => {
    autenticarComo(PERFIS.GESTOR_SVO);
    const resposta = await request(app).get('/api/viagens/minhas?pagina=2&limite=10')
      .set('Authorization', token);
    expect(resposta.status).toBe(200);
    expect(viagemService.listarMinhasAdministrativas).toHaveBeenCalledWith(
      { id: 3, perfil: PERFIS.GESTOR_SVO }, 2, 10,
    );
  });

  it('permite consulta administrativa própria sem associação SVO, mas mantém restrição nas operações SVO', async () => {
    autenticarComo(PERFIS.GESTOR_SVO);
    vi.mocked(unidadeModel.estaAssociadoPorNome).mockResolvedValueOnce(false);
    const minhas = await request(app).get('/api/viagens/minhas').set('Authorization', token);
    const pendentes = await request(app).get('/api/viagens/ordens-svo/pendentes').set('Authorization', token);
    expect(minhas.status).toBe(200);
    expect(pendentes.status).toBe(403);
    expect(viagemService.listarMinhasAdministrativas).toHaveBeenCalledWith({ id: 3, perfil: PERFIS.GESTOR_SVO }, 1, 20);
  });

  it.each([PERFIS.ADMINISTRADOR, PERFIS.GESTOR_SVO])('permite %s consultar ordens pendentes paginadas', async (perfil) => {
    autenticarComo(perfil);
    const resposta = await request(app).get('/api/viagens/ordens-svo/pendentes?pagina=2&limite=10').set('Authorization', token);
    expect(resposta.status).toBe(200);
    expect(viagemService.listarOrdensPendentesSvo).toHaveBeenCalledWith({ id: 3, perfil }, 2, 10);
  });

  it.each([PERFIS.GESTOR_FROTA, PERFIS.SOLICITANTE, PERFIS.MOTORISTA_SVO])('nega ordens pendentes a %s', async (perfil) => {
    autenticarComo(perfil);
    const resposta = await request(app).get('/api/viagens/ordens-svo/pendentes').set('Authorization', token);
    expect(resposta.status).toBe(403);
    expect(viagemService.listarOrdensPendentesSvo).not.toHaveBeenCalled();
  });

  it('rejeita filtros arbitrários de usuário e paginação inválida', async () => {
    autenticarComo(PERFIS.GESTOR_SVO);
    for (const query of ['usuario_id=99', 'pagina=0', 'limite=101']) {
      const resposta = await request(app).get(`/api/viagens/minhas?${query}`)
        .set('Authorization', token);
      expect(resposta.status).toBe(400);
    }
    expect(viagemService.listarMinhasAdministrativas).not.toHaveBeenCalled();
  });

  it.each([PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.SOLICITANTE,
    PERFIS.MOTORISTA_FROTA, PERFIS.MOTORISTA_SVO])('bloqueia perfil %s na consulta própria', async (perfil) => {
    autenticarComo(perfil);
    const resposta = await request(app).get('/api/viagens/minhas').set('Authorization', token);
    expect(resposta.status).toBe(403);
    expect(viagemService.listarMinhasAdministrativas).not.toHaveBeenCalled();
  });

  it('deve retornar 401 sem autenticação', async () => {
    const resposta = await request(app).get('/api/viagens');

    expect(resposta.status).toBe(401);
  });

  it('deve retornar 403 para o solicitante', async () => {
    autenticarComo(PERFIS.SOLICITANTE);

    const resposta = await request(app)
      .get('/api/viagens')
      .set('Authorization', token);

    expect(resposta.status).toBe(403);
    expect(viagemService.listar).not.toHaveBeenCalled();
  });

  it('GET /api/viagens deve listar pelo perfil do usuário', async () => {
    const resposta = await request(app)
      .get('/api/viagens')
      .set('Authorization', token);

    expect(resposta.status).toBe(200);

    expect(viagemService.listar).toHaveBeenCalledWith({
      id: 3,
      perfil: PERFIS.GESTOR_FROTA,
    });
  });

  // NOVO TESTE 1
  it('deve permitir motorista da frota consultar suas viagens', async () => {
    autenticarComo(PERFIS.MOTORISTA_FROTA);

    const resposta = await request(app)
      .get('/api/viagens')
      .set('Authorization', token);

    expect(resposta.status).toBe(200);

    expect(viagemService.listar).toHaveBeenCalledWith({
      id: 3,
      perfil: PERFIS.MOTORISTA_FROTA,
    });
  });

  // NOVO TESTE 2
  it('deve permitir motorista SVO consultar suas ordens', async () => {
    autenticarComo(PERFIS.MOTORISTA_SVO);

    const resposta = await request(app)
      .get('/api/viagens')
      .set('Authorization', token);

    expect(resposta.status).toBe(200);

    expect(viagemService.listar).toHaveBeenCalledWith({
      id: 3,
      perfil: PERFIS.MOTORISTA_SVO,
    });
  });

  it('POST /api/viagens deve criar viagem administrativa', async () => {
    const corpo = {
      tipo_operacao: 'ADMINISTRATIVA',
      solicitacao_id: 1,
      veiculo_id: 2,
      motorista_id: 3,
    };

    const resposta = await request(app)
      .post('/api/viagens')
      .set('Authorization', token)
      .send(corpo);

    expect(resposta.status).toBe(201);

    expect(viagemService.criar).toHaveBeenCalledWith(
      corpo,
      expect.objectContaining({ id: 3 })
    );
  });

  it('POST /api/viagens deve alocar ordem SVO com capacidade padrão e retornar 200', async () => {
    autenticarComo(PERFIS.GESTOR_SVO);

    const resposta = await request(app)
      .post('/api/viagens')
      .set('Authorization', token)
      .send({
        tipo_operacao: 'SVO',
        solicitacao_id: 1,
        veiculo_id: 2,
        motorista_id: 3,
        inicio_previsto: '2099-11-20T14:00:00Z',
        fim_previsto: '2099-11-20T16:00:00Z',
      });

    expect(resposta.status).toBe(200);
    expect(viagemService.criar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo_operacao: 'SVO',
        capacidade_utilizada: 1,
      }),
      expect.anything()
    );
  });

  it('POST /api/viagens deve retornar 400 sem tipo de operação', async () => {
    const resposta = await request(app)
      .post('/api/viagens')
      .set('Authorization', token)
      .send({
        solicitacao_id: 1,
        veiculo_id: 2,
        motorista_id: 3,
      });

    expect(resposta.status).toBe(400);
    expect(viagemService.criar).not.toHaveBeenCalled();
  });

  it('PATCH /api/viagens/:id/iniciar deve exigir km_inicial', async () => {
    const resposta = await request(app)
      .patch('/api/viagens/5/iniciar')
      .set('Authorization', token)
      .send({});

    expect(resposta.status).toBe(400);
    expect(viagemService.iniciarViagem).not.toHaveBeenCalled();
  });

  it('PATCH /api/viagens/:id/iniciar deve usar viagem administrativa por padrão', async () => {
    const resposta = await request(app)
      .patch('/api/viagens/5/iniciar')
      .set('Authorization', token)
      .send({ km_inicial: 1000 });

    expect(resposta.status).toBe(200);

    expect(viagemService.iniciarViagem).toHaveBeenCalledWith(
      'ADMINISTRATIVA',
      5,
      1000,
      expect.anything(),
      undefined,
    );
  });

  // BL17: a quilometragem final é validada na API, não só na interface
  it.each([{}, { km_final: -1 }, { km_final: 1050.5 }, { km_final: '1050' }, { km_final: null }])(
    'PATCH /api/viagens/:id/finalizar deve rejeitar km_final inválido: %j',
    async (corpo) => {
      const resposta = await request(app).patch('/api/viagens/5/finalizar').set('Authorization', token).send(corpo);

      expect(resposta.status).toBe(400);
      expect(viagemService.finalizarViagem).not.toHaveBeenCalled();
    }
  );

  it('PATCH /api/viagens/:id/finalizar deve devolver o erro de km final menor que o inicial', async () => {
    vi.mocked(viagemService.finalizarViagem).mockRejectedValueOnce(
      new AppError('O km final não pode ser menor que o km inicial (1000)', 400)
    );

    const resposta = await request(app)
      .patch('/api/viagens/5/finalizar')
      .set('Authorization', token)
      .send({ km_final: 999 });

    expect(resposta.status).toBe(400);
    expect(resposta.body).toEqual({ erro: 'O km final não pode ser menor que o km inicial (1000)' });
  });

  it('PATCH /api/viagens/:id/finalizar deve repassar o tipo informado', async () => {
    await request(app)
      .patch('/api/viagens/5/finalizar')
      .set('Authorization', token)
      .send({
        tipo_operacao: 'SVO',
        km_final: 1050,
      });

    expect(viagemService.finalizarViagem).toHaveBeenCalledWith(
      'SVO',
      5,
      1050,
      expect.anything(),
      undefined,
    );
  });

  it('PATCH /api/viagens/:id/cancelar deve aceitar requisição sem corpo', async () => {
    const resposta = await request(app)
      .patch('/api/viagens/5/cancelar')
      .set('Authorization', token);

    expect(resposta.status).toBe(200);

    expect(viagemService.cancelarViagem).toHaveBeenCalledWith(
      'ADMINISTRATIVA',
      5,
      expect.anything(),
      false
    );
  });

  it('PATCH /api/viagens/:id/cancelar deve repassar o cancelamento da solicitação', async () => {
    await request(app)
      .patch('/api/viagens/5/cancelar')
      .set('Authorization', token)
      .send({ cancelar_solicitacao: true });

    expect(viagemService.cancelarViagem).toHaveBeenCalledWith(
      'ADMINISTRATIVA',
      5,
      expect.anything(),
      true
    );
  });

  it('deve retornar 400 para ID inválido', async () => {
    const resposta = await request(app)
      .patch('/api/viagens/abc/cancelar')
      .set('Authorization', token);

    expect(resposta.status).toBe(400);
    expect(viagemService.cancelarViagem).not.toHaveBeenCalled();
  });

  it('deve permitir que motorista da frota solicite o início da viagem', async () => {
    autenticarComo(PERFIS.MOTORISTA_FROTA);

    const resposta = await request(app)
      .patch('/api/viagens/5/iniciar')
      .set('Authorization', token)
      .send({
        tipo_operacao: 'ADMINISTRATIVA',
        km_inicial: 1000,
      });

    expect(resposta.status).toBe(200);

    expect(viagemService.iniciarViagem).toHaveBeenCalledWith(
      'ADMINISTRATIVA',
      5,
      1000,
      expect.objectContaining({
        id: 3,
        perfil: PERFIS.MOTORISTA_FROTA,
      }),
      undefined,
    );
  });

  // NOVO TESTE 3
  it('deve permitir motorista da frota solicitar a finalização da viagem', async () => {
    autenticarComo(PERFIS.MOTORISTA_FROTA);

    const resposta = await request(app)
      .patch('/api/viagens/5/finalizar')
      .set('Authorization', token)
      .send({
        tipo_operacao: 'ADMINISTRATIVA',
        km_final: 1050,
      });

    expect(resposta.status).toBe(200);

    expect(viagemService.finalizarViagem).toHaveBeenCalledWith(
      'ADMINISTRATIVA',
      5,
      1050,
      expect.objectContaining({
        id: 3,
        perfil: PERFIS.MOTORISTA_FROTA,
      }),
      undefined,
    );
  });

  // NOVO TESTE 4
  it('deve permitir motorista SVO solicitar a finalização da ordem', async () => {
    autenticarComo(PERFIS.MOTORISTA_SVO);

    const resposta = await request(app)
      .patch('/api/viagens/5/finalizar')
      .set('Authorization', token)
      .send({
        tipo_operacao: 'SVO',
        km_final: 1050,
      });

    expect(resposta.status).toBe(200);

    expect(viagemService.finalizarViagem).toHaveBeenCalledWith(
      'SVO',
      5,
      1050,
      expect.objectContaining({
        id: 3,
        perfil: PERFIS.MOTORISTA_SVO,
      }),
      undefined,
    );
  });

  it('deve impedir motorista de criar e cancelar viagens', async () => {
    autenticarComo(PERFIS.MOTORISTA_FROTA);

    const criacao = await request(app)
      .post('/api/viagens')
      .set('Authorization', token)
      .send({
        tipo_operacao: 'ADMINISTRATIVA',
        solicitacao_id: 1,
        veiculo_id: 2,
        motorista_id: 3,
      });

    const cancelamento = await request(app)
      .patch('/api/viagens/5/cancelar')
      .set('Authorization', token);

    expect(criacao.status).toBe(403);
    expect(cancelamento.status).toBe(403);

    expect(viagemService.criar).not.toHaveBeenCalled();
    expect(viagemService.cancelarViagem).not.toHaveBeenCalled();
  });
});
