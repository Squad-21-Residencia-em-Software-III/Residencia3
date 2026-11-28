import { ApiError, CODIGO_CANCELADO, request } from './http';
import type {
  CoordenadaMapa,
  OperacaoMapa,
  RespostaBuscaMapa,
  RespostaRotaMapa,
  UnidadeInstitucional,
} from '../../types/mapa';
import {
  arredondarCoordenada,
  extrairCepValido,
  normalizarConsultaTexto,
} from '../../utils/localizacaoMapa';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

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

async function requestPublicoMapa<T>(
  caminho: string,
  query: Record<string, string | number | undefined>,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(`${BASE_URL}${caminho}`, window.location.origin);
  for (const [chave, valor] of Object.entries(query)) {
    if (valor !== undefined && valor !== '') {
      url.searchParams.set(chave, String(valor));
    }
  }

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      signal,
    });
  } catch {
    if (signal?.aborted) {
      throw new ApiError('A consulta foi cancelada.', 0, [], CODIGO_CANCELADO);
    }
    throw new ApiError('Não foi possível conectar ao servidor. Verifique sua conexão.', 0);
  }

  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const semCorpo = dados === null && resposta.status >= 500;
    throw new ApiError(
      dados?.erro ??
        (semCorpo
          ? 'Servidor indisponível. Tente novamente em instantes.'
          : 'Erro ao consultar o mapa.'),
      resposta.status,
      dados?.detalhes ?? [],
      typeof dados?.codigo === 'string' ? dados.codigo : undefined,
      dados?.contexto,
    );
  }

  return dados as T;
}

export const mapasApi = {
  /**
   * Geocodificação direta (texto, CEP ou atalho de unidade) via proxy do backend.
   * No `modoPublico`, usa `/portal-svo/mapas/buscar` apenas para CEP (sem cookies nem Bearer).
   */
  buscar(params: ParametrosBuscaMapa): Promise<RespostaBuscaMapa> {
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
      return requestPublicoMapa<RespostaBuscaMapa>(
        '/portal-svo/mapas/buscar',
        { cep: cepLimpo },
        params.signal,
      );
    }

    const query: Record<string, string | undefined> = { operacao };
    if (params.unidade) {
      query.unidade = params.unidade;
    } else if (params.cep) {
      query.cep = extrairCepValido(params.cep) ?? params.cep.trim();
    } else if (params.q) {
      query.q = normalizarConsultaTexto(params.q);
    }

    return request<RespostaBuscaMapa>('GET', '/mapas/buscar', {
      query,
      signal: params.signal,
    });
  },

  /**
   * Geocodificação reversa (coordenada -> endereço) via proxy do backend.
   */
  reverso(params: ParametrosReversoMapa): Promise<RespostaBuscaMapa> {
    const lat = arredondarCoordenada(params.lat);
    const lon = arredondarCoordenada(params.lon);

    if (params.modoPublico) {
      return requestPublicoMapa<RespostaBuscaMapa>(
        '/portal-svo/mapas/reverso',
        { lat, lon },
        params.signal,
      );
    }

    return request<RespostaBuscaMapa>('GET', '/mapas/reverso', {
      query: {
        operacao: params.operacao ?? 'ADM',
        lat,
        lon,
      },
      signal: params.signal,
    });
  },

  /**
   * Cálculo de rota rodoviária (OSRM com fallback Haversine) via proxy do backend.
   */
  calcularRota(params: ParametrosRotaMapa): Promise<RespostaRotaMapa> {
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

    return request<RespostaRotaMapa>('GET', `/mapas/rota?${searchParams.toString()}`, {
      signal: params.signal,
    });
  },
};
