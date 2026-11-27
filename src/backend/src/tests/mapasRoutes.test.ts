import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { env } from '../config/env';
import { carregarFase3 } from '../config/fase3';
import { PERFIS, type Perfil } from '../constants/perfis';
import { AppError } from '../errors/AppError';
import { unidadeModel } from '../models/unidadeModel';
import type { Usuario } from '../models/usuarioModel';
import { LIMITE_MAPAS_POR_USUARIO_POR_MINUTO } from '../routes/mapasRoutes';
import { authService } from '../services/authService';

const { encaminharErroSvo } = vi.hoisted(() => ({ encaminharErroSvo: vi.fn<() => Error | undefined>() }));
vi.mock('../middlewares/autorizar', async (importOriginal) => {
  const original = await importOriginal<typeof import('../middlewares/autorizar')>();
  return {
    ...original,
    exigirAssociacaoSvo: async (...args: Parameters<typeof original.exigirAssociacaoSvo>) => {
      const erro = encaminharErroSvo();
      if (erro) {
        args[2](erro);
        return;
      }
      await original.exigirAssociacaoSvo(...args);
    },
  };
});
vi.mock('../services/authService', () => ({ authService: { usuarioDoToken: vi.fn() } }));
vi.mock('../models/unidadeModel', () => ({ unidadeModel: { estaAssociadoPorNome: vi.fn() } }));

const token = 'Bearer identificador-sintetico';
const faseOriginal = env.fase3;
const configuracao = { FASE3_MAPAS_INTERNOS: 'true', FASE3_MAPAS_SVO: 'true', FASE3_MULTIPLAS_PARADAS: 'true' };
const http = vi.fn<typeof fetch>();
let id = 0;

function autenticarComo(perfil: Perfil) {
  vi.mocked(authService.usuarioDoToken).mockResolvedValue({ id: ++id, perfil, ativo: true } as Usuario);
}

function urlRota(pontos: string[], operacao = 'ADM') {
  const params = new URLSearchParams({ operacao });
  for (const ponto of pontos) params.append('pontos', ponto);
  return '/api/mapas/rota?' + params;
}

beforeEach(() => {
  encaminharErroSvo.mockReset();
  env.fase3 = carregarFase3(configuracao);
  autenticarComo(PERFIS.ADMINISTRADOR);
  vi.mocked(unidadeModel.estaAssociadoPorNome).mockResolvedValue(true);
  http.mockReset().mockImplementation(async () => Response.json({ type: 'FeatureCollection', features: [] }));
  vi.stubGlobal('fetch', http);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  env.fase3 = faseOriginal;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Rotas de mapa no app real com autenticação e provedores simulados', () => {
  it.each(['/buscar?q=Via+Teste', '/reverso?lat=0&lon=0', '/rota?pontos=0,0&pontos=1,1'])(
    'exige sessão em %s e nunca usa o provedor para requisições anônimas', async (caminho) => {
      await request(app).get('/api/mapas' + caminho).expect(401);
      expect(http).not.toHaveBeenCalled();
    },
  );

  it('mantém acesso negado e verifica associação SVO antes da saída externa', async () => {
    autenticarComo(PERFIS.MOTORISTA_SVO);
    await request(app).get('/api/mapas/buscar?q=Via+Teste&operacao=SVO').set('Authorization', token).expect(403);
    autenticarComo(PERFIS.GESTOR_SVO);
    vi.mocked(unidadeModel.estaAssociadoPorNome).mockResolvedValue(false);
    await request(app).get('/api/mapas/reverso?lat=0&lon=0&operacao=SVO').set('Authorization', token).expect(403);
    autenticarComo(PERFIS.SOLICITANTE);
    await request(app).get(urlRota(['0,0', '1,1'], 'SVO')).set('Authorization', token).expect(403);
    autenticarComo(PERFIS.MOTORISTA_SVO);
    await request(app).get(urlRota(['0,0', '1,1'])).set('Authorization', token).expect(403);
    expect(http).not.toHaveBeenCalled();
  });

  it('encaminha next(erro) da associação SVO uma vez e interrompe a rota', async () => {
    encaminharErroSvo.mockReturnValue(new AppError('Associação indisponível', 503, 'ASSOCIACAO_INDISPONIVEL'));
    autenticarComo(PERFIS.GESTOR_SVO);
    await request(app).get(urlRota(['0,0', '1,1'], 'SVO')).set('Authorization', token)
      .expect(503).expect(({ body }) => expect(body.codigo).toBe('ASSOCIACAO_INDISPONIVEL'));
    expect(encaminharErroSvo).toHaveBeenCalledTimes(1);
    expect(http).not.toHaveBeenCalled();
  });

  it('mantém os erros da autenticação antes da degradação', async () => {
    vi.mocked(authService.usuarioDoToken).mockRejectedValueOnce(new AppError('Sessão inválida', 401));
    await request(app).get('/api/mapas/buscar?q=Via+Teste').set('Authorization', token).expect(401);
    expect(http).not.toHaveBeenCalled();
  });

  it('aplica gates independentes de mapa e mantém portal manual independente', async () => {
    env.fase3 = carregarFase3({ FASE3_PORTAL_SVO: 'true', FASE3_MAPAS_SVO: 'true' });
    await request(app).get('/api/mapas/buscar?q=Via+Teste').set('Authorization', token)
      .expect(404).expect(({ body }) => expect(body.codigo).toBe('RECURSO_DESATIVADO'));
    await request(app).get('/api/mapas/buscar?unidade=LACEN&operacao=SVO').set('Authorization', token).expect(200);
    expect(http).not.toHaveBeenCalled();
  });

  it('exige flag de paradas ADM e não a aplica às paradas SVO', async () => {
    env.fase3 = carregarFase3({ ...configuracao, FASE3_MULTIPLAS_PARADAS: 'false' });
    await request(app).get(urlRota(['0,0', '1,1', '2,2'])).set('Authorization', token).expect(404);
    await request(app).get(urlRota(['0,0', '1,1', '2,2'], 'SVO')).set('Authorization', token).expect(200);
    expect(http).toHaveBeenCalledTimes(1);
  });

  it.each([PERFIS.ADMINISTRADOR, PERFIS.GESTOR_FROTA, PERFIS.SOLICITANTE, PERFIS.GESTOR_SVO])(
    'permite calcular rota ADM ao perfil %s sem conceder associação SVO', async (perfil) => {
      autenticarComo(perfil);
      vi.mocked(unidadeModel.estaAssociadoPorNome).mockClear().mockResolvedValue(false);
      await request(app).get(urlRota(['0,0', '1,1', '2,2', '3,3'])).set('Authorization', token).expect(200);
      expect(unidadeModel.estaAssociadoPorNome).not.toHaveBeenCalled();
    },
  );

  it.each([
    '/buscar?q=ab',
    '/buscar?cep=1234',
    '/buscar?q=Via+Teste&q=Duplicado',
    '/buscar?q=Via+Teste&url=https%3A%2F%2Fexample.test',
    '/buscar?q=Via+Teste&cpf=12345678900',
    '/reverso?lat=91&lon=0',
    '/reverso?lat=0&lon=-181',
    '/reverso?lat=&lon=0',
    '/rota?pontos=0,0&pontos=invalido',
  ])('conserva 400 para entrada inválida sem encaminhá-la', async (caminho) => {
    const resposta = await request(app).get('/api/mapas' + caminho).set('Authorization', token).expect(400);
    expect(resposta.body.codigo).toBe('MAPAS_PARAMETROS_INVALIDOS');
    expect(JSON.stringify(resposta.body)).not.toContain('12345678900');
    expect(http).not.toHaveBeenCalled();
  });

  it('mantém 414 e 422 separados e nunca calcula rota parcial', async () => {
    await request(app).get('/api/mapas/buscar?q=' + 'a'.repeat(4096)).set('Authorization', token).expect(414);
    await request(app).get(urlRota(['0,0', '', '1,1'])).set('Authorization', token)
      .expect(422).expect(({ body }) => expect(body).toMatchObject({ codigo: 'ROTA_SEM_COORDENADAS', contexto: { metodo: 'INDISPONIVEL', pontos: [1] } }));
    await request(app).get(urlRota(Array(11).fill('0,0'))).set('Authorization', token).expect(400);
    expect(http).not.toHaveBeenCalled();
  });

  it('preserva autenticação e segurança HTTP, remove cabeçalhos de entrada e sanitiza os logs', async () => {
    const q = 'Via Sintética 999';
    await request(app).get('/api/mapas/buscar').query({ q })
      .set('Authorization', token).set('Cookie', 'temporario=privado')
      .set('X-Proxy-Secret', 'segredo-invalido').set('X-Request-Id', 'entrada arbitraria')
      .expect('Cache-Control', 'private, no-store').expect('X-Content-Type-Options', 'nosniff')
      .expect('X-Request-Id', /^[0-9a-f-]{36}$/i).expect(200);
    const [url, opts] = http.mock.calls[0]!;
    expect((url as URL).searchParams.get('q')).toBe(q);
    const headers = new Headers(opts?.headers);
    expect([...headers.keys()]).toEqual(['accept', 'user-agent']);
    const log = JSON.stringify(vi.mocked(console.log).mock.calls);
    expect(log).not.toContain(q);
    expect(log).not.toContain('privado');
    expect(log).not.toContain('segredo-invalido');
    expect(log).not.toContain('entrada arbitraria');
  });

  it('aplica 429 por conta e preserva uma segunda conta no mesmo IP', async () => {
    for (let i = 0; i < LIMITE_MAPAS_POR_USUARIO_POR_MINUTO; i++) {
      await request(app).get('/api/mapas/buscar?unidade=HEMOSE').set('Authorization', token).expect(200);
    }
    await request(app).get('/api/mapas/buscar?unidade=HEMOSE').set('Authorization', token)
      .set('X-Proxy-Secret', 'falso').set('X-Forwarded-For', '203.0.113.1')
      .expect('Retry-After', /^\d+$/).expect(429);
    autenticarComo(PERFIS.ADMINISTRADOR);
    await request(app).get('/api/mapas/buscar?unidade=HEMOSE').set('Authorization', token).expect(200);
  });
});
