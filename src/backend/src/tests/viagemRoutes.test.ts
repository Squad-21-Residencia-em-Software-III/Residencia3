
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { app } from '../app';
import { authService } from '../services/authService';
import { viagemService } from '../services/viagemService';
import { PERFIS, type Perfil } from '../constants/perfis';

vi.mock('../services/authService', () => ({
  authService: {
    usuarioDoToken: vi.fn(),
  },
}));

vi.mock('../services/viagemService', () => ({
  viagemService: {
    listar: vi.fn().mockResolvedValue([]),
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

  it('deve retornar 401 sem autenticação', async () => {
    const resposta = await request(app).get('/api/viagens');
    expect(resposta.status).toBe(401);
  });

  it('deve retornar 403 para o solicitante', async () => {
    autenticarComo(PERFIS.SOLICITANTE);

    const resposta = await request(app).get('/api/viagens').set('Authorization', token);

    expect(resposta.status).toBe(403);
    expect(viagemService.listar).not.toHaveBeenCalled();
  });

  it('GET /api/viagens deve listar pelo perfil do usuário', async () => {
    const resposta = await request(app).get('/api/viagens').set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(viagemService.listar).toHaveBeenCalledWith(PERFIS.GESTOR_FROTA);
  });

  it('POST /api/viagens deve criar viagem administrativa', async () => {
    const corpo = { tipo_operacao: 'ADMINISTRATIVA', solicitacao_id: 1, veiculo_id: 2, motorista_id: 3 };

    const resposta = await request(app).post('/api/viagens').set('Authorization', token).send(corpo);

    expect(resposta.status).toBe(201);
    expect(viagemService.criar).toHaveBeenCalledWith(corpo, expect.objectContaining({ id: 3 }));
  });

  it('POST /api/viagens deve alocar ordem SVO com capacidade padrão e retornar 200', async () => {
    autenticarComo(PERFIS.GESTOR_SVO);

    const resposta = await request(app)
      .post('/api/viagens')
      .set('Authorization', token)
      .send({ tipo_operacao: 'SVO', solicitacao_id: 1, veiculo_id: 2, motorista_id: 3 });

    expect(resposta.status).toBe(200);
    expect(viagemService.criar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo_operacao: 'SVO', capacidade_utilizada: 1 }),
      expect.anything()
    );
  });

  it('POST /api/viagens deve retornar 400 sem tipo de operação', async () => {
    const resposta = await request(app)
      .post('/api/viagens')
      .set('Authorization', token)
      .send({ solicitacao_id: 1, veiculo_id: 2, motorista_id: 3 });

    expect(resposta.status).toBe(400);
    expect(viagemService.criar).not.toHaveBeenCalled();
  });

  it('PATCH /api/viagens/:id/iniciar deve exigir km_inicial', async () => {
    const resposta = await request(app).patch('/api/viagens/5/iniciar').set('Authorization', token).send({});

    expect(resposta.status).toBe(400);
    expect(viagemService.iniciarViagem).not.toHaveBeenCalled();
  });

  it('PATCH /api/viagens/:id/iniciar deve usar viagem administrativa por padrão', async () => {
    const resposta = await request(app)
      .patch('/api/viagens/5/iniciar')
      .set('Authorization', token)
      .send({ km_inicial: 1000 });

    expect(resposta.status).toBe(200);
    expect(viagemService.iniciarViagem).toHaveBeenCalledWith('ADMINISTRATIVA', 5, 1000, expect.anything());
  });

  it('PATCH /api/viagens/:id/finalizar deve repassar o tipo informado', async () => {
    await request(app)
      .patch('/api/viagens/5/finalizar')
      .set('Authorization', token)
      .send({ tipo_operacao: 'SVO', km_final: 1050 });

    expect(viagemService.finalizarViagem).toHaveBeenCalledWith('SVO', 5, 1050, expect.anything());
  });

  it('PATCH /api/viagens/:id/cancelar deve aceitar requisição sem corpo', async () => {
    const resposta = await request(app).patch('/api/viagens/5/cancelar').set('Authorization', token);

    expect(resposta.status).toBe(200);
    expect(viagemService.cancelarViagem).toHaveBeenCalledWith('ADMINISTRATIVA', 5, expect.anything(), false);
  });

  it('PATCH /api/viagens/:id/cancelar deve repassar o cancelamento da solicitação', async () => {
    await request(app)
      .patch('/api/viagens/5/cancelar')
      .set('Authorization', token)
      .send({ cancelar_solicitacao: true });

    expect(viagemService.cancelarViagem).toHaveBeenCalledWith('ADMINISTRATIVA', 5, expect.anything(), true);
  });

  it('deve retornar 400 para ID inválido', async () => {
    const resposta = await request(app).patch('/api/viagens/abc/cancelar').set('Authorization', token);

    expect(resposta.status).toBe(400);
    expect(viagemService.cancelarViagem).not.toHaveBeenCalled();
  });
});
