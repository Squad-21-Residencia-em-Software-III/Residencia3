import type {
  BlocoAgendaDia,
  CelulaMesAgenda,
  DiaAgendaSemana,
  LinhaRecursoAgenda,
} from '../types/agenda';
import type { Veiculo } from '../types/veiculo';
import type { Viagem } from '../types/viagem';

const NOMES_DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export function formatarDataIso(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function parseDataIsoLocal(dataIso: string): Date {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return new Date(ano, (mes || 1) - 1, dia || 1, 0, 0, 0, 0);
}

export function adicionarDias(dataIso: string, dias: number): string {
  const data = parseDataIsoLocal(dataIso);
  data.setDate(data.getDate() + dias);
  return formatarDataIso(data);
}

export function adicionarMeses(dataIso: string, meses: number): string {
  const original = parseDataIsoLocal(dataIso);
  const diaOriginal = original.getDate();
  const alvo = new Date(original.getFullYear(), original.getMonth() + meses, 1);
  const ultimoDiaDoMes = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(diaOriginal, ultimoDiaDoMes));
  return formatarDataIso(alvo);
}

function capitalizarPrimeiraLetra(texto: string): string {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function formatarTituloDia(dataIso: string): string {
  const data = parseDataIsoLocal(dataIso);
  const formatado = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(data);
  return capitalizarPrimeiraLetra(formatado);
}

export function formatarTituloMes(dataIso: string): string {
  const data = parseDataIsoLocal(dataIso);
  const formatado = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(data);
  return capitalizarPrimeiraLetra(formatado);
}

export function formatarTituloSemana(dias: DiaAgendaSemana[]): string {
  if (dias.length === 0) return '';
  const primeiro = parseDataIsoLocal(dias[0].data);
  const ultimo = parseDataIsoLocal(dias[dias.length - 1].data);
  const mesmoMes = primeiro.getMonth() === ultimo.getMonth();
  const fmtMesCurto = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d).replace('.', '');

  if (mesmoMes) {
    return `${primeiro.getDate()} a ${ultimo.getDate()} de ${fmtMesCurto(ultimo)} de ${ultimo.getFullYear()}`;
  }
  return `${primeiro.getDate()} ${fmtMesCurto(primeiro)} a ${ultimo.getDate()} ${fmtMesCurto(ultimo)} de ${ultimo.getFullYear()}`;
}

export function obterDiasSemana(dataIso: string, hojeIso: string): DiaAgendaSemana[] {
  const referencia = parseDataIsoLocal(dataIso);
  // Segunda-feira como início da semana (0 = Seg ... 6 = Dom)
  const deslocamentoSegunda = (referencia.getDay() + 6) % 7;
  const segunda = new Date(referencia);
  segunda.setDate(referencia.getDate() - deslocamentoSegunda);

  return Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(segunda);
    dia.setDate(segunda.getDate() + i);
    const iso = formatarDataIso(dia);
    return {
      data: iso,
      label: NOMES_DIAS_CURTOS[dia.getDay()],
      diaNumero: dia.getDate(),
      ehHoje: iso === hojeIso,
    };
  });
}

function formatarHoraMinuto(data: Date): string {
  const h = String(data.getHours()).padStart(2, '0');
  const m = String(data.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function obterIntervaloViagem(
  viagem: Viagem,
): { inicio: Date; fim: Date; semPrevisaoFim: boolean } | null {
  const inicioBruto = viagem.data_hora_efetiva_saida ?? viagem.inicio_previsto;
  if (!inicioBruto) return null;

  const inicio = new Date(inicioBruto);
  if (Number.isNaN(inicio.getTime())) return null;

  const fimBruto = viagem.data_hora_efetiva_chegada ?? viagem.fim_previsto;
  if (fimBruto) {
    const fim = new Date(fimBruto);
    if (!Number.isNaN(fim.getTime()) && fim.getTime() > inicio.getTime()) {
      return { inicio, fim, semPrevisaoFim: false };
    }
  }

  // Quando fim_previsto for null (ex.: ordens SVO), estende até o final do mesmo dia (23:59)
  const fimDoDia = new Date(
    inicio.getFullYear(),
    inicio.getMonth(),
    inicio.getDate(),
    23,
    59,
    59,
    999,
  );
  return { inicio, fim: fimDoDia, semPrevisaoFim: true };
}

export function projetarViagensNoDia(viagens: Viagem[], dataIso: string): BlocoAgendaDia[] {
  const inicioDia = parseDataIsoLocal(dataIso);
  const fimDia = new Date(inicioDia);
  fimDia.setDate(inicioDia.getDate() + 1);

  const inicioDiaMs = inicioDia.getTime();
  const fimDiaMs = fimDia.getTime();

  const blocos: BlocoAgendaDia[] = [];

  for (const viagem of viagens) {
    const intervalo = obterIntervaloViagem(viagem);
    if (!intervalo) continue;

    const inicioMs = intervalo.inicio.getTime();
    const fimMs = intervalo.fim.getTime();

    if (inicioMs >= fimDiaMs || fimMs <= inicioDiaMs) continue;

    const inicioClamped = new Date(Math.max(inicioMs, inicioDiaMs));
    const fimClampedMs = Math.min(fimMs, fimDiaMs);

    const inicioMin = Math.floor((inicioClamped.getTime() - inicioDiaMs) / 60_000);
    const fimMin = Math.max(
      inicioMin + 15,
      Math.ceil((fimClampedMs - inicioDiaMs) / 60_000),
    );

    const fimLabel =
      fimClampedMs >= fimDiaMs - 60_000
        ? '23:59'
        : formatarHoraMinuto(new Date(fimClampedMs));

    blocos.push({
      chave: `${viagem.tipo_operacao}-${viagem.id}`,
      data: dataIso,
      viagem,
      inicioMin: Math.min(inicioMin, 1440),
      fimMin: Math.min(fimMin, 1440),
      horaInicioLabel: formatarHoraMinuto(inicioClamped),
      horaFimLabel: fimLabel,
      semPrevisaoFim: intervalo.semPrevisaoFim,
    });
  }

  return blocos;
}

export function obterGradeMes(
  ano: number,
  mesZeroBased: number,
  viagens: Viagem[],
  hojeIso: string,
): { offsetInicial: number; celulas: CelulaMesAgenda[] } {
  const primeiroDia = new Date(ano, mesZeroBased, 1);
  const offsetInicial = (primeiroDia.getDay() + 6) % 7;
  const totalDias = new Date(ano, mesZeroBased + 1, 0).getDate();

  const celulas: CelulaMesAgenda[] = [];
  for (let dia = 1; dia <= totalDias; dia++) {
    const dataIso = formatarDataIso(new Date(ano, mesZeroBased, dia));
    const totalViagens = projetarViagensNoDia(viagens, dataIso).length;
    celulas.push({
      dia,
      dataIso,
      ehHoje: dataIso === hojeIso,
      ehPassado: dataIso < hojeIso,
      totalViagens,
    });
  }

  return { offsetInicial, celulas };
}

export function agruparRecursosAgenda(
  veiculos: Veiculo[],
  blocos: BlocoAgendaDia[],
): LinhaRecursoAgenda[] {
  const mapa = new Map<number, LinhaRecursoAgenda>();

  for (const v of veiculos) {
    mapa.set(v.id, {
      id: v.id,
      modelo: v.modelo,
      placa: v.placa,
      tipoFrota: v.tipo_frota,
      statusVeiculo: v.status,
      blocos: [],
    });
  }

  for (const bloco of blocos) {
    const { veiculo_id, veiculo_modelo, veiculo_placa } = bloco.viagem;
    if (!mapa.has(veiculo_id)) {
      mapa.set(veiculo_id, {
        id: veiculo_id,
        modelo: veiculo_modelo,
        placa: veiculo_placa,
        blocos: [],
      });
    }
    mapa.get(veiculo_id)!.blocos.push(bloco);
  }

  return Array.from(mapa.values());
}

export function obterResumoTrajeto(viagem: Viagem): string {
  const destino = (viagem.destino ?? 'Local não informado').split(' - ')[0];
  if (!viagem.origem) {
    return `Coleta SVO → ${destino}`;
  }
  const origem = viagem.origem.split(' - ')[0];
  return `${origem} → ${destino}`;
}
