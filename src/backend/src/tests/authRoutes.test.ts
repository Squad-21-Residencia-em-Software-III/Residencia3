import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../services/authService', () => ({
  authService: {
    login: vi.fn(),
    usuarioDoToken: vi.fn(),
    renovarSessao: vi.fn(),
    alterarPropriaSenha: vi.fn(),
  },
}));

import { app } from '../app';
import { AppError } from '../errors/AppError';
import { authService } from '../services/authService';

const usuario = { id: 7, nome: 'Gestor', email: 'g@exemplo.com', perfil: 'GESTOR_FROTA', tipo_usuario: 'GESTOR_FROTA', ativo: true };
const sessao = {
  token: 'novo.access.token',
  tipo: 'Bearer',
  expiraEm: '2h',
  refreshToken: 'novo.refresh.token',
  refreshExpiraEm: '2026-11-13T08:00:00.000Z',
  usuario,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.usuarioDoToken).mockResolvedValue(usuario as never);
  vi.mocked(authService.renovarSessao).mockResolvedValue(sessao as never);
  vi.mocked(authService.alterarPropriaSenha).mockResolvedValue(sessao as never);
});

describe('Middleware autenticar', () => {
  it('aceita o esquema Bearer sem diferenciar maiúsculas', async () => {
    const resposta = await request(app).get('/api/auth/me').set('Authorization', 'bearer abc.def.ghi');

    expect(resposta.status).toBe(200);
    expect(authService.usuarioDoToken).toHaveBeenCalledWith('abc.def.ghi');
  });

  it.each([undefined, 'Basic abc', 'Bearer', 'Bearer ', 'Bearer abc def', 'abc.def.ghi'])(
    'rejeita cabeçalho Authorization malformado: %s',
    async (cabecalho) => {
      const requisicao = request(app).get('/api/auth/me');
      const resposta = await (cabecalho === undefined ? requisicao : requisicao.set('Authorization', cabecalho));

      expect(resposta.status).toBe(401);
      expect(authService.usuarioDoToken).not.toHaveBeenCalled();
    }
  );

  it('responde com mensagem genérica, sem repetir o token recebido', async () => {
    vi.mocked(authService.usuarioDoToken).mockRejectedValueOnce(new AppError('Token inválido ou expirado', 401));

    const resposta = await request(app).get('/api/auth/me').set('Authorization', 'Bearer token.adulterado.xyz');

    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ erro: 'Token inválido ou expirado' });
    expect(JSON.stringify(resposta.body)).not.toContain('token.adulterado.xyz');
  });
});

describe('POST /api/auth/refresh', () => {
  it('troca o refresh token por um novo par de tokens', async () => {
    const resposta = await request(app).post('/api/auth/refresh').send({ refreshToken: 'refresh.atual.token' });

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual(sessao);
    expect(authService.renovarSessao).toHaveBeenCalledWith('refresh.atual.token');
  });

  it.each([{}, { refreshToken: '' }, { refreshToken: 123 }, { refreshToken: 'x', perfil: 'ADMINISTRADOR' }])(
    'rejeita corpo inválido: %j',
    async (corpo) => {
      const resposta = await request(app).post('/api/auth/refresh').send(corpo);

      expect(resposta.status).toBe(400);
      expect(authService.renovarSessao).not.toHaveBeenCalled();
    }
  );

  it('devolve 401 quando o refresh token é recusado', async () => {
    vi.mocked(authService.renovarSessao).mockRejectedValueOnce(new AppError('Token inválido ou expirado', 401));

    const resposta = await request(app).post('/api/auth/refresh').send({ refreshToken: 'refresh.invalido' });

    expect(resposta.status).toBe(401);
    expect(resposta.body).toEqual({ erro: 'Token inválido ou expirado' });
  });
});

describe('PATCH /api/auth/senha', () => {
  it('devolve os tokens novos da sessão atual', async () => {
    const resposta = await request(app)
      .patch('/api/auth/senha')
      .set('Authorization', 'Bearer access.atual.token')
      .send({ senhaAtual: 'Senha123', novaSenha: 'NovaSenha123' });

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual(sessao);
    expect(authService.alterarPropriaSenha).toHaveBeenCalledWith(7, { senhaAtual: 'Senha123', novaSenha: 'NovaSenha123' });
  });
});
