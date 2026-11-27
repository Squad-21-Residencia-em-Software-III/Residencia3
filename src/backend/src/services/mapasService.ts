import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../errors/AppError';
import {
  buscarMapaSchema, coordenadasSchema, reversoMapaSchema, rotaMapaSchema,
  unidadeMapaSchema, type CoordenadasMapa, type UnidadeMapa,
} from '../validators/mapasSchemas';
import { CacheMapas } from './mapasCache';
import { criarProvedoresMapa, FalhaProvedor, type RegistrarMetricaMapa, type RecursosProvedoresMapa } from './mapasProvedores';

type Operacao = 'buscar' | 'reverso' | 'rota';
type Photon = Awaited<ReturnType<RecursosProvedoresMapa['texto']>>;

export interface EnderecoMapa {
  fonte: 'viaCEP' | 'photon' | 'unidade';
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  estado: string | null;
  cep: string | null;
  coordenadas: CoordenadasMapa | null;
  foraDeSergipe: boolean | null;
}

export interface BuscaMapa {
  resultados: EnderecoMapa[];
  degradado: boolean;
}

export type RotaMapa =
  | { aproximada: false; metodo: 'osrm'; distanciaMetros: number; geometria: string; formatoGeometria: 'polyline5' }
  | { aproximada: true; metodo: 'haversine_1_3'; distanciaMetros: number; geometria: null; formatoGeometria: null };

type Resposta = BuscaMapa | RotaMapa;
type Solicitante = { sinal: AbortSignal; prazoMs: number };
type ConsultaEmCurso = { controle: AbortController; clientes: number; tarefa: Promise<Resposta> };

interface ConfiguracaoMapa {
  entradas: number;
  orcamentoMs: number;
  http?: typeof fetch;
  agora?: () => number;
  registrar?: RegistrarMetricaMapa;
  // SCRUM-274 fará a leitura das coordenadas verificadas no banco, no escopo permitido.
  consultarUnidade?: (unidade: UnidadeMapa, sinal: AbortSignal) => Promise<EnderecoMapa | null>;
}

function foraDeSergipe(estado: string | null): boolean | null {
  return estado === null ? null : !['se', 'br-se', 'sergipe'].includes(estado.trim().toLowerCase());
}

function normalizarPhoton(conteudo: Photon): EnderecoMapa[] {
  return conteudo.features.filter(({ properties }) => properties.countrycode === 'BR').map(({ properties, geometry }) => {
    const [longitude, latitude] = geometry.coordinates;
    const estado = properties.state || null;
    const nomeDaRegiao = ['city', 'state', 'country', 'county', 'district', 'locality'].includes(properties.type ?? '');
    return {
      fonte: 'photon',
      logradouro: properties.street || (nomeDaRegiao ? null : properties.name) || null,
      numero: properties.housenumber || null,
      bairro: properties.district || properties.locality || null,
      municipio: properties.city || (properties.type === 'city' ? properties.name : null) || null, estado,
      cep: properties.postcode || null,
      coordenadas: { latitude, longitude },
      foraDeSergipe: foraDeSergipe(estado),
    };
  });
}

const paraRad = (graus: number) => graus * Math.PI / 180;
function distanciaAproximada(pontos: CoordenadasMapa[]): number {
  let metros = 0;
  for (const [indice, ponto] of pontos.entries()) {
    const anterior = pontos[indice - 1];
    if (!anterior) continue;
    const lat1 = paraRad(anterior.latitude);
    const lat2 = paraRad(ponto.latitude);
    const seno = Math.sin((lat2 - lat1) / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(paraRad(ponto.longitude - anterior.longitude) / 2) ** 2;
    metros += 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, seno))));
  }
  return Math.round(metros * 1.3);
}

function aguardar(consulta: ConsultaEmCurso, sinal: AbortSignal, liberar: () => void): Promise<Resposta> {
  let abortar: () => void;
  consulta.clientes++;
  return new Promise<Resposta>((resolve, reject) => {
    abortar = () => reject(sinal.reason);
    sinal.addEventListener('abort', abortar, { once: true });
    if (sinal.aborted) abortar();
    void consulta.tarefa.then(resolve, reject);
  }).finally(() => {
    sinal.removeEventListener('abort', abortar);
    liberar();
  });
}

export function criarMapasService(config: ConfiguracaoMapa) {
  const agora = config.agora ?? Date.now;
  const registrar = config.registrar ?? ((metrica) => console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'INFO', ...metrica,
  })));
  const provedores = criarProvedoresMapa(config.http ?? ((...args) => fetch(...args)), registrar);
  const cache = new CacheMapas<Resposta>(config.entradas, agora);
  const emCurso = new Map<string, ConsultaEmCurso>();
  let ativas = 0;

  async function comCache<T extends Resposta>(operacao: Operacao, parametros: unknown, solicitante: Solicitante,
    consultar: (sinal: AbortSignal) => Promise<T>): Promise<T> {
    solicitante.sinal.throwIfAborted();
    const prazoMs = Math.min(solicitante.prazoMs, config.orcamentoMs);
    if (prazoMs <= 0) throw new AppError('Tempo insuficiente para consultar mapas.', 503, 'MAPAS_ORCAMENTO');
    const chave = createHash('sha256').update(JSON.stringify([operacao, parametros])).digest('base64url');
    const emCache = cache.obter(chave);
    if (emCache) {
      registrar({ evento: 'mapas_cache', operacao, resultado: 'hit' });
      return emCache as T;
    }

    let consulta = emCurso.get(chave);
    if (consulta) {
      registrar({ evento: 'mapas_cache', operacao, resultado: 'deduplicado' });
    } else {
      if (ativas >= 8) throw new AppError('Consultas a mapas temporariamente ocupadas.', 503, 'MAPAS_OCUPADOS');
      registrar({ evento: 'mapas_cache', operacao, resultado: 'miss' });
      const controle = new AbortController();
      const prazo = AbortSignal.timeout(prazoMs);
      const sinal = AbortSignal.any([prazo, controle.signal]);
      ativas++;
      const tarefa = consultar(sinal).then((valor) => {
        controle.signal.throwIfAborted();
        const reutilizavel = 'resultados' in valor
          ? !valor.degradado && valor.resultados.length > 0 && valor.resultados.every((item) => item.coordenadas !== null)
          : !valor.aproximada;
        if (reutilizavel && cache.guardar(chave, valor) > 0) {
          registrar({ evento: 'mapas_cache', operacao, resultado: 'eviccao' });
        }
        return valor;
      }).finally(() => {
        ativas--;
        if (prazo.aborted) registrar({ evento: 'mapas_orcamento', operacao });
        if (emCurso.get(chave)?.controle === controle) emCurso.delete(chave);
      });
      consulta = { controle, clientes: 0, tarefa };
      emCurso.set(chave, consulta);
    }

    const compartilhada = consulta;
    const sinalCliente = AbortSignal.any([solicitante.sinal, AbortSignal.timeout(solicitante.prazoMs + 100)]);
    const liberar = () => {
      compartilhada.clientes--;
      if (compartilhada.clientes === 0 && emCurso.get(chave) === compartilhada) {
        emCurso.delete(chave);
        compartilhada.controle.abort();
      }
    };
    try {
      return await aguardar(compartilhada, sinalCliente, liberar) as T;
    } catch (erro) {
      if (sinalCliente.aborted && !solicitante.sinal.aborted) {
        throw new AppError('Tempo insuficiente para consultar mapas.', 503, 'MAPAS_ORCAMENTO');
      }
      throw erro;
    }
  }

  async function buscar(query: z.infer<typeof buscarMapaSchema>, solicitante: Solicitante): Promise<BuscaMapa> {
    const alias = unidadeMapaSchema.safeParse(query.unidade ?? query.q?.toUpperCase());
    if (alias.success) {
      return comCache('buscar', ['unidade', alias.data], solicitante, async (sinal) => {
        const unidade = await config.consultarUnidade?.(alias.data, sinal);
        return {
          resultados: unidade && coordenadasSchema.safeParse(unidade.coordenadas).success ? [unidade] : [],
          degradado: false,
        };
      });
    }
    return comCache('buscar', [query.cep, query.q?.toLocaleLowerCase('pt-BR')], solicitante, async (sinal) => {
      try {
        if (!query.cep) {
          return { resultados: normalizarPhoton(await provedores.texto(query.q!, sinal)), degradado: false };
        }
        const endereco = await provedores.viaCep(query.cep, sinal);
        if ('erro' in endereco) return { resultados: [], degradado: false };
        const estruturado = await provedores.estruturado(endereco, sinal);
        const estado = endereco.estado || endereco.uf;
        const candidatos = estruturado.features.length > 0 ? estruturado : await provedores.texto(
          [endereco.logradouro, endereco.bairro, endereco.localidade, estado, endereco.cep].filter(Boolean).join(', '), sinal,
        );
        const resultados = normalizarPhoton(candidatos);
        return {
          resultados: resultados.length > 0 ? resultados : [{
            fonte: 'viaCEP', logradouro: endereco.logradouro || null, numero: null, bairro: endereco.bairro || null,
            municipio: endereco.localidade, estado, cep: endereco.cep, coordenadas: null, foraDeSergipe: foraDeSergipe(estado),
          }],
          degradado: false,
        };
      } catch (erro) {
        if (!(erro instanceof FalhaProvedor)) throw erro;
        return { resultados: [], degradado: true };
      }
    });
  }

  async function reverso(query: z.infer<typeof reversoMapaSchema>, solicitante: Solicitante): Promise<BuscaMapa> {
    const coordenadas = { latitude: query.lat, longitude: query.lon };
    return comCache('reverso', coordenadas, solicitante, async (sinal) => {
      try {
        const resultados = normalizarPhoton(await provedores.reverso(coordenadas, sinal));
        return { resultados, degradado: false };
      } catch (erro) {
        if (!(erro instanceof FalhaProvedor)) throw erro;
        throw new AppError('Consulta reversa indisponível. Informe o endereço manualmente.', 503, 'MAPAS_REVERSO_INDISPONIVEL');
      }
    });
  }

  async function rota(query: z.infer<typeof rotaMapaSchema>, solicitante: Solicitante): Promise<RotaMapa> {
    const faltantes = query.pontos.flatMap((ponto, indice) => ponto === null ? [indice] : []);
    if (faltantes.length > 0) {
      throw new AppError('A rota completa exige coordenadas de todos os pontos.', 422, 'ROTA_SEM_COORDENADAS', { pontos: faltantes });
    }
    const pontos = query.pontos.filter((ponto) => ponto !== null);
    if (query.retornarOrigem) pontos.push(pontos[0]!);
    return comCache('rota', pontos, solicitante, async (sinal) => {
      let resposta: Awaited<ReturnType<typeof provedores.rota>>;
      try {
        resposta = await provedores.rota(pontos, sinal);
      } catch (erro) {
        if (!(erro instanceof FalhaProvedor)) throw erro;
        return { aproximada: true, metodo: 'haversine_1_3', distanciaMetros: distanciaAproximada(pontos), geometria: null, formatoGeometria: null };
      }

      if (resposta.code === 'TooBig') {
        throw new AppError('O provedor não comporta a sequência pedida.', 422, 'ROTA_LIMITE_PROVEDOR');
      }
      if (resposta.code !== 'Ok') {
        throw new AppError('Não foi encontrada rota rodoviária para os pontos informados.', 422, 'ROTA_INDISPONIVEL');
      }
      const rota = resposta.routes[0]!;
      return {
        aproximada: false, metodo: 'osrm', distanciaMetros: Math.round(rota.distance),
        geometria: rota.geometry, formatoGeometria: 'polyline5',
      };
    });
  }

  return { buscar, reverso, rota };
}
