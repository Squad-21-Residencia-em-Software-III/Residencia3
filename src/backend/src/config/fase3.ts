export const VARIAVEIS_FASE3 = {
  mapasInternos: 'FASE3_MAPAS_INTERNOS',
  multiplasParadas: 'FASE3_MULTIPLAS_PARADAS',
  mapasSvo: 'FASE3_MAPAS_SVO',
  portalSvo: 'FASE3_PORTAL_SVO',
  acompanhamentoExterno: 'FASE3_ACOMPANHAMENTO_EXTERNO',
  gpsObrigatorio: 'FASE3_GPS_OBRIGATORIO',
  emergenciaGps: 'FASE3_EMERGENCIA_GPS',
  capturaPeriodica: 'FASE3_CAPTURA_PERIODICA',
  confirmacaoAutomatica: 'FASE3_CONFIRMACAO_AUTOMATICA',
  retencaoGps: 'FASE3_RETENCAO_GPS',
  retencaoExterna: 'FASE3_RETENCAO_EXTERNA',
} as const;

export type RecursoFase3 = keyof typeof VARIAVEIS_FASE3;
export type FlagsFase3 = Readonly<Record<RecursoFase3, boolean>>;
const RECURSOS = Object.keys(VARIAVEIS_FASE3) as RecursoFase3[];

const AUTORIZACOES = {
  emergenciaGps: ['FASE3_EMERGENCIA_GPS_AUTORIZADA'],
  confirmacaoAutomatica: ['FASE3_PARAMETROS_CONFIRMACAO_HOMOLOGADOS'],
  retencaoGps: ['FASE3_RETENCAO_GPS_INVENTARIO_VALIDADO', 'FASE3_RETENCAO_GPS_SIMULACAO_VALIDADA', 'FASE3_RETENCAO_GPS_AUTORIZADA'],
  retencaoExterna: ['FASE3_RETENCAO_EXTERNA_INVENTARIO_VALIDADO', 'FASE3_RETENCAO_EXTERNA_SIMULACAO_VALIDADA', 'FASE3_RETENCAO_EXTERNA_AUTORIZADA'],
} as const;

const DEPENDENCIAS = {
  emergenciaGps: ['gpsObrigatorio'],
  confirmacaoAutomatica: ['multiplasParadas', 'capturaPeriodica'],
} as const;

export function carregarFase3(origem: Record<string, string | undefined>) {
  const invalidas: string[] = [];
  const bloqueadas: RecursoFase3[] = [];
  const ler = (nome: string) => {
    const valor = origem[nome];
    if (valor !== undefined && valor !== '' && valor !== 'true' && valor !== 'false') invalidas.push(nome);
    return valor === 'true';
  };

  const autorizacoes = {
    emergenciaGps: AUTORIZACOES.emergenciaGps.map(ler).every(Boolean),
    confirmacaoAutomatica: AUTORIZACOES.confirmacaoAutomatica.map(ler).every(Boolean),
    retencaoGps: AUTORIZACOES.retencaoGps.map(ler).every(Boolean),
    retencaoExterna: AUTORIZACOES.retencaoExterna.map(ler).every(Boolean),
  };
  const flags = Object.fromEntries(RECURSOS.map((recurso) => [recurso, ler(VARIAVEIS_FASE3[recurso])])) as Record<RecursoFase3, boolean>;

  for (const recurso of ['emergenciaGps', 'confirmacaoAutomatica', 'retencaoGps', 'retencaoExterna'] as const) {
    const dependencias: readonly RecursoFase3[] = recurso in DEPENDENCIAS
      ? DEPENDENCIAS[recurso as keyof typeof DEPENDENCIAS] : [];
    if (flags[recurso] && (!autorizacoes[recurso] || dependencias.some((item) => !flags[item]))) {
      bloqueadas.push(recurso);
      flags[recurso] = false;
    }
  }
  return { flags: Object.freeze(flags), diagnostico: { invalidas, bloqueadas } };
}

// A política assumida na saída deve vir do registro persistido e autorizado, nunca da requisição.
type RecursoDeViagem = 'multiplasParadas' | 'mapasSvo' | 'gpsObrigatorio' | 'capturaPeriodica';

export function politicaViagemFase3(
  flags: FlagsFase3,
  situacao: { estado: 'nova' } | { estado: 'emAndamento'; politicaNaSaida: Readonly<Record<RecursoDeViagem, boolean>> },
): Readonly<Record<RecursoDeViagem, boolean>> {
  if (situacao.estado === 'emAndamento') return situacao.politicaNaSaida;
  return {
    multiplasParadas: flags.multiplasParadas,
    mapasSvo: flags.mapasSvo,
    gpsObrigatorio: flags.gpsObrigatorio,
    capturaPeriodica: flags.capturaPeriodica,
  };
}
