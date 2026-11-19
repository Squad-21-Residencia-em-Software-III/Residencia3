import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECURSOS_BACKEND } from '../../config/recursosBackend';
import { ApiError, CODIGO_CANCELADO, request, tokenStorage } from './http';
import { evidenciasOdometroApi } from './evidenciasOdometroApi';
import { viagensApi } from './viagensApi';

const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

const resposta = (status: number, corpo: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
});

const viagem = { id: 12, tipo_operacao: 'SVO' as const };
const foto = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'odo.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  fetchMock.mockReset();
  tokenStorage.set('token-teste');
});

afterEach(() => {
  RECURSOS_BACKEND.fotosOdometro = false;
});

describe('http: envio de arquivo e cancelamento (SCRUM-203)', () => {
  it('envia multipart sem forçar Content-Type JSON', async () => {
    fetchMock.mockResolvedValueOnce(resposta(201, { id: 'ev-1' }));
    const formData = new FormData();
    formData.append('fase', 'SAIDA');
    await request('POST', '/qualquer', { formData });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(formData);
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.headers.Authorization).toBe('Bearer token-teste');
  });

  it('distingue o envio cancelado de falta de conexão', async () => {
    const controle = new AbortController();
    fetchMock.mockImplementationOnce(async () => {
      controle.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    const erro = (await request('POST', '/qualquer', { formData: new FormData(), signal: controle.signal }).catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(erro).toBeInstanceOf(ApiError);
    expect(erro.codigo).toBe(CODIGO_CANCELADO);
  });
});

describe('evidenciasOdometroApi', () => {
  it('envia a foto com operação, viagem, fase e chave de reenvio', async () => {
    fetchMock.mockResolvedValueOnce(resposta(201, { id: 'ev-1', fase: 'SAIDA', expira_em: '' }));
    const enviada = await evidenciasOdometroApi.enviar(viagem, 'SAIDA', foto, { chaveIdempotencia: 'chave-1' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/evidencias-odometro$/);
    expect(init.method).toBe('POST');
    const corpo = init.body as FormData;
    expect(corpo.get('tipo_operacao')).toBe('SVO');
    expect(corpo.get('viagem_id')).toBe('12');
    expect(corpo.get('fase')).toBe('SAIDA');
    expect(corpo.get('chave_idempotencia')).toBe('chave-1');
    expect(corpo.get('arquivo')).toBeInstanceOf(File);
    expect(enviada.id).toBe('ev-1');
  });

  it('consulta pela dupla operação + id (ids administrativos e SVO podem coincidir)', async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, {}));
    await evidenciasOdometroApi.consultar(viagem);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toMatch(/\/evidencias-odometro$/);
    expect(url.searchParams.get('tipo_operacao')).toBe('SVO');
    expect(url.searchParams.get('viagem_id')).toBe('12');
  });
});

describe('viagensApi: evidência na transição só com o interruptor ligado', () => {
  it('desligado, iniciar e finalizar não enviam evidencia_id', async () => {
    fetchMock.mockResolvedValue(resposta(200, {}));
    await viagensApi.iniciar(viagem, 100, 'ev-1');
    await viagensApi.finalizar(viagem, 150, 'ev-2');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ tipo_operacao: 'SVO', km_inicial: 100 });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ tipo_operacao: 'SVO', km_final: 150 });
  });

  it('ligado, envia o id da foto junto com o km', async () => {
    RECURSOS_BACKEND.fotosOdometro = true;
    fetchMock.mockResolvedValue(resposta(200, {}));
    await viagensApi.iniciar(viagem, 100, 'ev-1');
    await viagensApi.finalizar(viagem, 150, 'ev-2');
    await viagensApi.finalizar(viagem, 150);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ tipo_operacao: 'SVO', km_inicial: 100, evidencia_id: 'ev-1' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ tipo_operacao: 'SVO', km_final: 150, evidencia_id: 'ev-2' });
    // Foto dispensada (exceção ou deslocamento compartilhado): sem evidencia_id
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ tipo_operacao: 'SVO', km_final: 150 });
  });
});
