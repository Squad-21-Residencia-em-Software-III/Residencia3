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

export type TipoPontoRota = 'ORIGEM' | 'PARADA' | 'DESTINO' | 'RETORNO';

export interface PontoRotaMapa {
  id?: string;
  tipo: TipoPontoRota;
  /** Número sequencial exibido nas paradas intermediárias (1..N). */
  ordem?: number;
  rotulo: string;
  endereco?: string | null;
  coordenadas: CoordenadaMapa | null;
}

export type MetodoDistanciaRota = 'OSRM' | 'HAVERSINE_APROXIMADO' | 'INDISPONIVEL';

export interface RotaPlanejadaMapa {
  geometria?: string | null;
  formatoGeometria?: 'polyline5' | null;
  distanciaMetros?: number | null;
  metodo?: MetodoDistanciaRota;
  aproximada?: boolean;
}

export type TipoCheckpointGps = 'SAIDA' | 'PARADA' | 'CHEGADA' | 'INTERMEDIARIO';

export interface CheckpointGpsMapa {
  id: string;
  rotulo: string;
  horario: string;
  coordenadas: CoordenadaMapa;
  precisaoMetros?: number | null;
  tipo?: TipoCheckpointGps;
}

export type TipoTrechoHistorico = 'OBSERVADO' | 'ESTIMADO';

export interface TrechoHistoricoMapa {
  id: string;
  tipo: TipoTrechoHistorico;
  pontos: CoordenadaMapa[];
}

export interface LacunaGpsMapa {
  id: string;
  inicioEm: string;
  fimEm: string;
  motivo?: string | null;
}

export interface HistoricoGeograficoMapa {
  checkpoints?: CheckpointGpsMapa[];
  trechos?: TrechoHistoricoMapa[];
  lacunas?: LacunaGpsMapa[];
}

export interface OdometroRotaMapa {
  kmInicial: number | null;
  kmFinal: number | null;
}
