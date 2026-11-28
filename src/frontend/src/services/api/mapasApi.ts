import { ApiError, request } from './http';
import type {
  CoordenadaMapa,
  EnderecoMapa,
  OperacaoMapa,
  RespostaBuscaMapa,
  RespostaRotaMapa,
  UnidadeInstitucional,
} from '../../types/mapa';
import {
  arredondarCoordenada,
  consultaTextoValidaParaBusca,
  extrairCepValido,
  normalizarConsultaTexto,
} from '../../utils/localizacaoMapa';

export interface ParametrosBuscaMapa {
  operacao?: OperacaoMapa;
  q?: string;
  cep?: string;
  unidade?: UnidadeInstitucional;
  modoPublico?: boolean;
  signal?: AbortSignal;
}

export interface ParametrosReversoMapa {
  lat: number;
  lon: number;
  operacao?: OperacaoMapa;
  modoPublico?: boolean;
  signal?: AbortSignal;
}

export interface ParametrosRotaMapa {
  pontos: (CoordenadaMapa | null)[];
  operacao?: OperacaoMapa;
  retornarOrigem?: boolean;
  signal?: AbortSignal;
}

const erroDto = () => new ApiError('Resposta cartográfica inválida.', 502, [], 'MAPAS_RESPOSTA_INVALIDA');
const erroConsulta = () => new ApiError('Consulta cartográfica inválida.', 400, [], 'MAPAS_CONSULTA_INVALIDA');

function registro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function numeroNaFaixa(valor: unknown, limite: number): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && Math.abs(valor) <= limite;
}

function coordenadaValida(ponto: unknown): ponto is CoordenadaMapa {
  return registro(ponto) && numeroNaFaixa(ponto.latitude, 90) && numeroNaFaixa(ponto.longitude, 180);
}

const camposEndereco = ['logradouro', 'numero', 'bairro', 'municipio', 'estado', 'cep'] as const;

function enderecoValido(dados: unknown): dados is EnderecoMapa {
  return registro(dados) &&
    (dados.fonte === 'photon' || dados.fonte === 'viaCEP' || dados.fonte === 'unidade') &&
    camposEndereco.every((campo) => dados[campo] === null || typeof dados[campo] === 'string') &&
    (dados.foraDeSergipe === null || typeof dados.foraDeSergipe === 'boolean') &&
    (dados.coordenadas === null || coordenadaValida(dados.coordenadas));
}

function validarBusca(dados: unknown): RespostaBuscaMapa {
  if (!registro(dados) || typeof dados.degradado !== 'boolean' ||
      !Array.isArray(dados.resultados) || !dados.resultados.every(enderecoValido)) throw erroDto();
  return { degradado: dados.degradado, resultados: dados.resultados };
}

function validarRota(dados: unknown): RespostaRotaMapa {
  if (!registro(dados) || typeof dados.distanciaMetros !== 'number' ||
      !Number.isFinite(dados.distanciaMetros) || dados.distanciaMetros < 0) throw erroDto();
  const { distanciaMetros, geometria } = dados;
  if (dados.aproximada === true && dados.metodo === 'HAVERSINE_APROXIMADO' &&
      geometria === null && dados.formatoGeometria === null) {
    return { aproximada: true, metodo: 'HAVERSINE_APROXIMADO', distanciaMetros, geometria, formatoGeometria: null };
  }
  if (dados.aproximada === false && dados.metodo === 'OSRM' &&
      typeof geometria === 'string' && geometria.length > 0 && dados.formatoGeometria === 'polyline5') {
    return { aproximada: false, metodo: 'OSRM', distanciaMetros, geometria, formatoGeometria: 'polyline5' };
  }
  throw erroDto();
}

export const mapasApi = {
  /**
   * Geocodificação direta (texto, CEP ou atalho de unidade) via proxy do backend.
   * No `modoPublico`, usa `/portal-svo/mapas/buscar` apenas para CEP (sem cookies nem Bearer).
   */
  async buscar(params: ParametrosBuscaMapa): Promise<RespostaBuscaMapa> {
    const operacao = params.operacao ?? 'ADM';

    if (params.modoPublico) {
      const cepLimpo = params.cep ? extrairCepValido(params.cep) : null;
      if (!cepLimpo) {
        return Promise.reject(
          new ApiError(
            'No portal público, informe um CEP de 8 dígitos ou preencha o endereço manualmente.',
            400,
            [],
            'MAPAS_MODO_PUBLICO_APENAS_CEP',
          ),
        );
      }
      if (params.q !== undefined || params.unidade !== undefined) throw erroConsulta();
      return validarBusca(await request<unknown>('GET', '/portal-svo/mapas/buscar', {
        query: { cep: cepLimpo }, signal: params.signal, publico: true,
      }));
    }

    if ([params.unidade, params.cep, params.q].filter((item) => item !== undefined).length !== 1) throw erroConsulta();
    const query: Record<string, string | undefined> = { operacao };
    if (params.unidade) {
      if (!['HEMOSE', 'SVO', 'LACEN'].includes(params.unidade)) throw erroConsulta();
      query.unidade = params.unidade;
    } else if (params.cep) {
      const cep = extrairCepValido(params.cep);
      if (!cep) throw erroConsulta();
      query.cep = cep;
    } else if (params.q) {
      if (!consultaTextoValidaParaBusca(params.q)) throw erroConsulta();
      query.q = normalizarConsultaTexto(params.q);
    }

    return validarBusca(await request<unknown>('GET', '/mapas/buscar', {
      query,
      signal: params.signal,
    }));
  },

  /**
   * Geocodificação reversa (coordenada -> endereço) via proxy do backend.
   */
  async reverso(params: ParametrosReversoMapa): Promise<RespostaBuscaMapa> {
    if (!numeroNaFaixa(params.lat, 90) || !numeroNaFaixa(params.lon, 180)) throw erroConsulta();
    const lat = arredondarCoordenada(params.lat);
    const lon = arredondarCoordenada(params.lon);

    if (params.modoPublico) {
      return validarBusca(await request<unknown>('GET', '/portal-svo/mapas/reverso', {
        query: { lat, lon }, signal: params.signal, publico: true,
      }));
    }

    return validarBusca(await request<unknown>('GET', '/mapas/reverso', {
      query: {
        operacao: params.operacao ?? 'ADM',
        lat,
        lon,
      },
      signal: params.signal,
    }));
  },

  /**
   * Cálculo de rota rodoviária (OSRM com fallback Haversine) via proxy do backend.
   */
  async calcularRota(params: ParametrosRotaMapa): Promise<RespostaRotaMapa> {
    if (params.pontos.filter(coordenadaValida).length < 2 ||
        params.pontos.some((ponto) => ponto !== null && !coordenadaValida(ponto))) throw erroConsulta();
    const searchParams = new URLSearchParams();
    searchParams.set('operacao', params.operacao ?? 'ADM');
    searchParams.set('retornarOrigem', String(Boolean(params.retornarOrigem)));

    for (const ponto of params.pontos) {
      if (ponto === null) {
        searchParams.append('pontos', '');
      } else {
        searchParams.append(
          'pontos',
          `${arredondarCoordenada(ponto.latitude)},${arredondarCoordenada(ponto.longitude)}`,
        );
      }
    }

    return validarRota(await request<unknown>('GET', `/mapas/rota?${searchParams.toString()}`, {
      signal: params.signal,
    }));
  },
};
