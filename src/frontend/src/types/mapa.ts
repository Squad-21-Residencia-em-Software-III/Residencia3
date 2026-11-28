import type { CoordenadaMapa } from '../config/mapas';

export type { CoordenadaMapa };

export type OperacaoMapa = 'ADM' | 'SVO';

export type UnidadeInstitucional = 'HEMOSE' | 'SVO' | 'LACEN';

export type FonteEnderecoMapa = 'viaCEP' | 'photon' | 'unidade';

export interface EnderecoMapa {
  fonte: FonteEnderecoMapa;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  estado: string | null;
  cep: string | null;
  coordenadas: CoordenadaMapa | null;
  foraDeSergipe: boolean | null;
}

export interface RespostaBuscaMapa {
  resultados: EnderecoMapa[];
  degradado: boolean;
}

export type RespostaRotaMapa =
  | {
      aproximada: false;
      metodo: 'OSRM';
      distanciaMetros: number;
      geometria: string;
      formatoGeometria: 'polyline5';
    }
  | {
      aproximada: true;
      metodo: 'HAVERSINE_APROXIMADO';
      distanciaMetros: number;
      geometria: null;
      formatoGeometria: null;
    };

export type OrigemLocalSelecionado = 'busca' | 'cep' | 'unidade' | 'mapa' | 'gps' | 'manual';

export interface LocalSelecionado {
  endereco: string;
  coordenadas: CoordenadaMapa | null;
  detalhes?: Partial<Omit<EnderecoMapa, 'coordenadas'>>;
  foraDeSergipe: boolean | null;
  origem: OrigemLocalSelecionado;
}
