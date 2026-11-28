import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapasApi } from './mapasApi';
import { ApiError, CODIGO_CANCELADO, tokenStorage } from './http';
import {
  aplicarMascaraCepSeAplicavel,
  consultaTextoValidaParaBusca,
  coordenadaForaDeSergipe,
  determinarForaDeSergipe,
  extrairCepValido,
  formatarCep,
  formatarEnderecoMapa,
} from '../../utils/localizacaoMapa';
import type { EnderecoMapa } from '../../types/mapa';

const fetchMock = vi.fn<typeof fetch>();

function respostaJson(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  tokenStorage.set('token-teste');
});

afterEach(() => {
  tokenStorage.clear();
  vi.unstubAllGlobals();
});

describe('utilitários de localização de mapa', () => {
  it('detecta, mascara e formata CEP válido com ou sem hífen/ponto', () => {
    expect(extrairCepValido('49015-110')).toBe('49015110');
    expect(extrairCepValido('49.015-110')).toBe('49015110');
    expect(extrairCepValido(' 49015110 ')).toBe('49015110');
    expect(extrairCepValido('49015-11')).toBeNull();
    expect(extrairCepValido('Av. Tancredo Neves')).toBeNull();
    expect(formatarCep('49015110')).toBe('49015-110');
    expect(aplicarMascaraCepSeAplicavel('49015110')).toBe('49015-110');
    expect(aplicarMascaraCepSeAplicavel('49015-110')).toBe('49015-110');
    expect(aplicarMascaraCepSeAplicavel('490151')).toBe('49015-1');
    expect(aplicarMascaraCepSeAplicavel('Av. Beira Mar 120')).toBe('Av. Beira Mar 120');
  });

  it('bloqueia termos sensíveis e sequências numéricas longas na busca textual', () => {
    expect(consultaTextoValidaParaBusca('Av. Tancredo Neves, Aracaju')).toBe(true);
    expect(consultaTextoValidaParaBusca('ab')).toBe(false);
    expect(consultaTextoValidaParaBusca('CPF 12345678901')).toBe(false);
    expect(consultaTextoValidaParaBusca('Rua 1234567890')).toBe(false);
    expect(consultaTextoValidaParaBusca('paciente Joao')).toBe(false);
    expect(consultaTextoValidaParaBusca('123456')).toBe(false);
  });

  it('identifica coordenadas dentro e fora de Sergipe', () => {
    expect(coordenadaForaDeSergipe({ latitude: -10.9472, longitude: -37.0731 })).toBe(false);
    expect(coordenadaForaDeSergipe({ latitude: -23.5505, longitude: -46.6333 })).toBe(true);
    expect(
      determinarForaDeSergipe({
        foraDeSergipe: null,
        coordenadas: { latitude: -12.9714, longitude: -38.5014 },
      }),
    ).toBe(true);
    expect(
      determinarForaDeSergipe({
        foraDeSergipe: false,
        coordenadas: { latitude: -23.5505, longitude: -46.6333 },
      }),
    ).toBe(false);
  });

  it('formata EnderecoMapa de forma legível', () => {
    const endereco: EnderecoMapa = {
      fonte: 'photon',
      logradouro: 'Av. Augusto Franco',
      numero: '1200',
      bairro: 'Siqueira Campos',
      municipio: 'Aracaju',
      estado: 'SE',
      cep: '49075100',
      coordenadas: { latitude: -10.9167, longitude: -37.0772 },
      foraDeSergipe: false,
    };

    expect(formatarEnderecoMapa(endereco)).toBe(
      'Av. Augusto Franco, 1200, Siqueira Campos, Aracaju - SE, CEP 49075-100',
    );
  });
});

describe('mapasApi', () => {
  it('bloqueia coordenadas não finitas e busca textual com dados sensíveis antes da rede', async () => {
    await expect(mapasApi.reverso({ lat: Number.NaN, lon: 0 })).rejects.toMatchObject({ status: 400 });
    await expect(mapasApi.buscar({ q: 'CPF 52998224725' })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejeita DTO com campos obrigatórios ausentes', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson({ resultados: [{ fonte: 'photon' }], degradado: false }));
    await expect(mapasApi.buscar({ cep: '49015110', modoPublico: true }))
      .rejects.toMatchObject({ status: 502, codigo: 'MAPAS_RESPOSTA_INVALIDA' });
  });

  it('chama GET /api/mapas/buscar com query textual e operacao', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson({ resultados: [], degradado: false }));

    const resposta = await mapasApi.buscar({ q: '  Av.  Beira Mar  ', operacao: 'SVO' });

    expect(resposta).toEqual({ resultados: [], degradado: false });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      `${window.location.origin}/api/mapas/buscar?operacao=SVO&q=Av.+Beira+Mar`,
    );
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-teste');
  });

  it('chama GET /api/mapas/buscar com cep normalizado e unidade institucional', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaJson({ resultados: [], degradado: false }))
      .mockResolvedValueOnce(respostaJson({ resultados: [], degradado: false }));

    await mapasApi.buscar({ cep: '49015-110' });
    await mapasApi.buscar({ unidade: 'HEMOSE', operacao: 'ADM' });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/mapas/buscar?operacao=ADM&cep=49015110',
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      '/api/mapas/buscar?operacao=ADM&unidade=HEMOSE',
    );
  });

  it('no modoPublico consulta /api/portal-svo/mapas/buscar sem cookies nem Bearer', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson({ resultados: [], degradado: false }));

    await mapasApi.buscar({ cep: '49015-110', modoPublico: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${window.location.origin}/api/portal-svo/mapas/buscar?cep=49015110`);
    expect(init?.credentials).toBe('omit');
    expect(init?.cache).toBe('no-store');
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('no modoPublico rejeita busca textual sem acionar a rede', async () => {
    await expect(mapasApi.buscar({ q: 'Rua de Aracaju', modoPublico: true })).rejects.toMatchObject(
      {
        status: 400,
        codigo: 'MAPAS_MODO_PUBLICO_APENAS_CEP',
      },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('chama GET /api/mapas/reverso com coordenadas arredondadas e suporta modoPublico', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaJson({ resultados: [], degradado: false }))
      .mockResolvedValueOnce(respostaJson({ resultados: [], degradado: false }));

    await mapasApi.reverso({ lat: -10.947212345, lon: -37.073198765, operacao: 'SVO' });
    await mapasApi.reverso({ lat: -10.947212345, lon: -37.073198765, modoPublico: true });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `${window.location.origin}/api/mapas/reverso?operacao=SVO&lat=-10.947212&lon=-37.073199`,
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      `${window.location.origin}/api/portal-svo/mapas/reverso?lat=-10.947212&lon=-37.073199`,
    );
    expect(fetchMock.mock.calls[1]?.[1]?.credentials).toBe('omit');
  });

  it('chama GET /api/mapas/rota serializando múltiplos parâmetros pontos', async () => {
    fetchMock.mockResolvedValueOnce(
      respostaJson({
        aproximada: false,
        metodo: 'OSRM',
        distanciaMetros: 4200,
        geometria: 'abc',
        formatoGeometria: 'polyline5',
      }),
    );

    const rota = await mapasApi.calcularRota({
      operacao: 'ADM',
      retornarOrigem: true,
      pontos: [
        { latitude: -10.9167, longitude: -37.0772 },
        { latitude: -10.9472, longitude: -37.0731 },
      ],
    });

    expect(rota.distanciaMetros).toBe(4200);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/api/mapas/rota');
    expect(url.searchParams.get('operacao')).toBe('ADM');
    expect(url.searchParams.get('retornarOrigem')).toBe('true');
    expect(url.searchParams.getAll('pontos')).toEqual(['-10.9167,-37.0772', '-10.9472,-37.0731']);
  });

  it('propaga cancelamento via AbortSignal com CODIGO_CANCELADO', async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    await expect(
      mapasApi.buscar({ cep: '49015-110', modoPublico: true, signal: controller.signal }),
    ).rejects.toMatchObject({
      codigo: CODIGO_CANCELADO,
    });
  });

  it('propaga ApiError com status e codigo em 429/404/503 no modo público', async () => {
    fetchMock.mockResolvedValueOnce(
      respostaJson({ erro: 'Muitas consultas', codigo: 'RATE_LIMIT' }, 429),
    );

    try {
      await mapasApi.buscar({ cep: '49015-110', modoPublico: true });
      expect.unreachable('Deveria lançar ApiError');
    } catch (erro) {
      expect(erro).toBeInstanceOf(ApiError);
      expect((erro as ApiError).status).toBe(429);
      expect((erro as ApiError).codigo).toBe('RATE_LIMIT');
    }
  });
});
