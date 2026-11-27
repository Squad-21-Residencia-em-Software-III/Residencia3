import { describe, expect, it, vi } from 'vitest';
import { carregarEnv } from '../config/env';
import { CacheMapas } from '../services/mapasCache';
import { criarMapasService } from '../services/mapasService';
import { buscarMapaSchema, reversoMapaSchema, rotaMapaSchema } from '../validators/mapasSchemas';

const agora = () => ({ prazoMs: 11000, sinal: new AbortController().signal });
const buscar = (q: string) => buscarMapaSchema.parse({ q });
const rota = (pontos: string[], extras = {}) => rotaMapaSchema.parse({ pontos, ...extras });
const json = (valor: unknown, status = 200) => Response.json(valor, { status });
const vazio = { type: 'FeatureCollection', features: [] };
const photon = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature', geometry: { type: 'Point', coordinates: [-46.63, -23.55] },
    properties: { street: 'Praça da Sé', city: 'São Paulo', state: 'São Paulo', countrycode: 'BR', osm_id: 123 },
  }],
};
const cep = { cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP', estado: 'São Paulo' };
const geometry = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const osrm = { code: 'Ok', routes: [{ distance: 2510.2, geometry }] };
const configurar = (orcamentoMs = 10500, relogio = Date.now) => {
  const http = vi.fn<typeof fetch>();
  const registrar = vi.fn();
  const service = criarMapasService({ entradas: 500, orcamentoMs, http, agora: relogio, registrar });
  return { http, registrar, service };
};

describe('Proxy cartográfico com upstream simulado', () => {
  it('normaliza CEP, compõe a busca estruturada com viés e preserva resultados fora de Sergipe', async () => {
    const { http, service } = configurar();
    http.mockResolvedValueOnce(json(cep)).mockResolvedValueOnce(json(photon));
    const resposta = await service.buscar(buscarMapaSchema.parse({ cep: ' 01001-000 ' }), agora());
    expect(resposta).toEqual({ degradado: false, resultados: [{
      fonte: 'photon', logradouro: 'Praça da Sé', numero: null, bairro: null, municipio: 'São Paulo', estado: 'São Paulo', cep: null,
      coordenadas: { latitude: -23.55, longitude: -46.63 }, foraDeSergipe: true,
    }] });
    const [viaCep, estruturado] = http.mock.calls.map(([url]) => url as URL);
    expect(viaCep?.href).toBe('https://viacep.com.br/ws/01001000/json/');
    expect(estruturado?.origin).toBe('https://photon.komoot.io');
    expect(estruturado?.pathname).toBe('/structured');
    expect(estruturado?.searchParams.get('street')).toBe('Praça da Sé');
    expect(estruturado?.searchParams.get('countrycode')).toBe('BR');
    expect(estruturado?.searchParams.get('lat')).toBe('-10.91');
    expect(estruturado?.searchParams.has('bbox')).toBe(false);
  });

  it('distingue CEP inexistente e consulta ViaCEP sem coordenadas após tentativas Photon vazias', async () => {
    const { http, service } = configurar();
    http.mockResolvedValueOnce(json({ erro: 'true' })).mockResolvedValueOnce(json(cep))
      .mockResolvedValueOnce(json(vazio)).mockResolvedValueOnce(json(vazio));
    expect(await service.buscar(buscarMapaSchema.parse({ cep: '99999999' }), agora())).toEqual({ resultados: [], degradado: false });
    const resultado = await service.buscar(buscarMapaSchema.parse({ cep: '01001000' }), agora());
    expect(resultado.resultados[0]).toMatchObject({ fonte: 'viaCEP', coordenadas: null, cep: '01001-000' });
    expect((http.mock.calls[3]?.[0] as URL).pathname).toBe('/api');
  });

  it('resolve atalhos antes de provedores e aguarda coordenadas oficiais da SCRUM-274', async () => {
    const { http, service } = configurar();
    expect(await service.buscar(buscar('HEMOSE'), agora())).toEqual({ resultados: [], degradado: false });
    expect(http).not.toHaveBeenCalled();
    const unidade = {
      fonte: 'unidade', logradouro: 'Via sintética', numero: null, bairro: null, municipio: 'Teste',
      estado: 'SE', cep: null, coordenadas: { latitude: 0, longitude: 0 }, foraDeSergipe: false,
    } as const;
    const resolver = vi.fn().mockResolvedValue(unidade);
    const comUnidade = criarMapasService({ entradas: 500, orcamentoMs: 7000, http, registrar: vi.fn(), consultarUnidade: resolver });
    expect(await comUnidade.buscar(buscarMapaSchema.parse({ unidade: 'hemose' }), agora())).toEqual({ resultados: [unidade], degradado: false });
    expect(resolver).toHaveBeenCalledWith('HEMOSE', expect.any(AbortSignal));
    expect(http).not.toHaveBeenCalled();
  });

  it('normaliza busca textual e monta reverso apenas com as coordenadas validadas', async () => {
    const { http, service } = configurar();
    http.mockResolvedValueOnce(json(photon)).mockResolvedValueOnce(json(photon));
    expect((await service.buscar(buscar(' Praça   da Sé '), agora())).resultados).toHaveLength(1);
    expect((await service.reverso(reversoMapaSchema.parse({ lat: '-23.55', lon: '-46.63' }), agora())).resultados).toHaveLength(1);
    expect((http.mock.calls[0]?.[0] as URL).searchParams.get('q')).toBe('Praça da Sé');
    expect((http.mock.calls[1]?.[0] as URL).pathname).toBe('/reverse');
    const parametros = (http.mock.calls[1]?.[0] as URL).searchParams;
    expect(parametros.get('lon')).toBe('-46.63');
    expect(parametros.has('countrycode')).toBe(false);
  });

  it('valida o país do reverso após a consulta e não trata município como logradouro', async () => {
    const { http, service } = configurar();
    const cidade = (pais: string) => json({
      ...photon, features: [{ ...photon.features[0],
        properties: { type: 'city', name: 'Município Sintético', state: 'SE', countrycode: pais },
      }],
    });
    http.mockResolvedValueOnce(cidade('BR')).mockResolvedValueOnce(cidade('AR'));
    const reverso = (lat: string) => service.reverso(reversoMapaSchema.parse({ lat, lon: '0' }), agora());
    expect((await reverso('0')).resultados[0]).toMatchObject({ municipio: 'Município Sintético', logradouro: null, foraDeSergipe: false });
    expect(await reverso('1')).toEqual({ resultados: [], degradado: false });
  });

  it.each(['', '1234', '00000A00', '000000000'])('rejeita CEP inválido %s', (entrada) => {
    expect(buscarMapaSchema.safeParse({ cep: entrada }).success).toBe(false);
  });

  it.each(['ab', 'https://example.test', '–rua', 'Pessoa 123.456.789-00', 'Nome contato 9999', 'email@example.test'])(
    'recusa busca inválida ou com dados indevidos', (q) => {
      expect(buscarMapaSchema.safeParse({ q }).success).toBe(false);
    },
  );

  it('retorna rota viária polyline5 e preserva a sequência manual com retorno explícito', async () => {
    const { http, service } = configurar();
    http.mockResolvedValueOnce(json(osrm));
    const resultado = await service.rota(rota(['1,2', '3,4', '5,6', '7,8'], { retornarOrigem: 'true' }), agora());
    expect(resultado).toEqual({ metodo: 'OSRM', aproximada: false, distanciaMetros: 2510, formatoGeometria: 'polyline5', geometria: geometry });
    const url = http.mock.calls[0]?.[0] as URL;
    expect(url.pathname).toBe('/routed-car/route/v1/driving/2,1;4,3;6,5;8,7;2,1');
    expect(url.searchParams.get('geometries')).toBe('polyline');
  });

  it('preserva limite administrativo e permite mais paradas SVO até o limite técnico', () => {
    const pontos = Array.from({ length: 11 }, (_item, i) => '1,' + i);
    expect(rotaMapaSchema.safeParse({ pontos }).success).toBe(false);
    expect(rotaMapaSchema.safeParse({ pontos: pontos.slice(0, 10) }).success).toBe(true);
    expect(rota(pontos, { operacao: 'SVO' }).pontos).toHaveLength(11);
    expect(rotaMapaSchema.safeParse({ pontos: Array(50).fill('1,2'), operacao: 'SVO', retornarOrigem: 'true' }).success).toBe(false);
    expect(rotaMapaSchema.safeParse({ pontos: ['90.1,0', '1,0'] }).success).toBe(false);
  });

  it('recusa rota inteira com ponto vazio e evita distância parcial', async () => {
    const { http, service } = configurar();
    await expect(service.rota(rota(['0,0', '', '1,1']), agora())).rejects.toMatchObject({
      statusCode: 422, codigo: 'ROTA_SEM_COORDENADAS', contexto: { metodo: 'INDISPONIVEL', pontos: [1] },
    });
    expect(http).not.toHaveBeenCalled();
  });

  it.each([429, 502])('usa Haversine × 1,3 por todos os segmentos em falha OSRM %i', async (status) => {
    const { http, registrar, service } = configurar();
    http.mockResolvedValueOnce(json({}, status));
    const resultado = await service.rota(rota(['0,0', '0,2', '0,1'], { retornarOrigem: 'true' }), agora());
    expect(resultado).toEqual({
      metodo: 'HAVERSINE_APROXIMADO', aproximada: true, distanciaMetros: 578214, geometria: null, formatoGeometria: null,
    });
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ provedor: 'osrm', resultado: status === 429 ? '429' : 'http' }));
  });

  it.each(['NoRoute', 'NoSegment', 'TooBig'])('distingue resposta explícita %s de indisponibilidade técnica', async (code) => {
    const { http, service } = configurar();
    http.mockResolvedValueOnce(json({ code }, 400));
    await expect(service.rota(rota(['0,0', '0,1']), agora())).rejects.toMatchObject({
      statusCode: 422, codigo: code === 'TooBig' ? 'ROTA_LIMITE_PROVEDOR' : 'ROTA_INDISPONIVEL',
      contexto: { metodo: 'INDISPONIVEL' },
    });
  });

  it('limita novas chamadas OSRM por processo e entrega estimativa quando necessário', async () => {
    const { http, service } = configurar();
    http.mockResolvedValueOnce(json(osrm));
    expect((await service.rota(rota(['0,0', '0,1']), agora())).metodo).toBe('OSRM');
    expect((await service.rota(rota(['0,0', '0,2']), agora())).metodo).toBe('HAVERSINE_APROXIMADO');
    expect(http).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500])('trata falha Photon %i como busca degradada e reverso indisponível', async (status) => {
    const { http, service } = configurar();
    http.mockResolvedValueOnce(json({}, status));
    expect(await service.buscar(buscar('Praça da Sé'), agora())).toEqual({ resultados: [], degradado: true });
    await expect(service.reverso(reversoMapaSchema.parse({ lat: '0', lon: '0' }), agora())).rejects.toMatchObject({
      statusCode: 503, codigo: 'MAPAS_REVERSO_INDISPONIVEL',
    });
  });

  it('recusa JSON inválido, corpo excessivo e redirecionamento sem seguir a URL recebida', async () => {
    const { http, service } = configurar();
    http.mockResolvedValueOnce(new Response('{', { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(' '.repeat(400 * 1024), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://example.test' } }));
    for (let i = 0; i < 3; i++) {
      expect(await service.buscar(buscar('Via Teste'), agora())).toEqual({ resultados: [], degradado: true });
    }
    expect(http).toHaveBeenCalledTimes(3);
    for (const [url, opcoes] of http.mock.calls) {
      expect((url as URL).hostname).toBe('photon.komoot.io');
      expect(opcoes?.redirect).toBe('error');
    }
  });

  it('rejeita geometria truncada e não a inclui no fallback', async () => {
    const { http, service } = configurar();
    http.mockResolvedValueOnce(json({ code: 'Ok', routes: [{ distance: 15, geometry: '}}}}' }] }));
    expect(await service.rota(rota(['1,2', '2,3']), agora())).toMatchObject({ aproximada: true, geometria: null });
  });

  it('contabiliza hit/miss, normaliza a chave, expira em 24h e não grava falha transitória', async () => {
    let tempo = 0;
    const { http, service, registrar } = configurar(10500, () => tempo);
    http.mockResolvedValueOnce(json({}, 502)).mockResolvedValueOnce(json(photon)).mockResolvedValueOnce(json(photon));
    expect((await service.buscar(buscar('Via Teste'), agora())).degradado).toBe(true);
    expect((await service.buscar(buscar('Via Teste'), agora())).degradado).toBe(false);
    await service.buscar(buscar('  via   TESTE  '), agora());
    expect(http).toHaveBeenCalledTimes(2);
    expect(registrar).toHaveBeenCalledWith({ evento: 'mapas_cache', operacao: 'buscar', resultado: 'hit' });
    tempo += 24 * 60 * 60 * 1000;
    await service.buscar(buscar('Via Teste'), agora());
    expect(http).toHaveBeenCalledTimes(3);
  });

  it('deduplica concorrentes e o cancelamento de um cliente só remove sua assinatura', async () => {
    const { http, service, registrar } = configurar();
    let responder!: (res: Response) => void;
    http.mockImplementationOnce(() => new Promise((resolve) => { responder = resolve; }));
    const controle = new AbortController();
    const uma = service.buscar(buscar('Via Teste'), { prazoMs: 10000, sinal: controle.signal });
    const outra = service.buscar(buscar('via teste'), agora());
    controle.abort();
    await expect(uma).rejects.toMatchObject({ name: 'AbortError' });
    expect(http.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    responder(json(photon));
    await expect(outra).resolves.toMatchObject({ degradado: false });
    expect(http).toHaveBeenCalledTimes(1);
    expect(registrar).toHaveBeenCalledWith({ evento: 'mapas_cache', operacao: 'buscar', resultado: 'deduplicado' });
  });

  const esperarAbort = (_url: Parameters<typeof fetch>[0], opcoes?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const sinal = opcoes?.signal;
      sinal?.addEventListener('abort', () => reject(sinal.reason), { once: true });
    });

  it('cancela a chamada externa quando o último cliente fecha a conexão e limita a concorrência', async () => {
    const { http, service } = configurar();
    http.mockImplementation(esperarAbort);
    const controle = new AbortController();
    const clientes = Array.from({ length: 8 }, (_x, i) => service.buscar(buscar('Via Teste ' + i), {
      sinal: controle.signal, prazoMs: 10000,
    }));
    const encerradas = Promise.allSettled(clientes);
    await expect(service.buscar(buscar('Via Teste 10'), agora())).rejects.toMatchObject({ codigo: 'MAPAS_OCUPADOS' });
    controle.abort();
    expect((await encerradas).every(({ status }) => status === 'rejected')).toBe(true);
    expect(http.mock.calls.every((argumentos) => argumentos[1]?.signal?.aborted)).toBe(true);
  });

  it('cancela chamada individual após 3,5 s com orçamento global superior', async () => {
    const { http, service, registrar } = configurar();
    http.mockImplementation(esperarAbort);
    const inicio = performance.now();
    await expect(service.buscar(buscar('Via Teste'), agora())).resolves.toEqual({ degradado: true, resultados: [] });
    expect(performance.now() - inicio).toBeGreaterThanOrEqual(3400);
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ provedor: 'photon', resultado: 'timeout' }));
    expect(registrar).not.toHaveBeenCalledWith(expect.objectContaining({ evento: 'mapas_orcamento' }));
  }, 7000);

  it('reparte orçamento total com ViaCEP e Photon e cancela a cadeia no prazo', async () => {
    const { http, service, registrar } = configurar(240);
    http.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 70));
      return json(cep);
    }).mockImplementationOnce(esperarAbort);
    const inicio = performance.now();
    await expect(service.buscar(buscarMapaSchema.parse({ cep: '01001000' }), agora()))
      .resolves.toEqual({ degradado: true, resultados: [] });
    expect(performance.now() - inicio).toBeLessThan(1200);
    expect(http).toHaveBeenCalledTimes(2);
    expect(http.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    expect(registrar).toHaveBeenCalledWith({ evento: 'mapas_orcamento', operacao: 'buscar' });
  });

  it('valida o limite de cache e reserva margem no timeout do app', () => {
    const origem = { JWT_SECRET: 'chave-sintetica-exclusiva-de-teste-a9' };
    expect(carregarEnv(origem).mapas).toEqual({ entradas: 750, orcamentoMs: 10500 });
    expect(carregarEnv({ ...origem, REQUEST_TIMEOUT_MS: '5000', MAPAS_CACHE_ENTRADAS: '1000' }).mapas)
      .toEqual({ entradas: 1000, orcamentoMs: 4500 });
    expect(() => carregarEnv({ ...origem, MAPAS_CACHE_ENTRADAS: '499' })).toThrow('MAPAS_CACHE_ENTRADAS');
    expect(() => carregarEnv({ ...origem, REQUEST_TIMEOUT_MS: '5000', MAPAS_ORCAMENTO_MS: '5000' })).toThrow('MAPAS_ORCAMENTO_MS');
  });

  it('evicta por LRU e por memória, com recusa de uma entrada acima do teto', () => {
    const lru = new CacheMapas<string>(2);
    lru.guardar('1', 'a');
    lru.guardar('2', 'b');
    expect(lru.obter('1')).toBe('a');
    expect(lru.guardar('3', 'c')).toBe(1);
    expect(lru.obter('2')).toBeUndefined();
    const limitado = new CacheMapas<string>(5, Date.now, 600);
    limitado.guardar('a', 'x'.repeat(30));
    expect(limitado.guardar('b', 'y'.repeat(30))).toBe(1);
    expect(limitado.obter('a')).toBeUndefined();
    expect(limitado.guardar('c', 'z'.repeat(1000))).toBe(0);
    expect(limitado.obter('c')).toBeUndefined();
  });
});
