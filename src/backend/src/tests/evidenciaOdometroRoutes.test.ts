import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { authService } from '../services/authService';
import { definirArmazenamentoEvidencias, type ArmazenamentoEvidencias } from '../services/armazenamentoEvidencias';
import { evidenciaOdometroService } from '../services/evidenciaOdometroService';
import { viagemService } from '../services/viagemService';

vi.mock('../models/unidadeModel', async (importOriginal) => {
  const original = await importOriginal<typeof import('../models/unidadeModel')>();
  return { ...original, unidadeModel: { ...original.unidadeModel, estaAssociadoPorNome: vi.fn(async () => true) } };
});
vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn() } }));
vi.mock('../services/evidenciaOdometroService', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/evidenciaOdometroService')>();
  return {
    ...original,
    evidenciaOdometroService: {
      enviar: vi.fn(async () => ({ id: '7', fase: 'SAIDA', expira_em: '2026-11-18T12:30:00.000Z' })),
      consultar: vi.fn(async () => ({ saida: {}, chegada: {} })),
      arquivo: vi.fn(async () => ({ conteudo: Buffer.from([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg', nomeArquivo: 'odometro-svo-12-saida.jpg' })),
    },
  };
});
vi.mock('../services/viagemService', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/viagemService')>();
  return {
    ...original,
    viagemService: { ...original.viagemService, iniciarViagem: vi.fn(async () => ({ id: 5 })), finalizarViagem: vi.fn(async () => ({ id: 5 })) },
  };
});

const token = 'Bearer token-teste';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const CHAVE = '3f6c0d8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

const autenticarComo = (perfil: Perfil) =>
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 3, perfil } as Awaited<ReturnType<typeof authService.usuarioDoToken>>);

const armazenamentoFalso: ArmazenamentoEvidencias = { salvar: vi.fn(), ler: vi.fn(), remover: vi.fn() };

const envio = (campos: Record<string, string> = {}) => {
  const req = request(app).post('/api/evidencias-odometro').set('Authorization', token);
  const todos = { tipo_operacao: 'SVO', viagem_id: '12', fase: 'SAIDA', chave_idempotencia: CHAVE, ...campos };
  for (const [nome, valor] of Object.entries(todos)) req.field(nome, valor);
  return req;
};

describe('Rotas das fotos do odômetro (SCRUM-208/209)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    autenticarComo(PERFIS.MOTORISTA_SVO);
    definirArmazenamentoEvidencias(armazenamentoFalso);
  });

  afterEach(() => {
    definirArmazenamentoEvidencias(undefined);
  });

  it('recebe a foto em multipart e repassa os campos validados', async () => {
    const resposta = await envio().attach('arquivo', JPEG, { filename: 'odo.jpg', contentType: 'image/jpeg' });
    expect(resposta.status).toBe(201);
    expect(resposta.body).toEqual({ id: '7', fase: 'SAIDA', expira_em: '2026-11-18T12:30:00.000Z' });
    expect(evidenciaOdometroService.enviar).toHaveBeenCalledWith(
      { tipo_operacao: 'SVO', viagem_id: 12, fase: 'SAIDA', chave_idempotencia: CHAVE },
      JPEG,
      expect.objectContaining({ id: 3, perfil: PERFIS.MOTORISTA_SVO })
    );
  });

  it('sem armazenamento configurado, responde 503 antes de receber o arquivo', async () => {
    definirArmazenamentoEvidencias(undefined);
    const resposta = await envio().attach('arquivo', JPEG, 'odo.jpg');
    expect(resposta.status).toBe(503);
    expect(resposta.body.erro).toContain('armazenamento não foi configurado');
    expect(evidenciaOdometroService.enviar).not.toHaveBeenCalled();
  });

  it('recusa foto acima de 10 MB com 413', async () => {
    const resposta = await envio().attach('arquivo', Buffer.alloc(10 * 1024 * 1024 + 1, 0xff), 'grande.jpg');
    expect(resposta.status).toBe(413);
    expect(evidenciaOdometroService.enviar).not.toHaveBeenCalled();
  });

  it.each([
    [{ fase: 'MEIO' }],
    [{ tipo_operacao: 'OUTRA' }],
    [{ viagem_id: 'abc' }],
    [{ chave_idempotencia: 'nao-e-uuid' }],
    [{ extra: 'x' }],
  ])('recusa campos inválidos: %o', async (campos) => {
    const resposta = await envio(campos).attach('arquivo', JPEG, 'odo.jpg');
    expect(resposta.status).toBe(400);
    expect(evidenciaOdometroService.enviar).not.toHaveBeenCalled();
  });

  it('recusa envio sem arquivo ou com dois arquivos', async () => {
    expect((await envio()).status).toBe(400);
    const dois = await envio().attach('arquivo', JPEG, 'a.jpg').attach('outro', JPEG, 'b.jpg');
    expect(dois.status).toBe(400);
    expect(evidenciaOdometroService.enviar).not.toHaveBeenCalled();
  });

  it.each([PERFIS.SOLICITANTE])('nega envio e consulta a %s', async (perfil) => {
    autenticarComo(perfil);
    expect((await envio().attach('arquivo', JPEG, 'odo.jpg')).status).toBe(403);
    expect((await request(app).get('/api/evidencias-odometro?tipo_operacao=SVO&viagem_id=12').set('Authorization', token)).status).toBe(403);
  });

  it('exige autenticação', async () => {
    expect((await request(app).post('/api/evidencias-odometro').attach('arquivo', JPEG, 'odo.jpg')).status).toBe(401);
    expect((await request(app).get('/api/evidencias-odometro?tipo_operacao=SVO&viagem_id=12')).status).toBe(401);
  });

  it('consulta pela dupla operação + id e recusa filtros extras', async () => {
    const ok = await request(app).get('/api/evidencias-odometro?tipo_operacao=SVO&viagem_id=12').set('Authorization', token);
    expect(ok.status).toBe(200);
    expect(evidenciaOdometroService.consultar).toHaveBeenCalledWith('SVO', 12, expect.objectContaining({ id: 3 }));
    const extra = await request(app).get('/api/evidencias-odometro?tipo_operacao=SVO&viagem_id=12&usuario_id=1').set('Authorization', token);
    expect(extra.status).toBe(400);
  });

  it('arquivo só para gestores, sem cache e com download opcional', async () => {
    expect((await request(app).get('/api/evidencias-odometro/7/arquivo').set('Authorization', token)).status).toBe(403);
    expect(evidenciaOdometroService.arquivo).not.toHaveBeenCalled();

    autenticarComo(PERFIS.GESTOR_SVO);
    const ver = await request(app).get('/api/evidencias-odometro/7/arquivo').set('Authorization', token);
    expect(ver.status).toBe(200);
    expect(ver.headers['content-type']).toBe('image/jpeg');
    expect(ver.headers['cache-control']).toBe('no-store');
    expect(ver.headers['content-disposition']).toBe('inline; filename="odometro-svo-12-saida.jpg"');
    expect(evidenciaOdometroService.arquivo).toHaveBeenLastCalledWith(7, expect.objectContaining({ id: 3 }), false);

    const baixar = await request(app).get('/api/evidencias-odometro/7/arquivo?download=1').set('Authorization', token);
    expect(baixar.headers['content-disposition']).toContain('attachment');
    expect(evidenciaOdometroService.arquivo).toHaveBeenLastCalledWith(7, expect.anything(), true);
  });

  it('erros de permissão do service chegam como 403, sem detalhes internos', async () => {
    autenticarComo(PERFIS.GESTOR_FROTA);
    vi.mocked(evidenciaOdometroService.consultar).mockRejectedValueOnce(new AppError('Você não tem permissão para gerenciar este tipo de viagem', 403));
    const resposta = await request(app).get('/api/evidencias-odometro?tipo_operacao=SVO&viagem_id=12').set('Authorization', token);
    expect(resposta.status).toBe(403);
  });
});

describe('Transição de viagem com a foto (SCRUM-208)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    autenticarComo(PERFIS.MOTORISTA_SVO);
  });

  it('repassa o evidencia_id (texto ou número) ao iniciar e ao finalizar', async () => {
    await request(app).patch('/api/viagens/5/iniciar').set('Authorization', token).send({ tipo_operacao: 'SVO', km_inicial: 100, evidencia_id: '7' });
    expect(viagemService.iniciarViagem).toHaveBeenCalledWith('SVO', 5, 100, expect.anything(), 7);
    await request(app).patch('/api/viagens/5/finalizar').set('Authorization', token).send({ tipo_operacao: 'SVO', km_final: 150, evidencia_id: 8 });
    expect(viagemService.finalizarViagem).toHaveBeenCalledWith('SVO', 5, 150, expect.anything(), 8);
  });

  it.each(['abc', '0', '-1', '1.5', ''])('recusa evidencia_id inválido: %s', async (valor) => {
    const resposta = await request(app).patch('/api/viagens/5/iniciar').set('Authorization', token)
      .send({ tipo_operacao: 'SVO', km_inicial: 100, evidencia_id: valor });
    expect(resposta.status).toBe(400);
    expect(viagemService.iniciarViagem).not.toHaveBeenCalled();
  });
});
