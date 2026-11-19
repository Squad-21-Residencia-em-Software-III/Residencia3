import { unidadeModel } from '../models/unidadeModel';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { PERFIS } from '../constants/perfis';
import { authService } from '../services/authService';
import { integrantesSvoService } from '../services/integrantesSvoService';
import { listarMinhasColetasSvo } from '../services/minhasColetasSvoService';
import { AppError } from '../errors/AppError';

vi.mock('../models/unidadeModel', () => ({ unidadeModel: { estaAssociadoPorNome: vi.fn() } }));
vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn() } }));
vi.mock('../services/integrantesSvoService', () => ({ integrantesSvoService: {
  criar: vi.fn(), listar: vi.fn(), listarEquipe: vi.fn(), vincular: vi.fn(), desvincular: vi.fn(), atualizar: vi.fn(), disponibilidade: vi.fn(),
} }));
vi.mock('../services/minhasColetasSvoService', () => ({ listarMinhasColetasSvo: vi.fn() }));

describe('acesso de integrantes SVO', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(unidadeModel.estaAssociadoPorNome).mockResolvedValue(true); vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 7, perfil: PERFIS.GESTOR_SVO } as never); });
  it('nega criação de conta e vínculo ao gestor sem associação à unidade SVO', async () => {
    vi.mocked(unidadeModel.estaAssociadoPorNome).mockResolvedValue(false);
    const conta = await request(app).post('/api/equipes-svo/integrantes').set('Authorization', 'Bearer token')
      .send({ nome: 'Maria Silva', email: 'maria@exemplo.com', senha: 'Senha123' });
    const vinculo = await request(app).put('/api/equipes-svo/2/integrantes/3').set('Authorization', 'Bearer token');
    expect(conta.status).toBe(403);
    expect(vinculo.status).toBe(403);
    expect(integrantesSvoService.criar).not.toHaveBeenCalled();
    expect(integrantesSvoService.vincular).not.toHaveBeenCalled();
  });
  it('não aceita perfil ou campos extras no cadastro específico', async () => {
    const r = await request(app).post('/api/equipes-svo/integrantes').set('Authorization', 'Bearer token')
      .send({ nome: 'Maria Silva', email: 'maria@exemplo.com', senha: 'Senha123', perfil: 'ADMINISTRADOR' });
    expect(r.status).toBe(400); expect(integrantesSvoService.criar).not.toHaveBeenCalled();
  });
  it('permite ao gestor editar apenas nome e email', async () => {
    vi.mocked(integrantesSvoService.atualizar).mockResolvedValue({ id: 3, nome: 'Maria Silva', email: 'maria@exemplo.com' } as never);
    const r = await request(app).patch('/api/equipes-svo/integrantes/3').set('Authorization', 'Bearer token').send({ nome: 'Maria Silva', email: 'MARIA@exemplo.com' });
    expect(r.status).toBe(200);
    expect(integrantesSvoService.atualizar).toHaveBeenCalledWith(3, { nome: 'Maria Silva', email: 'maria@exemplo.com' }, 7);
  });
  it.each([{ perfil: 'ADMINISTRADOR' }, { ativo: true }, { nome: '' }, { email: 'inválido' }, {}])('rejeita edição inválida ou com campos extras', async (dados) => {
    expect((await request(app).patch('/api/equipes-svo/integrantes/3').set('Authorization', 'Bearer token').send(dados)).status).toBe(400);
    expect(integrantesSvoService.atualizar).not.toHaveBeenCalled();
  });
  it.each([404, 409])('propaga erro de edição %s', async (status) => {
    vi.mocked(integrantesSvoService.atualizar).mockRejectedValue(new AppError('Falha', status));
    expect((await request(app).patch('/api/equipes-svo/integrantes/3').set('Authorization', 'Bearer token').send({ nome: 'Maria Silva' })).status).toBe(status);
  });
  it.each([PERFIS.MOTORISTA_SVO, PERFIS.SOLICITANTE, PERFIS.GESTOR_FROTA, PERFIS.INTEGRANTE_SVO])('nega gestão ao perfil %s', async (perfil) => {
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 7, perfil } as never);
    expect((await request(app).put('/api/equipes-svo/2/integrantes/3').set('Authorization', 'Bearer token')).status).toBe(403);
    const edicao = await request(app).patch('/api/equipes-svo/integrantes/3').set('Authorization', 'Bearer token').send({ nome: 'Nome válido' });
    expect(edicao.status).toBe(403);
    expect(integrantesSvoService.atualizar).not.toHaveBeenCalled();
  });
  it('consulta somente o usuário autenticado, sem aceitar ID na query', async () => {
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 7, perfil: PERFIS.INTEGRANTE_SVO } as never);
    vi.mocked(listarMinhasColetasSvo).mockResolvedValue({ dados: [], paginacao: { pagina: 1, limite: 20, total: 0, totalPaginas: 0 } });
    const invalida = await request(app).get('/api/viagens/coletas-svo/minhas?usuario_id=8').set('Authorization', 'Bearer token');
    expect(invalida.status).toBe(400);
    const valida = await request(app).get('/api/viagens/coletas-svo/minhas').set('Authorization', 'Bearer token');
    expect(valida.status).toBe(200); expect(listarMinhasColetasSvo).toHaveBeenCalledWith(7, 1, 20);
  });
  it('nega ações operacionais ao integrante', async () => {
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 7, perfil: PERFIS.INTEGRANTE_SVO } as never);
    const r = await request(app).patch('/api/viagens/1/iniciar').set('Authorization', 'Bearer token').send({ tipo_operacao: 'SVO', km_inicial: 1 });
    expect(r.status).toBe(403);
  });
});
