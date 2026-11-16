import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { env } from '../config/env';
import { AppError } from '../errors/AppError';
import { authService } from '../services/authService';

const ORIGEM_FRONT = 'http://localhost:5173';
const ORIGEM_MALICIOSA = 'https://site-malicioso.example';
const REFRESH = 'refresh.token.secreto';

const usuario = { id: 7, nome: 'Gestor', email: 'g@exemplo.com', perfil: 'GESTOR_FROTA', tipo_usuario: 'GESTOR_FROTA', ativo: true };
const resposta = {
  token: 'novo.access.token',
  tipo: 'Bearer',
  expiraEm: '2h',
  sessaoExpiraEm: '2026-11-13T20:00:00.000Z',
  usuario,
};
const sessao = () => ({ resposta, refreshToken: REFRESH, sessaoExp: Math.floor(Date.now() / 1000) + 3600 });

const cookieRefresh = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refreshToken='));

const ambiente = env as { cookieSecure: boolean };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authService.login).mockResolvedValue(sessao() as never);
  vi.mocked(authService.usuarioDoToken).mockResolvedValue(usuario as never);
  vi.mocked(authService.renovarSessao).mockResolvedValue(sessao() as never);
  vi.mocked(authService.alterarPropriaSenha).mockResolvedValue(sessao() as never);
});

afterEach(() => {
  ambiente.cookieSecure = false;
});

describe('Middleware autenticar', () => {
  it('aceita o esquema Bearer sem diferenciar maiúsculas', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'bearer abc.def.ghi');

    expect(res.status).toBe(200);
    expect(authService.usuarioDoToken).toHaveBeenCalledWith('abc.def.ghi');
  });

  it.each([undefined, 'Basic abc', 'Bearer', 'Bearer ', 'Bearer abc def', 'abc.def.ghi'])(
    'rejeita cabeçalho Authorization malformado: %s',
    async (cabecalho) => {
      const requisicao = request(app).get('/api/auth/me');
      const res = await (cabecalho === undefined ? requisicao : requisicao.set('Authorization', cabecalho));

      expect(res.status).toBe(401);
      expect(authService.usuarioDoToken).not.toHaveBeenCalled();
    }
  );

  it('não aceita o refresh token do cookie como autenticação', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', `refreshToken=${REFRESH}`);

    expect(res.status).toBe(401);
    expect(authService.usuarioDoToken).not.toHaveBeenCalled();
  });

  it('responde com mensagem genérica, sem repetir o token recebido', async () => {
    vi.mocked(authService.usuarioDoToken).mockRejectedValueOnce(new AppError('Token inválido ou expirado', 401));

    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer token.adulterado.xyz');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ erro: 'Token inválido ou expirado' });
    expect(JSON.stringify(res.body)).not.toContain('token.adulterado.xyz');
  });
});

describe('POST /api/auth/login', () => {
  it('devolve o access token no JSON e o refresh token apenas em cookie protegido', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', ORIGEM_FRONT)
      .send({ email: 'g@exemplo.com', senha: 'Senha123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(resposta);
    expect(JSON.stringify(res.body)).not.toContain(REFRESH);

    const cookie = cookieRefresh(res)!;
    expect(cookie).toContain(`refreshToken=${REFRESH}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toMatch(/Max-Age=(3599|3600)/);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('marca o cookie como Secure quando COOKIE_SECURE está ativo (produção)', async () => {
    ambiente.cookieSecure = true;

    const res = await request(app).post('/api/auth/login').send({ email: 'g@exemplo.com', senha: 'Senha123' });

    expect(cookieRefresh(res)).toContain('Secure');
  });

  it('não emite cookie quando as credenciais são recusadas', async () => {
    vi.mocked(authService.login).mockRejectedValueOnce(new AppError('E-mail ou senha inválidos', 401));

    const res = await request(app).post('/api/auth/login').send({ email: 'g@exemplo.com', senha: 'errada' });

    expect(res.status).toBe(401);
    expect(cookieRefresh(res)).toBeUndefined();
  });
});

describe('POST /api/auth/refresh', () => {
  it('lê o refresh token do cookie, devolve novo access token e rotaciona o cookie', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', ORIGEM_FRONT)
      .set('Cookie', 'refreshToken=refresh.atual.token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(resposta);
    expect(authService.renovarSessao).toHaveBeenCalledWith('refresh.atual.token');
    expect(cookieRefresh(res)).toContain(`refreshToken=${REFRESH}`);
  });

  it('recusa quando não há cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ erro: 'Token inválido ou expirado' });
    expect(authService.renovarSessao).not.toHaveBeenCalled();
  });

  it('ignora refresh token enviado no corpo', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'refresh.no.body' });

    expect(res.status).toBe(401);
    expect(authService.renovarSessao).not.toHaveBeenCalled();
  });

  it.each(['expirado', 'adulterado'])('devolve 401 genérico para cookie %s, sem emitir cookie novo', async () => {
    vi.mocked(authService.renovarSessao).mockRejectedValueOnce(new AppError('Token inválido ou expirado', 401));

    const res = await request(app).post('/api/auth/refresh').set('Cookie', 'refreshToken=token.recusado');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ erro: 'Token inválido ou expirado' });
    expect(cookieRefresh(res)).toBeUndefined();
  });

  it('não registra o cookie em log ao recusar a renovação', async () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined)
    );
    vi.mocked(authService.renovarSessao).mockRejectedValueOnce(new Error('falha inesperada'));

    await request(app).post('/api/auth/refresh').set('Cookie', 'refreshToken=cookie.que.nao.pode.vazar');

    expect(JSON.stringify(espioes.flatMap((e) => e.mock.calls))).not.toContain('cookie.que.nao.pode.vazar');
    espioes.forEach((e) => e.mockRestore());
  });
});

describe('POST /api/auth/logout', () => {
  it('remove o cookie com o mesmo Path e atributos, sem exigir access token', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Origin', ORIGEM_FRONT)
      .set('Cookie', `refreshToken=${REFRESH}`);

    expect(res.status).toBe(204);
    const cookie = cookieRefresh(res)!;
    expect(cookie).toMatch(/^refreshToken=;/);
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
  });
});

describe('PATCH /api/auth/senha', () => {
  it('devolve o novo access token e atualiza o cookie da sessão atual', async () => {
    const res = await request(app)
      .patch('/api/auth/senha')
      .set('Origin', ORIGEM_FRONT)
      .set('Authorization', 'Bearer access.atual.token')
      .send({ senhaAtual: 'Senha123', novaSenha: 'NovaSenha123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(resposta);
    expect(cookieRefresh(res)).toContain(`refreshToken=${REFRESH}`);
    expect(authService.alterarPropriaSenha).toHaveBeenCalledWith(7, { senhaAtual: 'Senha123', novaSenha: 'NovaSenha123' });
  });
});

describe('Proteção contra CSRF nas rotas de sessão', () => {
  const rotas = [
    ['post', '/api/auth/login'],
    ['post', '/api/auth/refresh'],
    ['post', '/api/auth/logout'],
    ['patch', '/api/auth/senha'],
  ] as const;

  it.each(rotas)('%s %s recusa origem não autorizada', async (metodo, rota) => {
    const res = await request(app)[metodo](rota)
      .set('Origin', ORIGEM_MALICIOSA)
      .set('Cookie', `refreshToken=${REFRESH}`)
      .set('Authorization', 'Bearer access.atual.token')
      .send({ email: 'g@exemplo.com', senha: 'Senha123' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ erro: 'Origem não autorizada' });
    expect(cookieRefresh(res)).toBeUndefined();
    expect(authService.renovarSessao).not.toHaveBeenCalled();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it.each([['null'], ['http://localhost:5173.site-malicioso.example']])('recusa a origem %s', async (origem) => {
    const res = await request(app).post('/api/auth/refresh').set('Origin', origem).set('Cookie', `refreshToken=${REFRESH}`);

    expect(res.status).toBe(403);
  });

  it('recusa requisição marcada pelo navegador como cross-site', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Sec-Fetch-Site', 'cross-site')
      .set('Cookie', `refreshToken=${REFRESH}`);

    expect(res.status).toBe(403);
    expect(authService.renovarSessao).not.toHaveBeenCalled();
  });

  it('aceita a mesma origem da API (frontend servido pelo proxy /api)', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Host', 'fsph.exemplo.com')
      .set('Origin', 'http://fsph.exemplo.com')
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Cookie', `refreshToken=${REFRESH}`);

    expect(res.status).toBe(200);
  });

  it('não altera as rotas autenticadas por Bearer', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Origin', ORIGEM_MALICIOSA)
      .set('Authorization', 'Bearer abc.def.ghi');

    expect(res.status).toBe(200);
  });
});

describe('CORS', () => {
  it('libera a origem autorizada com credenciais, sem curinga', async () => {
    const res = await request(app)
      .options('/api/auth/refresh')
      .set('Origin', ORIGEM_FRONT)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBe(ORIGEM_FRONT);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('não libera origens desconhecidas', async () => {
    const res = await request(app)
      .options('/api/auth/refresh')
      .set('Origin', ORIGEM_MALICIOSA)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
