import { unidadeModel } from '../models/unidadeModel';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { PERFIS } from '../constants/perfis';
import { authService } from '../services/authService';
import { gestaoEquipesSvoService } from '../services/gestaoEquipesSvoService';
import { AppError } from '../errors/AppError';

vi.mock('../models/unidadeModel', () => ({ unidadeModel: { estaAssociadoPorNome: vi.fn() } }));
vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn() } }));
vi.mock('../services/gestaoEquipesSvoService', () => ({
  gestaoEquipesSvoService: { listar: vi.fn(), buscar: vi.fn(), salvar: vi.fn() },
}));

describe('gestão de equipes SVO', () => {
  const endpoint = '/api/equipes-svo';
  beforeEach(() => {
    vi.resetAllMocks(); vi.mocked(unidadeModel.estaAssociadoPorNome).mockResolvedValue(true);
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 7, perfil: PERFIS.GESTOR_SVO } as never);
    vi.mocked(gestaoEquipesSvoService.salvar).mockResolvedValue({ id: 3, nome_equipe: 'Alfa' });
  });
  it.each([PERFIS.GESTOR_SVO, PERFIS.ADMINISTRADOR])('permite cadastro por %s', async (perfil) => {
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 7, perfil } as never);
    const res = await request(app).post(endpoint).set('Authorization', 'Bearer token').send({ nome_equipe: '  Alfa  ' });
    expect(res.status).toBe(201);
    expect(gestaoEquipesSvoService.salvar).toHaveBeenCalledWith('Alfa', 7);
  });
  it('bloqueia criação de equipe pelo gestor sem unidade e preserva a autorização do administrador', async () => {
    vi.mocked(unidadeModel.estaAssociadoPorNome).mockResolvedValue(false);
    const criar = () => request(app).post(endpoint).set('Authorization', 'Bearer token').send({ nome_equipe: 'Alfa' });
    expect((await criar()).status).toBe(403);
    expect(gestaoEquipesSvoService.salvar).not.toHaveBeenCalled();
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 7, perfil: PERFIS.ADMINISTRADOR } as never);
    expect((await criar()).status).toBe(201);
  });
  it('encaminha edição com autor e identificador', async () => {
    const res = await request(app).patch(`${endpoint}/3`).set('Authorization', 'Bearer token').send({ nome_equipe: 'Alfa' });
    expect(res.status).toBe(200);
    expect(gestaoEquipesSvoService.salvar).toHaveBeenCalledWith('Alfa', 7, 3);
  });
  it.each(['', '   ', 'a'.repeat(101)])('rejeita nome inválido', async (nome_equipe) => {
    expect((await request(app).post(endpoint).set('Authorization', 'Bearer token').send({ nome_equipe })).status).toBe(400);
    expect(gestaoEquipesSvoService.salvar).not.toHaveBeenCalled();
  });
  it('rejeita campos não autorizados', async () => {
    expect((await request(app).post(endpoint).set('Authorization', 'Bearer token').send({ nome_equipe: 'Alfa', id: 1 })).status).toBe(400);
  });
  it('propaga conflito de nome', async () => {
    vi.mocked(gestaoEquipesSvoService.salvar).mockRejectedValue(new AppError('Nome duplicado', 409));
    expect((await request(app).post(endpoint).set('Authorization', 'Bearer token').send({ nome_equipe: 'Alfa' })).status).toBe(409);
  });
  it('exige autenticação', async () => {
    expect((await request(app).get(endpoint)).status).toBe(401);
  });
  it.each([PERFIS.SOLICITANTE, PERFIS.GESTOR_FROTA, PERFIS.MOTORISTA_SVO])('nega acesso de %s', async (perfil) => {
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 7, perfil } as never);
    expect((await request(app).get(endpoint).set('Authorization', 'Bearer token')).status).toBe(403);
    expect((await request(app).post(endpoint).set('Authorization', 'Bearer token').send({ nome_equipe: 'Alfa' })).status).toBe(403);
  });
});
