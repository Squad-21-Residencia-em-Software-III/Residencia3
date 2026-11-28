import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { type CoordenadasMapa } from '../validators/mapasSchemas';

export const TIMEOUT_PROVEDOR_MS = 3500;
const LIMITE_RESPOSTA_BYTES = 384 * 1024;
const AGENTE = 'FSPH-Mapas/1.0 (+https://github.com/Squad-21-Residencia-em-Software-III/Residencia3)';

export const PROVEDORES = {
  viacep: 'https://viacep.com.br',
  photon: 'https://photon.komoot.io',
  osrm: 'https://routing.openstreetmap.de',
} as const;
type Provedor = keyof typeof PROVEDORES;
type Falha = 'timeout' | '429' | 'http' | 'resposta_invalida' | 'rede' | 'limite_local';
export type MetricaMapa =
  | { evento: 'mapas_provedor'; provedor: Provedor; resultado: Falha | 'ok'; duracaoMs: number }
  | { evento: 'mapas_cache'; operacao: 'buscar' | 'reverso' | 'rota'; resultado: 'hit' | 'miss' | 'deduplicado' | 'eviccao' }
  | { evento: 'mapas_orcamento'; operacao: 'buscar' | 'reverso' | 'rota' };
export type RegistrarMetricaMapa = (metrica: MetricaMapa) => void;

export class FalhaProvedor extends Error {
  constructor(readonly tipo: Falha) { super(tipo); }
}

async function lerJsonLimitado(resposta: Response, sinal: AbortSignal): Promise<unknown> {
  const limiteDeclarado = Number(resposta.headers.get('content-length'));
  const tipo = resposta.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (limiteDeclarado > LIMITE_RESPOSTA_BYTES || tipo !== 'application/json' || !resposta.body) {
    throw new FalhaProvedor('resposta_invalida');
  }
  const leitor = resposta.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let json = '';
  try {
    while (true) {
      sinal.throwIfAborted();
      const { value, done } = await leitor.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > LIMITE_RESPOSTA_BYTES) throw new FalhaProvedor('resposta_invalida');
      json += decoder.decode(value, { stream: true });
    }
    sinal.throwIfAborted();
    return JSON.parse(json + decoder.decode()) as unknown;
  } catch (erro) {
    void leitor.cancel().catch(() => {});
    throw erro;
  } finally {
    leitor.releaseLock();
  }
}

const texto = z.string().max(160);
const cepViaCep = z.object({
  cep: z.string().regex(/^\d{5}-\d{3}$/),
  logradouro: texto,
  bairro: texto,
  localidade: texto.min(1),
  uf: z.string().regex(/^[A-Z]{2}$/),
  estado: texto.optional(),
});

const viaCepSchema = z.union([z.object({ erro: z.union([z.literal(true), z.literal('true')]) }), cepViaCep]);

const photonSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.object({
    type: z.literal('Feature'),
    geometry: z.object({
      type: z.literal('Point'),
      coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
    }),
    properties: z.object({
      street: texto.optional(), name: texto.optional(), housenumber: texto.optional(),
      district: texto.optional(), locality: texto.optional(), city: texto.optional(),
      state: texto.optional(), postcode: texto.optional(), countrycode: z.string().regex(/^[A-Z]{2}$/).optional(),
      type: texto.optional(),
    }),
  })).max(5),
});

function polyline5Valida(geometria: string): boolean {
  let valor = 0;
  let shift = 0;
  const acumuladas = [0, 0] as [number, number];
  let componentes = 0;
  for (let i = 0; i < geometria.length; i++) {
    const byte = geometria.charCodeAt(i) - 63;
    if (byte < 0 || byte > 63 || shift > 25) return false;
    valor += (byte & 31) * 2 ** shift;
    if (byte & 32) {
      shift += 5;
      continue;
    }
    const eixo = componentes % 2 as 0 | 1;
    acumuladas[eixo] += (valor % 2 ? -(valor + 1) : valor) / 2;
    if (Math.abs(acumuladas[eixo]) > (eixo === 0 ? 90 : 180) * 100000) return false;
    componentes++;
    valor = 0;
    shift = 0;
  }
  return shift === 0 && componentes >= 4 && componentes % 2 === 0;
}

const osrmSemRotaSchema = z.object({ code: z.enum(['NoRoute', 'NoSegment', 'TooBig']) });
const osrmSchema = z.discriminatedUnion('code', [
  z.object({ code: z.literal('Ok'), routes: z.array(z.object({
    distance: z.number().nonnegative().max(1e9),
    duration: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    geometry: z.string().min(4).max(256 * 1024).refine(polyline5Valida),
  })).length(1) }),
  osrmSemRotaSchema,
]);

type EnderecoViaCep = z.infer<typeof cepViaCep>;
export type RecursosProvedoresMapa = ReturnType<typeof criarProvedoresMapa>;

export function criarProvedoresMapa(http: typeof fetch, registrar: RegistrarMetricaMapa) {
  const ultimasChamadas: Record<Provedor, number[]> = { osrm: [], photon: [], viacep: [] };
  const consultasPorMinuto = { osrm: 30, photon: 60, viacep: 30 };
  const bloqueadoAte: Partial<Record<Provedor, number>> = {};
  const vies = { lat: '-10.9472', lon: '-37.0731', zoom: '10', countrycode: 'BR' };
  async function consultar<T>(provedor: Provedor, caminho: string, params: Record<string, string>,
    schema: z.ZodType<T>, sinalOperacao: AbortSignal): Promise<T> {
    const inicio = performance.now();
    const timeout = AbortSignal.timeout(TIMEOUT_PROVEDOR_MS);
    const signal = AbortSignal.any([sinalOperacao, timeout]);
    let resposta: Response | undefined;
    let resultado: Falha | 'ok' = 'rede';
    try {
      signal.throwIfAborted();
      const ultimas = ultimasChamadas[provedor].filter((instante) => instante > inicio - 60000);
      if (inicio < (bloqueadoAte[provedor] ?? 0) || ultimas.length >= consultasPorMinuto[provedor] ||
        (provedor === 'osrm' && (ultimas.at(-1) ?? -Infinity) > inicio - 1000)) {
        throw new FalhaProvedor('limite_local');
      }
      ultimasChamadas[provedor] = [...ultimas, inicio];
      const url = new URL(PROVEDORES[provedor]);
      url.pathname = caminho;
      url.search = new URLSearchParams(params).toString();
      resposta = await http(url, {
        signal, redirect: 'error',
        headers: { Accept: 'application/json', 'User-Agent': AGENTE },
      });
      if (resposta.status === 429) {
        const espera = Number(resposta.headers.get('retry-after'));
        bloqueadoAte[provedor] = performance.now() + Math.min(3600, Math.max(5, espera || 0)) * 1000;
        throw new FalhaProvedor('429');
      }
      if (!resposta.ok && !(provedor === 'osrm' && resposta.status === 400)) {
        throw new FalhaProvedor('http');
      }
      resultado = 'resposta_invalida';
      const dados = await lerJsonLimitado(resposta, signal);
      if (!resposta.ok && !osrmSemRotaSchema.safeParse(dados).success) throw new FalhaProvedor('resposta_invalida');
      const leitura = schema.safeParse(dados);
      if (!leitura.success) throw new FalhaProvedor('resposta_invalida');
      resultado = 'ok';
      return leitura.data;
    } catch (erro) {
      if (signal.aborted) resultado = 'timeout';
      else if (erro instanceof FalhaProvedor) resultado = erro.tipo;
      throw new FalhaProvedor(resultado === 'ok' ? 'rede' : resultado);
    } finally {
      if (resposta?.body && !resposta.body.locked && !resposta.bodyUsed) void resposta.body.cancel().catch(() => {});
      registrar({ evento: 'mapas_provedor', provedor, resultado, duracaoMs: Math.round(performance.now() - inicio) });
    }
  }

  return {
    viaCep: (cep: string, sinal: AbortSignal) => consultar('viacep', '/ws/' + cep + '/json/', {},
      viaCepSchema.refine((endereco) => 'erro' in endereco || endereco.cep.replace('-', '') === cep), sinal),
    estruturado: (endereco: EnderecoViaCep, sinal: AbortSignal) => consultar('photon', '/structured', {
      ...vies,
      ...(endereco.logradouro ? { street: endereco.logradouro } : {}),
      city: endereco.localidade, state: endereco.estado || endereco.uf, postcode: endereco.cep, limit: '5',
    }, photonSchema, sinal),
    texto: (q: string, sinal: AbortSignal) => consultar('photon', '/api', { ...vies, q, limit: '5' }, photonSchema, sinal),
    reverso: ({ latitude, longitude }: CoordenadasMapa, sinal: AbortSignal) => consultar('photon', '/reverse',
      { lat: String(latitude), lon: String(longitude), limit: '1' }, photonSchema, sinal),
    rota: (pontos: readonly CoordenadasMapa[], sinal: AbortSignal) => consultar('osrm',
      '/routed-car/route/v1/driving/' + pontos.map(({ longitude, latitude }) => longitude + ',' + latitude).join(';'),
      { overview: 'full', geometries: 'polyline', generate_hints: 'false', skip_waypoints: 'true' }, osrmSchema, sinal),
  };
}
