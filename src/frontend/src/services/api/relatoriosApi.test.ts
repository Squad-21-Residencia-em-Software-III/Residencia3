import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, tokenStorage } from './http';
import { relatoriosApi } from './relatoriosApi';

describe('relatoriosApi + downloadBlob: fluxo real de download', () => {
  const fetchMock = vi.fn();
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    tokenStorage.clear();
    vi.stubGlobal('fetch', fetchMock);
    createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:http://localhost/relatorio-123');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('baixa blob com Authorization, credentials include, Content-Disposition e revoga URL via timer', async () => {
    vi.useFakeTimers();
    tokenStorage.set('token-valido');

    const blobConteudo = new Blob(['col1;col2\n1;2'], { type: 'text/csv;charset=utf-8' });
    fetchMock.mockResolvedValueOnce(
      new Response(blobConteudo, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="relatorio-viagens-2026-11-16.csv"',
        },
      }),
    );

    const nomeArquivo = await relatoriosApi.exportar('viagens', 'csv', {
      inicio: '2026-11-01',
      fim: '2026-11-16',
    });

    expect(nomeArquivo).toBe('relatorio-viagens-2026-11-16.csv');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [urlChamada, initChamada] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(urlChamada.pathname).toBe('/api/relatorios/viagens/exportar');
    expect(urlChamada.searchParams.get('formato')).toBe('csv');
    expect(urlChamada.searchParams.get('inicio')).toBe('2026-11-01');
    expect(urlChamada.searchParams.get('fim')).toBe('2026-11-16');
    expect(initChamada.credentials).toBe('include');
    expect((initChamada.headers as Record<string, string>).Authorization).toBe(
      'Bearer token-valido',
    );

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // Não revoga sincronamente antes do navegador iniciar o download
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/relatorio-123');
  });

  it('renova a sessão após 401 via /auth/refresh e repete o download com o novo token', async () => {
    tokenStorage.set('token-expirado');

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ erro: 'Token expirado' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'token-renovado' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), {
          status: 200,
          headers: {
            'Content-Disposition': "attachment; filename*=UTF-8''relatorio-multas-2026-11-16.pdf",
          },
        }),
      );

    const nomeArquivo = await relatoriosApi.exportar('multas', 'pdf');

    expect(nomeArquivo).toBe('relatorio-multas-2026-11-16.pdf');
    expect(tokenStorage.get()).toBe('token-renovado');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, retryInit] = fetchMock.mock.calls[2] as [URL, RequestInit];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer token-renovado',
    );
  });

  it('propaga ApiError com status 403 e 422 sem iniciar download', async () => {
    tokenStorage.set('token-valido');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ erro: 'Acesso negado para este perfil' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(relatoriosApi.exportar('abastecimentos', 'xlsx')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: 'Acesso negado para este perfil',
    });

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ erro: 'Limite de 5.000 linhas excedido. Use CSV ou XLSX.' }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    try {
      await relatoriosApi.exportar('manutencoes', 'pdf');
      expect.unreachable('Deveria lançar ApiError 422');
    } catch (erro) {
      expect(erro).toBeInstanceOf(ApiError);
      expect((erro as ApiError).status).toBe(422);
      expect((erro as ApiError).message).toBe(
        'Limite de 5.000 linhas excedido. Use CSV ou XLSX.',
      );
    }

    expect(createObjectURLSpy).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
