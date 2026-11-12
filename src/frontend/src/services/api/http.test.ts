import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENTO_SESSAO_EXPIRADA, request, tokenStorage } from './http';

const resposta = (status: number, corpo: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
});

const autorizacao = (chamada: unknown[]) =>
  (chamada[1] as { headers: Record<string, string> }).headers.Authorization;

describe('http: renovação da sessão', () => {
  const fetchMock = vi.fn();
  globalThis.fetch = fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    tokenStorage.set('access-antigo', 'refresh-atual');
  });

  it('renova a sessão no 401 e repete a requisição com o token novo', async () => {
    fetchMock
      .mockResolvedValueOnce(resposta(401, { erro: 'Token inválido ou expirado' }))
      .mockResolvedValueOnce(resposta(200, { token: 'access-novo', refreshToken: 'refresh-novo' }))
      .mockResolvedValueOnce(resposta(200, { id: 1 }));

    await expect(request('GET', '/veiculos')).resolves.toEqual({ id: 1 });

    expect(String(fetchMock.mock.calls[1]![0])).toContain('/auth/refresh');
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as { body: string }).body)).toEqual({ refreshToken: 'refresh-atual' });
    expect(autorizacao(fetchMock.mock.calls[2]!)).toBe('Bearer access-novo');
    expect(tokenStorage.get()).toBe('access-novo');
    expect(tokenStorage.getRefresh()).toBe('refresh-novo');
  });

  it('faz uma única renovação para requisições simultâneas', async () => {
    fetchMock.mockImplementation(async (url: URL, init: { headers: Record<string, string> }) => {
      if (String(url).includes('/auth/refresh')) return resposta(200, { token: 'access-novo', refreshToken: 'refresh-novo' });
      return init.headers.Authorization === 'Bearer access-novo' ? resposta(200, { ok: true }) : resposta(401);
    });

    await Promise.all([request('GET', '/veiculos'), request('GET', '/motoristas')]);

    const renovacoes = fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/refresh'));
    expect(renovacoes).toHaveLength(1);
  });

  it('encerra a sessão quando a renovação falha', async () => {
    const aoExpirar = vi.fn();
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
    fetchMock.mockResolvedValueOnce(resposta(401)).mockResolvedValueOnce(resposta(401));

    await expect(request('GET', '/veiculos')).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokenStorage.get()).toBeNull();
    expect(tokenStorage.getRefresh()).toBeNull();
    expect(aoExpirar).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
  });

  it('não repete a requisição mais de uma vez', async () => {
    fetchMock
      .mockResolvedValueOnce(resposta(401))
      .mockResolvedValueOnce(resposta(200, { token: 'access-novo', refreshToken: 'refresh-novo' }))
      .mockResolvedValueOnce(resposta(401));

    await expect(request('GET', '/veiculos')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('não tenta renovar em requisições sem autenticação, como o login', async () => {
    fetchMock.mockResolvedValueOnce(resposta(401, { erro: 'E-mail ou senha inválidos' }));

    await expect(request('POST', '/auth/login', { body: {}, semAutenticacao: true })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokenStorage.getRefresh()).toBe('refresh-atual');
  });
});
