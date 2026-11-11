import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usuariosApi } from './usuariosApi';

describe('usuariosApi', () => {
  const fetchMock = vi.fn();
  globalThis.fetch = fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve listar usuários repassando paginação e filtros na query string', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        dados: [{ id: 1, nome: 'Carlos' }],
        paginacao: { pagina: 2, limite: 10, total: 1, totalPaginas: 1 },
      }),
    });

    const resultado = await usuariosApi.listar({ pagina: 2, limite: 10, busca: 'carlos' });

    expect(resultado.dados).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('/api/usuarios?pagina=2&limite=10&busca=carlos'),
      }),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('deve chamar redefinirSenha com PATCH e payload correto', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    await usuariosApi.redefinirSenha(3, 'NovaSenha@123');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('/api/usuarios/3/senha'),
      }),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ senha: 'NovaSenha@123' }),
      }),
    );
  });
});

