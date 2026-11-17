import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { PERFIS } from '../constants/perfis';
import { authService } from '../services/authService';
import { integrantesSvoService } from '../services/integrantesSvoService';
import { listarMinhasColetasSvo } from '../services/minhasColetasSvoService';

vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn() } }));
vi.mock('../services/integrantesSvoService', () => ({ integrantesSvoService: {
  criar: vi.fn(), listar: vi.fn(), listarEquipe: vi.fn(), vincular: vi.fn(), desvincular: vi.fn(),
} }));
vi.mock('../services/minhasColetasSvoService', () => ({ listarMinhasColetasSvo: vi.fn() }));

describe('acesso de integrantes SVO', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 7, perfil: PERFIS.GESTOR_SVO } as never); });
  it('não aceita perfil ou campos extras no cadastro específico', async () => {
    const r = await request(app).post('/api/equipes-svo/integrantes').set('Authorization', 'Bearer token')
      .send({ nome: 'Maria Silva', email: 'maria@exemplo.com', senha: 'Senha123', perfil: 'ADMINISTRADOR' });
    expect(r.status).toBe(400); expect(integrantesSvoService.criar).not.toHaveBeenCalled();
  });
  it.each([PERFIS.MOTORISTA_SVO, PERFIS.SOLICITANTE, PERFIS.GESTOR_FROTA, PERFIS.INTEGRANTE_SVO])('nega gestão ao perfil %s', async (perfil) => {
    vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: 7, perfil } as never);
    expect((await request(app).put('/api/equipes-svo/2/integrantes/3').set('Authorization', 'Bearer token')).status).toBe(403);
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
