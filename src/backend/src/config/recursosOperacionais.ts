export const VARIAVEIS_RECURSOS_OPERACIONAIS = {
  mapasInternos: 'MAPAS_INTERNOS_ATIVOS',
  multiplasParadas: 'MULTIPLAS_PARADAS_ATIVAS',
  mapasSvo: 'MAPAS_SVO_ATIVOS',
  portalSvo: 'PORTAL_SVO_ATIVO',
  acompanhamentoExterno: 'ACOMPANHAMENTO_EXTERNO_SVO_ATIVO',
  gpsObrigatorio: 'GPS_OBRIGATORIO_ATIVO',
  emergenciaGps: 'EMERGENCIA_GPS_ATIVA',
  capturaPeriodica: 'CAPTURA_PERIODICA_GPS_ATIVA',
  confirmacaoAutomatica: 'CONFIRMACAO_AUTOMATICA_PARADAS_ATIVA',
  retencaoGpsCheckpoints: 'RETENCAO_GPS_CHECKPOINTS_ATIVA',
  retencaoGpsIntermediarios: 'RETENCAO_GPS_INTERMEDIARIOS_ATIVA',
  retencaoExterna: 'RETENCAO_SOLICITACOES_EXTERNAS_SVO_ATIVA',
} as const;

export type RecursoOperacional = keyof typeof VARIAVEIS_RECURSOS_OPERACIONAIS;
export type FlagsOperacionais = Readonly<Record<RecursoOperacional, boolean>>;
const RECURSOS = Object.keys(VARIAVEIS_RECURSOS_OPERACIONAIS) as RecursoOperacional[];

const AUTORIZACOES = {
  emergenciaGps: ['EMERGENCIA_GPS_AUTORIZADA'],
  confirmacaoAutomatica: ['PARAMETROS_CONFIRMACAO_PARADAS_HOMOLOGADOS'],
  retencaoGpsCheckpoints: ['RETENCAO_GPS_CHECKPOINTS_INVENTARIO_VALIDADO', 'RETENCAO_GPS_CHECKPOINTS_SIMULACAO_VALIDADA', 'RETENCAO_GPS_CHECKPOINTS_AUTORIZADA'],
  retencaoGpsIntermediarios: ['RETENCAO_GPS_INTERMEDIARIOS_INVENTARIO_VALIDADO', 'RETENCAO_GPS_INTERMEDIARIOS_SIMULACAO_VALIDADA', 'RETENCAO_GPS_INTERMEDIARIOS_AUTORIZADA'],
  retencaoExterna: ['RETENCAO_SOLICITACOES_EXTERNAS_SVO_INVENTARIO_VALIDADO', 'RETENCAO_SOLICITACOES_EXTERNAS_SVO_SIMULACAO_VALIDADA', 'RETENCAO_SOLICITACOES_EXTERNAS_SVO_AUTORIZADA'],
} as const;

type VariavelOperacional = (typeof VARIAVEIS_RECURSOS_OPERACIONAIS)[RecursoOperacional]
  | (typeof AUTORIZACOES)[keyof typeof AUTORIZACOES][number];

// Aliases temporários para implantações existentes. Consulte docs/configuracao-recursos-operacionais.md.
const ALIASES_LEGADOS: Readonly<Record<VariavelOperacional, string>> = {
  MAPAS_INTERNOS_ATIVOS: 'FASE3_MAPAS_INTERNOS',
  MULTIPLAS_PARADAS_ATIVAS: 'FASE3_MULTIPLAS_PARADAS',
  MAPAS_SVO_ATIVOS: 'FASE3_MAPAS_SVO',
  PORTAL_SVO_ATIVO: 'FASE3_PORTAL_SVO',
  ACOMPANHAMENTO_EXTERNO_SVO_ATIVO: 'FASE3_ACOMPANHAMENTO_EXTERNO',
  GPS_OBRIGATORIO_ATIVO: 'FASE3_GPS_OBRIGATORIO',
  EMERGENCIA_GPS_ATIVA: 'FASE3_EMERGENCIA_GPS',
  CAPTURA_PERIODICA_GPS_ATIVA: 'FASE3_CAPTURA_PERIODICA',
  CONFIRMACAO_AUTOMATICA_PARADAS_ATIVA: 'FASE3_CONFIRMACAO_AUTOMATICA',
  RETENCAO_GPS_CHECKPOINTS_ATIVA: 'FASE3_RETENCAO_GPS_CHECKPOINTS',
  RETENCAO_GPS_INTERMEDIARIOS_ATIVA: 'FASE3_RETENCAO_GPS_INTERMEDIARIOS',
  RETENCAO_SOLICITACOES_EXTERNAS_SVO_ATIVA: 'FASE3_RETENCAO_EXTERNA',
  EMERGENCIA_GPS_AUTORIZADA: 'FASE3_EMERGENCIA_GPS_AUTORIZADA',
  PARAMETROS_CONFIRMACAO_PARADAS_HOMOLOGADOS: 'FASE3_PARAMETROS_CONFIRMACAO_HOMOLOGADOS',
  RETENCAO_GPS_CHECKPOINTS_INVENTARIO_VALIDADO: 'FASE3_RETENCAO_GPS_CHECKPOINTS_INVENTARIO_VALIDADO',
  RETENCAO_GPS_CHECKPOINTS_SIMULACAO_VALIDADA: 'FASE3_RETENCAO_GPS_CHECKPOINTS_SIMULACAO_VALIDADA',
  RETENCAO_GPS_CHECKPOINTS_AUTORIZADA: 'FASE3_RETENCAO_GPS_CHECKPOINTS_AUTORIZADA',
  RETENCAO_GPS_INTERMEDIARIOS_INVENTARIO_VALIDADO: 'FASE3_RETENCAO_GPS_INTERMEDIARIOS_INVENTARIO_VALIDADO',
  RETENCAO_GPS_INTERMEDIARIOS_SIMULACAO_VALIDADA: 'FASE3_RETENCAO_GPS_INTERMEDIARIOS_SIMULACAO_VALIDADA',
  RETENCAO_GPS_INTERMEDIARIOS_AUTORIZADA: 'FASE3_RETENCAO_GPS_INTERMEDIARIOS_AUTORIZADA',
  RETENCAO_SOLICITACOES_EXTERNAS_SVO_INVENTARIO_VALIDADO: 'FASE3_RETENCAO_EXTERNA_INVENTARIO_VALIDADO',
  RETENCAO_SOLICITACOES_EXTERNAS_SVO_SIMULACAO_VALIDADA: 'FASE3_RETENCAO_EXTERNA_SIMULACAO_VALIDADA',
  RETENCAO_SOLICITACOES_EXTERNAS_SVO_AUTORIZADA: 'FASE3_RETENCAO_EXTERNA_AUTORIZADA',
};

const DEPENDENCIAS = {
  emergenciaGps: ['gpsObrigatorio'],
  confirmacaoAutomatica: ['multiplasParadas', 'capturaPeriodica'],
} as const;

export function carregarRecursosOperacionais(origem: Record<string, string | undefined>) {
  const invalidas: string[] = [];
  const conflitantes: string[] = [];
  const bloqueadas: RecursoOperacional[] = [];
  const ler = (nome: VariavelOperacional) => {
    const alias = ALIASES_LEGADOS[nome];
    const atual = origem[nome];
    const legado = origem[alias];
    for (const [chave, valor] of [[nome, atual], [alias, legado]] as const) {
      if (valor !== undefined && valor !== '' && valor !== 'true' && valor !== 'false') invalidas.push(chave);
    }
    if (atual !== undefined && legado !== undefined && atual !== legado) {
      conflitantes.push(nome);
      return false;
    }
    return (atual ?? legado) === 'true';
  };

  const recursosCondicionados = Object.keys(AUTORIZACOES) as (keyof typeof AUTORIZACOES)[];
  const autorizacoes = {
    emergenciaGps: AUTORIZACOES.emergenciaGps.map(ler).every(Boolean),
    confirmacaoAutomatica: AUTORIZACOES.confirmacaoAutomatica.map(ler).every(Boolean),
    retencaoGpsCheckpoints: AUTORIZACOES.retencaoGpsCheckpoints.map(ler).every(Boolean),
    retencaoGpsIntermediarios: AUTORIZACOES.retencaoGpsIntermediarios.map(ler).every(Boolean),
    retencaoExterna: AUTORIZACOES.retencaoExterna.map(ler).every(Boolean),
  };
  const flags = Object.fromEntries(RECURSOS.map((recurso) => [recurso, ler(VARIAVEIS_RECURSOS_OPERACIONAIS[recurso])])) as Record<RecursoOperacional, boolean>;

  for (const recurso of recursosCondicionados) {
    const dependencias: readonly RecursoOperacional[] = recurso in DEPENDENCIAS
      ? DEPENDENCIAS[recurso as keyof typeof DEPENDENCIAS] : [];
    if (flags[recurso] && (!autorizacoes[recurso] || dependencias.some((item) => !flags[item]))) {
      bloqueadas.push(recurso);
      flags[recurso] = false;
    }
  }
  return { flags: Object.freeze(flags), diagnostico: { invalidas, conflitantes, bloqueadas } };
}

// A política assumida na saída deve vir do registro persistido e autorizado, nunca da requisição.
type RecursoDeViagem = 'multiplasParadas' | 'mapasSvo' | 'gpsObrigatorio' | 'capturaPeriodica';

type PoliticaOperacionalViagem = Readonly<Record<RecursoDeViagem, boolean>>;
const POLITICA_LEGADA: PoliticaOperacionalViagem = Object.freeze({
  multiplasParadas: false, mapasSvo: false, gpsObrigatorio: false, capturaPeriodica: false,
});

export function politicaOperacionalViagem(
  flags: FlagsOperacionais,
  situacao:
    | { estado: 'nova' }
    | { estado: 'legada' }
    | { estado: 'emAndamento'; politicaNaSaida: PoliticaOperacionalViagem },
): PoliticaOperacionalViagem {
  if (situacao.estado === 'emAndamento') return Object.freeze({ ...situacao.politicaNaSaida });
  if (situacao.estado === 'legada') return POLITICA_LEGADA;
  return Object.freeze({
    multiplasParadas: flags.multiplasParadas,
    mapasSvo: flags.mapasSvo,
    gpsObrigatorio: flags.gpsObrigatorio,
    capturaPeriodica: flags.capturaPeriodica,
  });
}
